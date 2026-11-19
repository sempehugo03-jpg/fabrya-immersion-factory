"""Local structured inference through a loopback llama.cpp server."""
import json
from urllib.parse import urlsplit

from .contracts import Rejected, validate
from .runtime import request_json


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
        # CPU-only structured decoding can take several minutes on the benchmark host.
        result = request_json(url.rstrip("/") + "/v1/chat/completions", headers={}, timeout=900, payload={
            "model": model, "stream": False, "temperature": .55, "seed": 19,
            "max_tokens": 3300,
            "messages": [{"role": "system", "content": instructions},
                         {"role": "user", "content": user_prompt}],
            "response_format": {"type": "json_schema", "json_schema":
                                {"name": stage, "strict": True, "schema": schema}},
        })
        run.record("model_inference", "completed", provider="local_llama_cpp",
                   model=result.get("model", model), request_id=result.get("id"),
                   usage=result.get("usage"), charged_microusd=0)
        response = result["choices"][0]
        if response["finish_reason"] != "stop":
            raise Rejected("Local model did not complete its structured response")
        output = json.loads(response["message"]["content"])
        validate(schema, output)
        return output
    return speak
