"""Generate the missing executable renderer for a model-authored browser document."""
import argparse
import json
from pathlib import Path
import subprocess
from urllib.request import Request, urlopen


RENDER = """Tu es le réalisateur FABRYA. Il manque uniquement le JavaScript exécutable qui fait
fonctionner le document autonome que FABRYA a déjà dessiné. Écris ce JavaScript, sans HTML ni CSS.
Le contexte donne la vision, le contrat et les IDs existants. Réalise vraiment la représentation
visuelle de l'objet de cette vision dans le canvas déjà présent, avec des tracés et matières visibles
dès l'ouverture. Le cadrage, les détails, la lumière et le mouvement sont tes décisions artistiques.
Une simple étiquette ou une forme géométrique sommaire ne suffit pas à représenter l'objet. Dessine
les éléments nécessaires à sa lecture et à sa personnalisation. Fais évoluer le dessin quand le
visiteur modifie chaque select, en utilisant ses valeurs exactes. Implémente aussi la mise à jour
par message fabrya:configuration avec son champ values. Garde un état persistant, redessine au
redimensionnement et montre un état initial complet. Le texte de statut doit annoncer que c'est
une démonstration fictive. Aucune dépendance ou requête externe.
Retourne du JavaScript complet, compact et directement exécutable. Aucun pseudo-code ni commentaire
délayant la réponse. Tu dois produire le rendu et relier effectivement les commandes."""


def main(args):
    args.evidence.mkdir(parents=True, exist_ok=True)
    args.website.mkdir(parents=True, exist_ok=True)
    vision = json.loads(args.vision.read_text())
    html = args.markup.read_text()
    context = {
        "brief": args.brief.read_text(),
        "concept": vision["concept"],
        "vision": vision["vision"],
        "canvas_id": "fabrya-stage",
        "status_id": "fabrya-status",
        "controls": {
            "ctrl-clockType": ["quartz", "mechanique"],
            "ctrl-material": ["acier", "or"],
            "ctrl-bracelet": ["non", "acier", "or"],
            "ctrl-color": ["noir", "blanc", "rouge"],
        },
        "colors_and_styles_already_chosen_in_markup": {
            "background": "#050505", "light_text": "#f0f0f0", "gold": "#d4af37", "steel": "#bdc3c7",
        },
    }
    request = {
        "model": args.model, "temperature": 0.55, "seed": 43,
        "repeat_penalty": 1.10, "repeat_last_n": 192, "max_tokens": 2450,
        "messages": [{"role": "system", "content": RENDER},
                     {"role": "user", "content": json.dumps(context, ensure_ascii=False)}],
    }
    (args.evidence / "renderer-request.json").write_text(json.dumps(request, ensure_ascii=False, indent=2))
    endpoint = f"http://127.0.0.1:{args.port}/v1/chat/completions"
    with urlopen(Request(endpoint, data=json.dumps(request).encode(),
                         headers={"Content-Type": "application/json"}), timeout=1100) as response:
        output = json.load(response)
    (args.evidence / "renderer-response.json").write_text(json.dumps(output, ensure_ascii=False, indent=2))
    choice = output["choices"][0]
    content = choice["message"]["content"].strip()
    if content.startswith("```") and content.endswith("```"):
        content = content.split("\n", 1)[1].removesuffix("```").strip()
    if choice["finish_reason"] != "stop" or not content:
        raise ValueError(f"Incomplete renderer: {choice['finish_reason']}")
    target = args.website / "renderer.js"
    target.write_text(content + "\n")
    subprocess.run(["node", "--check", str(target)], check=True)
    if html.count("</body>") != 1:
        raise ValueError("Unexpected document structure")
    (args.website / "index.html").write_text(
        html.replace("</body>", '    <script src="renderer.js" defer></script>\n</body>', 1)
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("vision", "brief", "markup", "evidence", "website"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--model", required=True)
    main(parser.parse_args())
