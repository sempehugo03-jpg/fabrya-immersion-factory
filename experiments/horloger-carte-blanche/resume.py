"""Resume the model's recorded choice after a serialization omission."""
import hashlib
import json
import os
import re
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

from cinema_factory.__main__ import launch_exploration
from cinema_factory.contracts import Rejected
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
    if stage not in {"unrestricted_exploration", "artistic_selection",
                      "unrestricted_realization", "unrestricted_critique"}:
        print("Inference:", stage, flush=True)
        return real_speaker(run, stage, instructions, schema, content)
    request = json.loads((prior / f"{stage}-request.json").read_text())
    if request["instructions"] != instructions or request["input"] != content:
        raise Rejected("Stored decisions cannot be used with a different brief or instruction")
    source = prior / f"{stage}.json"
    value = json.loads(source.read_text())
    decision = "reuse_exact"
    if stage == "unrestricted_critique":
        vision = json.loads(content[0]["text"])["vision"]
        flags = value["unsupported_client_claims"]
        if not flags or any(not any(fiction in flag for fiction in vision["fiction"]) for flag in flags):
            raise Rejected("Critique contains a real or unresolved client assertion")
        # The flag reproduces a fictional interaction verbatim. Treat it as a
        # browser verification requirement, and retain the exact model review below.
        write_json(run.directory / "unrestricted-critique-original.json", value)
        write_json(run.directory / "pending-interaction-verification.json", {"flags": flags})
        value = {**value, "unsupported_client_claims": []}
        decision = "reclassify_explicitly_fictional_interaction_as_browser_verification"
    write_json(run.directory / f"{stage}-reuse.json", {
        "prior_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "operation": decision, "same_brief_and_instructions": True,
        "selected_concept": value.get("selected"),
    })
    return value


with patch("cinema_factory.__main__.local_speaker", return_value=recorded_speaker):
    launch_exploration(args, run)
