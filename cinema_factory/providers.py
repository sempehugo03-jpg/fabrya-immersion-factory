"""Model selection inventory and real HTTP adapters."""
from hashlib import sha256
import json
import os
import re
import time
from urllib.parse import urlsplit

from .contracts import Blocked, Rejected, validate
from .runtime import download, request_json
from .prompting import production_spec, video_request

MODEL = "gpt-6.1-sol"
REASONING_RESERVATION = 64_000 * 5 + 8_000 * 10
FAL = "https://queue.fal.run"
RUNWAY = "https://api.dev.runwayml.com"
OPENAI = "https://api.openai.com/v1/responses"
ROUTES = {
    "client": dict(resolutions=["720p", "1080p", "2160p"], minimum=1, maximum=24,
                   strategy="trim authorized real footage", usd_per_second={}),
    "fal-text": dict(resolutions=["720p", "1080p"], minimum=3, maximum=24,
                     strategy="Kling v4 single film shot from text",
                     usd_per_second={"720p": .157, "1080p": .235}),
    "fal-reference": dict(resolutions=["720p", "1080p"], minimum=3, maximum=24,
                          strategy="FLUX reference and Kling v4 image-to-video",
                          usd_per_second={"720p": .157, "1080p": .235},
                          reference_usd=.003),
    "runway-text": dict(resolutions=["720p"], minimum=2, maximum=10,
                        strategy="Runway Gen-4.5 single film shot from text",
                        usd_per_second={"720p": .12}),
}
# Snapshot 2026-11-19. Round in integer microdollars and never retry a POST.
VIDEO_RATES = {
    (route, resolution): round(rate * 1_000_000)
    for route, spec in ROUTES.items() for resolution, rate in spec["usd_per_second"].items()
}
REFERENCE = 3_000


def routes_for(assets, cap):
    routes = {"client": ROUTES["client"]} if assets else {}
    if cap > 0 and os.getenv("FAL_KEY", "").strip():
        routes.update({route: ROUTES[route] for route in ("fal-text", "fal-reference")})
    if cap > 0 and os.getenv("RUNWAYML_API_SECRET", "").strip():
        routes["runway-text"] = ROUTES["runway-text"]
    return routes


def speak(run, stage, instructions, schema, content):
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise Blocked("OPENAI_API_KEY absent from the execution runtime")
    # Bound text by UTF-8 bytes and vision to 20 downscaled images per request.
    text_bytes = len(instructions.encode()) + sum(
        len(item["text"].encode()) for item in content if item["type"] == "input_text"
    )
    images = sum(item["type"] == "input_image" for item in content)
    if text_bytes > 24_000 or images > 20:
        raise Rejected("Creative or inspection input exceeds the configured envelope")
    ledger = run.reserve("openai", stage, REASONING_RESERVATION)
    result = request_json(OPENAI, headers={"Authorization": f"Bearer {key}"}, payload={
        "model": MODEL, "instructions": instructions, "store": False, "max_output_tokens": 8_000,
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"name": stage, "type": "json_schema", "strict": True, "schema": schema}},
    })
    usage = result.get("usage")
    if not usage:
        raise Blocked("OpenAI did not report token usage")
    detail = usage.get("input_tokens_details") or {}
    cached = detail.get("cached_tokens", 0) or 0
    writes = detail.get("cache_write_tokens_details") or {}
    short_writes = writes.get("ttl_30m_tokens", 0) or 0
    long_writes = writes.get("ttl_12h_tokens", 0) or 0
    uncached = max(0, usage["input_tokens"] - cached - short_writes - long_writes)
    # Round up in microdollars. A cache write replaces the normal input charge.
    price_tenths = (uncached * 20 + cached + short_writes * 25 + long_writes * 50
                   + usage["output_tokens"] * 100)
    run.settle(ledger, (price_tenths + 9) // 10,
               model=result["model"], request_id=result["id"], tokens=usage)
    output = [part["text"] for item in result.get("output", []) if item["type"] == "message"
              for part in item["content"] if part["type"] == "output_text"]
    if result.get("status") != "completed" or len(output) != 1:
        raise Rejected("OpenAI response was incomplete or refused")
    value = json.loads(output[0])
    validate(schema, value)
    return value


