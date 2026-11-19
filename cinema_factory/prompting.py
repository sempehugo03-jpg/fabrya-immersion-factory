"""Compile direction into the verified, deliberately narrow provider contracts."""
import re
from urllib.parse import urlsplit

from .contracts import Rejected

LIMITS = {"fal-text": 26_000, "fal-reference": 26_000, "runway-text": 1_000}
ENDPOINTS = {
    "fal-text": "kling/v4/text-to-video",
    "fal-reference": "kling/v4/image-to-video",
    "runway-text": "gen4.5",
}
# The player supports at most 24 seconds even though Kling accepts up to 30.
MODES = {
    "fal-text": (3, 24, ("720p", "1080p")),
    "fal-reference": (3, 24, ("720p", "1080p")),
    "runway-text": (2, 10, ("720p",)),
}
ASSET_MARKER = re.compile(r"@(image|video|element|audio)\d+\b", re.I)
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
    if ASSET_MARKER.search(prompt):
        raise Rejected("The selected route does not bind numbered provider reference tokens")
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


def production_spec(shot):
    route = shot["route"]
    if route not in MODES:
        raise Rejected("No verified video adapter for this route")
    minimum, maximum, resolutions = MODES[route]
    duration = shot["seconds"]
    if type(duration) is not int or not minimum <= duration <= maximum or shot["resolution"] not in resolutions:
        raise Rejected("Video duration or resolution is outside the verified adapter")
    check_prompt(route, shot["video_prompt"])
    return {"endpoint": ENDPOINTS[route], "duration": duration, "resolution": shot["resolution"],
            "needs_start_image": route == "fal-reference"}


def video_request(shot, reference_url=None):
    spec = production_spec(shot)
    route = shot["route"]
    prompt = shot["video_prompt"]
    if reference_url and not spec["needs_start_image"]:
        raise Rejected("Unexpected start image on a text-only route")
    if route == "runway-text":
        return ENDPOINTS[route], {
            "model": ENDPOINTS[route], "promptText": prompt,
            "ratio": "1280:720", "duration": shot["seconds"],
        }
    payload = {"prompt": prompt, "resolution": shot["resolution"], "duration": shot["seconds"]}
    if route == "fal-text":
        payload["aspect_ratio"] = "16:9"
    elif route == "fal-reference" and reference_url:
        locator = urlsplit(reference_url)
        if locator.scheme != "https" or not locator.hostname or locator.username or locator.password:
            raise Rejected("Kling image-to-video requires an authorized HTTPS source")
        payload["start_image_url"] = reference_url
    else:
        raise Rejected("Kling image-to-video needs a verified start reference")
    return ENDPOINTS[route], payload
