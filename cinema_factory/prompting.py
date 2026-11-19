"""Compile direction into the verified, deliberately narrow provider contracts."""
from .contracts import Rejected

LIMITS = {"fal-text": 26_000, "fal-reference": 26_000, "runway-text": 1_000}
ENDPOINTS = {
    "fal-text": "kling/v4/text-to-video",
    "fal-reference": "kling/v4/image-to-video",
    "runway-text": "gen4.5",
}
COMPACT_ORDER = (
    "intention", "subject", "composition", "camera", "subject_motion", "continuity",
    "setting", "light_materials", "constraints",
)
EXTENDED_ORDER = (
    "intention", "subject", "setting", "composition", "camera", "subject_motion",
    "light_materials", "continuity", "constraints",
)


def check_prompt(route, prompt):
    size = len(prompt.encode("utf-16-le")) // 2 if route == "runway-text" else len(prompt)
    if not prompt.strip() or size > LIMITS.get(route, 0):
        raise Rejected(f"Prompt for {route} exceeds its verified character contract")


def compile_prompt(route, direction, compact):
    if route == "client":
        return ""
    fields = COMPACT_ORDER if route == "runway-text" else EXTENDED_ORDER
    prompt = ". ".join(direction[key].strip().rstrip(". ") for key in fields) + "."
    if route == "runway-text" and len(prompt.encode("utf-16-le")) // 2 > LIMITS[route]:
        prompt = compact.strip()
    check_prompt(route, prompt)
    return prompt


def video_request(shot, reference_url=None):
    route = shot["route"]
    prompt = shot["video_prompt"]
    check_prompt(route, prompt)
    if route == "runway-text":
        return ENDPOINTS[route], {
            "model": ENDPOINTS[route], "promptText": prompt,
            "ratio": "1280:720", "duration": shot["seconds"],
        }
    payload = {"prompt": prompt, "resolution": shot["resolution"], "duration": shot["seconds"]}
    if route == "fal-text":
        payload["aspect_ratio"] = "16:9"
    elif route == "fal-reference" and reference_url:
        payload["start_image_url"] = reference_url
    else:
        raise Rejected("Kling image-to-video needs a verified start reference")
    return ENDPOINTS[route], payload
