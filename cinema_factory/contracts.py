"""Contracts shared by the creative agent, validators and renderer."""
from urllib.parse import urlsplit

STR = {"type": "string"}
INT = {"type": "integer"}
NUM = {"type": "number"}


def choice(*values):
    return {"type": "string", "enum": list(values)}


def array(items):
    return {"type": "array", "items": items}


def record(**fields):
    return {
        "type": "object", "properties": fields, "required": list(fields),
        "additionalProperties": False,
    }


PLAN = record(
    brand=STR, audience=STR, goal=STR, facts=array(STR), unknowns=array(STR),
    concepts=array(record(name=STR, entry=STR, discovery=STR, tradeoff=STR)),
    selected=INT, rationale=STR, visual_bible=STR, description=STR,
    shots=array(record(
        route=STR, asset_id=STR, seconds=INT, trim_start=NUM,
        resolution=choice("720p", "1080p", "2160p"),
        movement=STR, video_prompt=STR, reference_prompt=STR,
        raccord=STR, rationale=STR,
    )),
    mobile_center=NUM,
    actions=array(record(id=STR, label=STR, heading=STR, body=STR, destination_id=STR)),
    hotspots=array(record(action_id=STR, shot=INT, start=NUM, end=NUM, x=NUM, y=NUM)),
)

AXES = (
    "photoréalisme", "composition", "cohérence des objets", "stabilité temporelle",
    "continuité des plans", "mouvement spatial", "netteté", "pertinence commerciale",
)
REVIEW = record(
    axes=array(record(axis=choice(*AXES), grade=choice("PASS", "REVISE", "UNVERIFIED"),
                      evidence=STR, fix=STR)),
    limitations=array(STR),
)


class Blocked(Exception):
    """The run has a known missing prerequisite."""


class Rejected(Exception):
    """An output did not satisfy a required contract."""


def validate(schema, value, path="contract"):
    kind = schema["type"]
    types = {"object": (dict,), "array": (list,), "string": (str,),
             "integer": (int,), "number": (int, float)}
    if type(value) not in types[kind]:
        raise Rejected(f"{path}: expected {kind}")
    if "enum" in schema and value not in schema["enum"]:
        raise Rejected(f"{path}: unknown option")
    if kind == "object":
        if value.keys() != schema["properties"].keys():
            raise Rejected(f"{path}: unexpected or missing fields")
        for key, child in schema["properties"].items():
            validate(child, value[key], f"{path}.{key}")
    if kind == "array":
        if not schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", len(value)):
            raise Rejected(f"{path}: invalid list size")
        for index, item in enumerate(value):
            validate(schema["items"], item, f"{path}[{index}]")


def validate_plan(plan, routes, assets, destinations, *, allow_generated_trim=False):
    validate(PLAN, plan)
    concepts = plan["concepts"]
    if not 2 <= len(concepts) <= 5 or not 0 <= plan["selected"] < len(concepts):
        raise Rejected("Select one of two to five creative concepts")
    if len({item["entry"].strip().casefold() for item in concepts}) != len(concepts):
        raise Rejected("The concepts need distinct starting points")
    if any(not item[key].strip() for item in concepts for key in item):
        raise Rejected("Each concept needs a complete creative rationale")
    for field in ("brand", "audience", "goal", "rationale", "visual_bible", "description"):
        if not plan[field].strip():
            raise Rejected(f"Missing creative decision: {field}")
    shots = plan["shots"]
    if not 1 <= len(shots) <= 4 or sum(s["seconds"] for s in shots) > 24:
        raise Rejected("The current player profile supports one to four shots, up to 24 seconds")
    for shot in shots:
        route = routes.get(shot["route"])
        if not route or shot["resolution"] not in route["resolutions"]:
            raise Rejected("Shot selected an unavailable route or resolution")
        if not route["minimum"] <= shot["seconds"] <= route["maximum"]:
            raise Rejected("Duration falls outside the selected route")
        if not all(shot[k].strip() for k in ("movement", "raccord", "rationale")):
            raise Rejected("Every shot requires motion, continuity and strategy decisions")
        if shot["route"] == "client":
            if shot["asset_id"] not in assets or not 0 <= shot["trim_start"] <= 3600:
                raise Rejected("Client footage must be declared with valid in/out points")
        elif shot["asset_id"] or not 0 <= shot["trim_start"] <= 24 or (
            shot["trim_start"] != 0 and not allow_generated_trim
        ):
            raise Rejected("Generated shots require a prompt and no client trim or asset ID")
        if shot["route"] != "client":
            from .prompting import check_prompt
            check_prompt(shot["route"], shot["video_prompt"])
        if shot["route"] == "fal-reference" and not shot["reference_prompt"].strip():
            raise Rejected("The reference-to-video route requires a reference prompt")
    if not 0 <= plan["mobile_center"] <= 1:
        raise Rejected("Mobile crop center must be normalized")
    ids = validate_actions(plan["actions"], destinations)
    if not 1 <= len(plan["hotspots"]) <= 8:
        raise Rejected("Provide one to eight synchronized interactions")
    intervals = []
    for point in plan["hotspots"]:
        index = point["shot"]
        if point["action_id"] not in ids or not 0 <= index < len(shots):
            raise Rejected("Hotspot refers to an unknown action or shot")
        if not 0 <= point["start"] < point["end"] <= shots[index]["seconds"]:
            raise Rejected("Hotspot times must be relative to the selected shot")
        if point["end"] - point["start"] < .2 or not all(.07 <= point[k] <= .93 for k in ("x", "y")):
            raise Rejected("Hotspots need a usable duration and safe coordinates")
        if any(i == index and start < point["end"] and point["start"] < end
               for i, start, end in intervals):
            raise Rejected("Consecutive hotspots must not overlap")
        intervals.append((index, point["start"], point["end"]))


def validate_actions(actions, destinations):
    ids = {a["id"] for a in actions}
    if not 1 <= len(actions) <= 4 or len(ids) != len(actions) or "" in ids:
        raise Rejected("Provide one to four uniquely identified business actions")
    for action in actions:
        if not all(action[k].strip() for k in ("label", "heading", "body")):
            raise Rejected("Business actions require a label, heading and useful content")
        if action["destination_id"] and action["destination_id"] not in destinations:
            raise Rejected("Action references a destination absent from trusted configuration")
    return ids


def validate_destination(url):
    if any(ord(char) <= 32 or char == "\\" for char in url):
        raise Rejected("Invalid destination characters")
    parts = urlsplit(url)
    if parts.scheme == "https" and parts.hostname and not parts.username and not parts.password:
        return
    if parts.scheme in {"mailto", "tel"} and parts.path and not parts.netloc:
        return
    raise Rejected("Destinations require trusted HTTPS, mailto or tel URLs")
