"""Ask FABRYA to repair the semantics of its visual controls without changing its interface."""
import argparse
import json
from pathlib import Path
import subprocess
from urllib.request import Request, urlopen


SYSTEM = """Tu es FABRYA. Corrige uniquement la fonction visuelle de ton propre configurateur.
Le code initial dessine la montre photoréaliste et déplace son image de quelques pixels. C'est un
défaut vérifiable : choisir Or doit changer l'apparence du matériau, choisir un bracelet doit changer
son apparence ou sa présence, modifier la couleur doit changer la teinte visible du cadran. Le type
de montre doit aussi se distinguer visuellement. Aucun simple déplacement d'image ne constitue un
changement de configuration. La composition, les couleurs exactes et la méthode restent tes décisions.
Ton seul livrable ici est une fonction JavaScript complète et synchrone
drawConfiguredWatch(ctx, img, {clockType, material, bracelet, color}, {width, height}).
ctx est un contexte 2D existant, img est l'image déjà chargée. Calcule un cadrage à l'échelle
du viewport et dessine le rendu depuis cette source. Préserve sa transparence. L'image d'origine
reste visible à l'ouverture. L'apparence est une simulation fictive. Aucune dépendance et aucun
texte, balisage ou appel externe. Retourne cette fonction seule, exécutable et concise."""


def main(args):
    args.output.mkdir(parents=True, exist_ok=True)
    context = {
        "brief": args.brief.read_text(),
        "dessin_initial": args.before.read_text(),
        "image": "watch.webp, 1000 × 945 px, transparence RGBA. Montre entière au centre.",
        "reglages": json.loads(args.protocol.read_text()),
    }
    prompt = {
        "model": args.model, "temperature": 0.4, "seed": 67, "max_tokens": 1900,
        "repeat_penalty": 1.10,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": json.dumps(context, ensure_ascii=False)}],
    }
    (args.output / "draw-review-request.json").write_text(json.dumps(prompt, ensure_ascii=False, indent=2))
    endpoint = f"http://127.0.0.1:{args.port}/v1/chat/completions"
    with urlopen(Request(endpoint, data=json.dumps(prompt).encode(),
                         headers={"Content-Type": "application/json"}), timeout=960) as response:
        result = json.load(response)
    (args.output / "draw-review-response.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    choice = result["choices"][0]
    source = choice["message"]["content"].strip()
    if source.startswith("```") and source.endswith("```"):
        source = source.split("\n", 1)[1].removesuffix("```").strip()
    if choice["finish_reason"] != "stop" or "function drawConfiguredWatch(" not in source:
        raise ValueError("The model did not complete the drawing function")
    target = args.output / "draw-configured-watch.js"
    target.write_text(source + "\n")
    subprocess.run(["node", "--check", str(target)], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("brief", "before", "protocol", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--model", required=True)
    main(parser.parse_args())