def planned_charge(shot):
    route = shot["route"]
    return (shot["seconds"] * VIDEO_RATES.get((route, shot["resolution"]), 0)
            + (REFERENCE if route == "fal-reference" else 0))


def queue_url(url):
    p = urlsplit(url)
    if p.scheme != "https" or p.netloc != "queue.fal.run" or not re.fullmatch(
        r"/[\w./-]+/requests/[\w-]+(?:/status)?", p.path
    ):
        raise Rejected("Unexpected fal queue URL")
    return url


def media_fingerprint(provider, endpoint, payload):
    return sha256(json.dumps([provider, endpoint, payload], sort_keys=True).encode()).hexdigest()

def fal_job(run, operation, endpoint, payload, estimate):
    key = os.environ["FAL_KEY"].strip()
    headers = {"Authorization": f"Key {key}"}
    charge = run.reserve("fal", operation, estimate, fingerprint=media_fingerprint("fal", endpoint, payload))
    result = request_json(f"{FAL}/{endpoint}", headers=headers, payload=payload)
    status, output = map(queue_url, (result["status_url"], result["response_url"]))
    charge.update(request_id=result["request_id"], endpoint=endpoint, status_url=status, response_url=output)
    run.save_costs()
    for _ in range(120):
        state = request_json(status, headers=headers, timeout=15)
        if state["status"] == "COMPLETED":
            if state.get("error"):
                raise Blocked("fal returned a failed request; see saved request ID")
            output_data = request_json(output, headers=headers)
            run.settle(charge, estimate, basis="published unit rate; invoice unverified")
            return output_data
        if state["status"] not in {"IN_QUEUE", "IN_PROGRESS"}:
            raise Blocked("Unexpected fal job state")
        time.sleep(5)
    raise Blocked("fal timed out; resume the saved request ID before any resubmission")


def runway_job(run, shot):
    key = os.environ["RUNWAYML_API_SECRET"].strip()
    headers = {"Authorization": f"Bearer {key}", "X-Runway-Version": "2024-11-06"}
    estimate = planned_charge(shot)
    endpoint, payload = video_request(shot)
    charge = run.reserve("runway", "video", estimate, fingerprint=media_fingerprint("runway", endpoint, payload))
    result = request_json(f"{RUNWAY}/v1/text_to_video", headers=headers, payload=payload)
    request_id = result["id"]
    if not re.fullmatch(r"[\w-]+", request_id):
        raise Rejected("Unexpected Runway task ID")
    charge.update(request_id=request_id, model="gen4.5")
    run.save_costs()
    for _ in range(120):
        state = request_json(f"{RUNWAY}/v1/tasks/{request_id}", headers=headers, timeout=15)
        if state["status"] == "SUCCEEDED":
            run.settle(charge, estimate, basis="published credit rate; invoice unverified")
            return state["output"][0]
        if state["status"] not in {"PENDING", "THROTTLED", "RUNNING"}:
            raise Blocked("Runway task failed; see saved task ID")
        time.sleep(5)
    raise Blocked("Runway timed out; inspect the saved task ID before any resubmission")


def produce(run, shot, target, references=None):
    production_spec(shot)
    route = shot["route"]
    if route == "runway-text":
        url = runway_job(run, shot)
        download(url, target, ("runwayml.com", "runwayml.cloud", "dnznrvs05pmza.cloudfront.net"))
        return
    reference = None
    if route == "fal-reference":
        references = references if references is not None else {}
        reference_prompt = shot["reference_prompt"]
        reference = references.get(reference_prompt)
        if reference is None:
            response = fal_job(run, "reference", "fal-ai/flux/schnell", {
                "prompt": reference_prompt, "image_size": {"width": 1280, "height": 720},
                "num_images": 1, "output_format": "jpeg",
            }, REFERENCE)
            if any(response.get("has_nsfw_concepts", [])):
                raise Rejected("fal did not produce an approved reference image")
            reference = response["images"][0]["url"]
            download(reference, target.with_suffix(".reference.jpg"), ("fal.media", "fal.ai"))
            references[reference_prompt] = reference
        else:
            run.record("reference", "reused", target=target.name)
    endpoint, payload = video_request(shot, reference)
    response = fal_job(run, "video", endpoint, payload, VIDEO_RATES[(route, shot["resolution"])] * shot["seconds"])
    download(response["video"]["url"], target, ("fal.media", "fal.ai"))
