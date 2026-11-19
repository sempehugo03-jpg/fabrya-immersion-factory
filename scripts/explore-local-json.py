"""Use the original exploration pipeline with post-decode schema validation."""
import copy
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
        checkpoint = os.environ.get("FABRYA_REUSE_EXPLORATION")
        frozen_stages = {
            "unrestricted_exploration", "artistic_selection", "unrestricted_exploration_divergence",
            "artistic_selection_divergence", "unrestricted_realization",
        }
        if checkpoint and stage in frozen_stages:
            original = Path(checkpoint)
            request_name = f"{stage}-request.json"
            if (original / request_name).read_bytes() != (run.directory / request_name).read_bytes():
                raise Rejected("Preserved stage request does not match")
            response_name = f"{stage}-transport-response-1.json"
            raw = (original / response_name).read_bytes()
            response = json.loads(raw)
            if response.get("model") != model:
                raise Rejected("Preserved stage used a different model")
            choice = response["choices"][0]
            if choice["finish_reason"] != "stop":
                raise Rejected("Preserved stage was incomplete")
            output = json.loads(choice["message"]["content"], object_pairs_hook=unique_fields)
            if stage == "artistic_selection_divergence":
                groups = {}
                for member, data in output.pop("assignments").items():
                    group = groups.setdefault(data["group"].strip(), {"members": [], "evidence": []})
                    group["members"].append(member)
                    group["evidence"].append(data["evidence"].strip())
                output["groups"] = [
                    {"members": group["members"], "evidence": " ".join(group["evidence"])}
                    for group in groups.values()
                ]
            validate(schema, output)
            if output != json.loads((original / f"{stage}.json").read_text()):
                raise Rejected("Preserved stage differs from its validated checkpoint")
            for name in (response_name, f"{stage}-transport-request-1.json"):
                (run.directory / name).write_bytes((original / name).read_bytes())
            run.record("model_inference", "replayed_verified_response", phase=stage, model=model,
                       response_sha256=hashlib.sha256(raw).hexdigest(), charged_microusd=0)
            print(f"{stage}: verified checkpoint", flush=True)
            if stage == "unrestricted_realization":
                write_json(run.directory / "realisation-originale-avant-controle-factuel.json", output)
                correction_schema = {
                    "type": "object",
                    "properties": {"confirmed_facts": {"type": "array", "maxItems": 1,
                        "items": {"type": "string", "enum": ["horloger"]}},
                        "reason": {"type": "string"}},
                    "required": ["confirmed_facts", "reason"], "additionalProperties": False,
                }
                correction_instructions = (
                    "Tu es FABRYA, auteur de cette vision. Le site demandé est une démonstration fictive. "
                    "Corrige uniquement le statut des affirmations présentées comme faits réels. "
                    "Les faits confirmés sont les citations littérales du brief qui décrivent réellement l'activité. "
                    "Préserve ta fiction, ta mise en scène, tes interactions et tes décisions. "
                    "Explique pourquoi les éléments retirés ne sont pas établis."
                )
                correction = speak(run, "factual_classification", correction_instructions, correction_schema,
                                   [{"type": "input_text", "text": json.dumps({
                                       "brief": json.loads(content[0]["text"])["brief"],
                                       "vision": output,
                                       "critique": json.loads((original / "unrestricted_critique.json").read_text()),
                                   }, ensure_ascii=False)}])
                write_json(run.directory / "factual_classification.json", correction)
                output = {**output, "confirmed_facts": correction["confirmed_facts"]}
            return output
        if stage == "unrestricted_critique":
            instructions += (
                "\nRègle factuelle de cette démonstration fictive. Exige une preuve pour une assertion "
                "présentée comme un fait réel et cite ce passage dans unsupported_client_claims. "
                "Les éléments déclarés fictifs et les informations demandées sous client_evidence_needed "
                "ne constituent pas des assertions réelles. Leur présence seule ne justifie pas ce champ."
            )
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
        assignment = stage.startswith("artistic_selection")
        wire_schema = copy.deepcopy(schema)
        if assignment:
            properties = wire_schema["properties"]
            member_value = {
                "type": "object",
                "properties": {"group": {"type": "string"}, "evidence": {"type": "string"}},
                "required": ["group", "evidence"], "additionalProperties": False,
            }
            expected_ids = properties["selected"]["enum"]
            properties.pop("groups")
            properties["assignments"] = {
                "type": "object", "properties": dict.fromkeys(expected_ids, member_value),
                "required": expected_ids, "additionalProperties": False,
            }
            wire_schema["required"] = [name for name in wire_schema["required"] if name != "groups"] + ["assignments"]
        shape = describe_shape(wire_schema)
        previous_failure = ""
        for attempt, seed in enumerate((23, 29, 37), 1):
            if fast or assignment:
                stage_request.pop("response_format", None)
                guidance = (
                    "\nRetourne un objet JSON brut avec les valeurs demandées et les clés de la forme suivante."
                    " Les indications de type décrivent le format, elles ne sont pas des valeurs."
                    " Dans une liste, ferme chaque objet avant de commencer le suivant."
                    " Aucune clé ne doit se répéter dans un même objet. Aucun bloc Markdown.\n"
                )
                if assignment:
                    guidance += (
                        "Représente tes groupes dans assignments sous la forme d'une entrée obligatoire pour chaque ID : "
                        + ", ".join(expected_ids)
                        + ". group contient le nom de groupe que tu attribues librement à cette piste."
                          " Deux pistes du même groupe ont exactement le même nom. evidence justifie cette affectation."
                          " Renseigne chaque ID, y compris les pistes écartées. selected est indépendant des groupes.\n"
                    )
                stage_request["messages"][0]["content"] = instructions + guidance + shape + previous_failure
            if not fast:
                stage_request["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {"name": stage, "strict": True, "schema": wire_schema},
                }
            stage_request["seed"] = seed
            print(f"{stage}: attempt {attempt}", flush=True)
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
                if assignment:
                    validate(wire_schema, output)
                    groups = {}
                    for member, data in output.pop("assignments").items():
                        name = data["group"].strip()
                        evidence = data["evidence"].strip()
                        if not name or not evidence:
                            raise Rejected("Every concept requires an explicit group and justification")
                        group = groups.setdefault(name, {"members": [], "evidence": []})
                        group["members"].append(member)
                        group["evidence"].append(evidence)
                    output["groups"] = [
                        {"members": group["members"], "evidence": " ".join(group["evidence"])}
                        for group in groups.values()
                    ]
                    run.record("local_schema_normalization", "completed", phase=stage,
                               operation="group_explicit_model_assignments")
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
