"""Local structured inference through a loopback llama.cpp server."""
import json
from urllib.parse import urlsplit

from .contracts import Rejected, validate
from urllib.request import Request

from .runtime import OPENER, write_json


def receive_structured(url, payload, trace, schema):
    """Finish immediately on the first complete, contract-valid JSON response."""
    decoder = json.JSONDecoder()
    payload = {**payload, "stream": True}
    write_json(trace.with_name(trace.name + "-wire-request.json"), payload)
    request = Request(url, data=json.dumps(payload).encode(),
                      headers={"Content-Type": "application/json"})
    chunks = []
    metadata = {}
    try:
        with OPENER.open(request, timeout=900) as response:
            for event in response:
                if not event.startswith(b"data: "):
                    continue
                value = event[6:].strip()
                if value == b"[DONE]":
                    break
                packet = json.loads(value)
                metadata.update({key: packet[key] for key in ("id", "model", "usage") if key in packet})
                if not packet.get("choices"):
                    continue
                choice = packet["choices"][0]
                if choice.get("finish_reason"):
                    metadata["finish_reason"] = choice["finish_reason"]
                fragment = choice.get("delta", {}).get("content")
                if not fragment:
                    continue
                chunks.append(fragment)
                if "}" not in fragment:
                    continue
                candidate = "".join(chunks).lstrip()
                try:
                    output, end = decoder.raw_decode(candidate)
                    if candidate[end:].strip():
                        continue
                    validate(schema, output)
                except (json.JSONDecodeError, Rejected):
                    continue
                return output, metadata
        raise Rejected("Local structured response stopped before a complete contract")
    finally:
        write_json(trace.with_name(trace.name + "-wire-response.json"),
                   {"content": "".join(chunks), "metadata": metadata})



def local_speaker(url, model):
    base = urlsplit(url)
    if (base.scheme != "http" or base.hostname not in {"127.0.0.1", "localhost", "::1"}
            or base.username or base.password or base.path not in {"", "/"}
            or base.query or base.fragment or not model.strip()):
        raise Rejected("Local inference requires a plain loopback URL and a named model")

    def speak(run, stage, instructions, schema, content):
        if any(item["type"] == "input_image" for item in content):
            user_prompt = [
                {"type": "text", "text": item["text"]} if item["type"] == "input_text" else
                {"type": "image_url", "image_url": {"url": item["image_url"]}}
                for item in content
            ]
        else:
            user_prompt = "\n".join(item["text"] for item in content)
        schema_for_decoder = schema
        if stage.startswith("unrestricted_exploration"):
            # Keep list generation finite without prescribing a concept count or a mechanism.
            schema_for_decoder = {
                **schema, "properties": {
                    **schema["properties"],
                    "concepts": {**schema["properties"]["concepts"], "maxItems": 4},
                },
            }
        payload = {
            "model": model, "temperature": .5, "seed": 23,
            "max_tokens": 2000,
            "messages": [{"role": "system", "content": instructions},
                         {"role": "user", "content": user_prompt}],
            "response_format": {"type": "json_schema", "json_schema":
                                {"name": stage, "strict": True, "schema": schema_for_decoder}},
        }
        output, info = receive_structured(url.rstrip("/") + "/v1/chat/completions",
                                          payload, run.directory / stage, schema_for_decoder)
        run.record("model_inference", "completed", provider="local_llama_cpp",
                   model=info.get("model", model), request_id=info.get("id"),
                   usage=info.get("usage"), charged_microusd=0,
                   end="validated_json_object")
        return output
    return speak
