"""Resume the model's recorded choice after a serialization omission."""
import hashlib
import json
import os
import re
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

from cinema_factory.__main__ import launch_exploration
from cinema_factory.contracts import Rejected, choice
from cinema_factory.local_model import local_speaker
from cinema_factory.runtime import Run, write_json

root = Path(os.environ["FABRYA_RUN_DIRECTORY"])
prior = Path(os.environ["FABRYA_PREVIOUS_EXECUTION"]) / "exploration"
run = Run(root / "exploration", 0)
args = Namespace(brief=root / "brief.txt", history=[], assets=None, no_divergence=True,
                 local_url="http://127.0.0.1:18821", local_model=os.environ["FABRYA_LOCAL_MODEL"],
                 production_cap_microusd=0)
real_speaker = local_speaker(args.local_url, args.local_model)


def recorded_speaker(run, stage, instructions, schema, content):
    if stage not in {"unrestricted_exploration", "artistic_selection"}:
        print("Inference:", stage, flush=True)
        if stage == "unrestricted_realization":
            exact_brief = (root / "brief.txt").read_text().strip()
            schema = {
                **schema, "properties": {
                    **schema["properties"],
                    "confirmed_facts": {"type": "array", "items": choice("horloger", exact_brief)},
                },
            }
        return real_speaker(run, stage, instructions, schema, content)
    request = json.loads((prior / f"{stage}-request.json").read_text())
    if request["instructions"] != instructions or request["input"] != content:
        raise Rejected("Stored decisions cannot be used with a different brief or instruction")
    source = prior / f"{stage}.json"
    value = json.loads(source.read_text())
    decision = "reuse_exact"
    if stage == "artistic_selection":
        # The model's only group's own evidence explicitly identifies both ideas
        # as sharing the same mechanism. Restore its omitted member identifier.
        current = set(json.loads(content[0]["text"])["concepts"])
        if len(value["groups"]) != 1 or value["needs_divergence"] != "no":
            raise Rejected("Recorded model decision differs from the recoverable case")
        group = value["groups"][0]
        stated = set(re.findall(r"\bidea-[0-9]+\b", group["evidence"]))
        if stated != current or "partagent le même mécanisme" not in group["evidence"]:
            raise Rejected("Cannot prove the omitted identifier from the model's own words")
        group["members"] = sorted(stated)
        decision = "restore_explicit_member_ids_from_model_evidence"
    write_json(run.directory / f"{stage}-reuse.json", {
        "prior_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "operation": decision, "same_brief_and_instructions": True,
        "selected_concept": value.get("selected"),
    })
    return value


with patch("cinema_factory.__main__.local_speaker", return_value=recorded_speaker):
    launch_exploration(args, run)
