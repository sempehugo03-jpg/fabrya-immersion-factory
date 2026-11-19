"""Use the original exploration pipeline with post-decode schema validation."""
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cinema_factory import __main__ as cli
from cinema_factory.contracts import Rejected, validate
from cinema_factory.runtime import request_json, write_json


def local_json_speaker(url, model):
    def speak(run, stage, instructions, schema, content):
        stage_request = {
            "model": model, "stream": False, "temperature": .32, "seed": 19,
            "max_tokens": 2700,
            "messages": [
                {"role": "system", "content": instructions + "\nRéponds uniquement avec un objet JSON valide et compact conforme à ce schéma JSON. Évite les espaces de mise en forme.\n" + json.dumps(schema, ensure_ascii=False, separators=(",", ":"))},
                {"role": "user", "content": "\n".join(item["text"] for item in content)},
            ],
            "response_format": {"type": "json_object"},
        }
        wire = run.directory / f"{stage}-transport-request.json"
        for attempt, seed in enumerate((19, 23, 29), 1):
            stage_request["seed"] = seed
            write_json(wire.with_name(f"{wire.stem}-{attempt}.json"), stage_request)
            result = request_json(url.rstrip("/") + "/v1/chat/completions", headers={}, timeout=480,
                                  payload=stage_request)
            write_json(wire.with_name(f"{stage}-transport-response-{attempt}.json"), result)
            run.record("model_inference", "completed", provider="local_llama_cpp", model=model,
                       request_id=result.get("id"), usage=result.get("usage"), charged_microusd=0)
            completion = result["choices"][0]
            try:
                if completion["finish_reason"] != "stop":
                    raise Rejected("Local model did not complete the response")
                output = json.loads(completion["message"]["content"])
                validate(schema, output)
                return output
            except (ValueError, Rejected) as failure:
                run.record("local_schema_validation", "rejected", stage=stage, attempt=attempt,
                           reason=str(failure))
        raise Rejected("All local responses failed schema validation")
    return speak


if __name__ == "__main__":
    cli.local_speaker = local_json_speaker
    os.chdir(Path(__file__).resolve().parents[1])
    raise SystemExit(cli.main())
