"""Use the original exploration pipeline with post-decode schema validation."""
import hashlib
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cinema_factory import __main__ as cli
from cinema_factory.contracts import Rejected, validate
from cinema_factory.runtime import request_json, write_json


def describe_shape(schema):
    if "enum" in schema:
        return " | ".join(json.dumps(value, ensure_ascii=False) for value in schema["enum"])
    if schema["type"] == "object":
        fields = (f"{name}: {describe_shape(value)}" for name, value in schema["properties"].items())
        return "{" + ", ".join(fields) + "}"
    if schema["type"] == "array":
        if schema.get("maxItems") == 0:
            return "[]"
        count = f" (au moins {schema['minItems']})" if "minItems" in schema else ""
        return "[" + describe_shape(schema["items"]) + "]" + count
    return schema["type"]


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def local_json_speaker(url, model):
    def speak(run, stage, instructions, schema, content):
        preserved = os.environ.get("FABRYA_REUSE_EXPLORATION")
        if stage == "unrestricted_exploration" and preserved:
            original = Path(preserved)
            request_name = f"{stage}-request.json"
            if (original / request_name).read_bytes() != (run.directory / request_name).read_bytes():
                raise Rejected("Preserved exploration request does not match")
            response_name = f"{stage}-transport-response-1.json"
            raw = (original / response_name).read_bytes()
            response = json.loads(raw)
            if response.get("model") != model:
                raise Rejected("Preserved exploration used a different model")
            output = json.loads(response["choices"][0]["message"]["content"])
            validate(schema, output)
            for name in (response_name, f"{stage}-transport-request-1.json"):
                (run.directory / name).write_bytes((original / name).read_bytes())
            run.record("model_inference", "replayed_verified_response", model=model,
                       response_sha256=hashlib.sha256(raw).hexdigest(), charged_microusd=0)
            return output
        stage_request = {
            "model": model, "stream": False, "temperature": .32, "seed": 19,
            "max_tokens": 1800,
            "messages": [
                {"role": "system", "content": instructions + "\nRéponds uniquement avec un objet JSON valide et compact conforme à ce schéma JSON. Évite les espaces de mise en forme.\n" + json.dumps(schema, ensure_ascii=False, separators=(",", ":"))},
                {"role": "user", "content": "\n".join(item["text"] for item in content)},
            ],
            "response_format": {"type": "json_object"},
        }
        wire = run.directory / f"{stage}-transport-request.json"
        fast = os.environ.get("FABRYA_FAST_JSON") == "1"
        shape = describe_shape(schema)
        previous_failure = ""
        for attempt, seed in enumerate((23, 29, 37), 1):
            if fast:
                stage_request.pop("response_format", None)
                guidance = (
                    "\nRetourne un objet JSON brut avec les valeurs demandées et les clés de la forme suivante."
                    " Les indications de type décrivent le format, elles ne sont pas des valeurs."
                    " Dans une liste, ferme chaque objet avant de commencer le suivant."
                    " Aucune clé ne doit se répéter dans un même objet. Aucun bloc Markdown.\n"
                )
                stage_request["messages"][0]["content"] = instructions + guidance + shape + previous_failure
            else:
                stage_request["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {"name": stage, "strict": True, "schema": schema},
                }
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
                raw_output = completion["message"]["content"].strip()
                if raw_output.startswith("```") and raw_output.endswith("```"):
                    raw_output = raw_output.split("\n", 1)[1].removesuffix("```").strip()
                output = json.loads(raw_output, object_pairs_hook=unique_fields)
                validate(schema, output)
                if stage.startswith("artistic_selection"):
                    expected = schema["properties"]["selected"]["enum"]
                    members = [member for group in output["groups"] for member in group["members"]]
                    if sorted(members) != sorted(expected):
                        raise Rejected("Selection groups must partition the current concept IDs")
                return output
            except (ValueError, Rejected) as failure:
                previous_failure = f"\nForme de la réponse précédente rejetée. Corrige la structure. Erreur : {failure}"
                run.record("local_schema_validation", "rejected", phase=stage, attempt=attempt,
                           reason=str(failure))
        raise Rejected("All local responses failed schema validation")
    return speak


if __name__ == "__main__":
    cli.local_speaker = local_json_speaker
    os.chdir(Path(__file__).resolve().parents[1])
    raise SystemExit(cli.main())
