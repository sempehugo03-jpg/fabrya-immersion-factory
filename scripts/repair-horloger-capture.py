"""Request a model-authored repair after a failed browser run."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("checkpoint", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--model", required=True)
args = parser.parse_args()
checkpoint = args.checkpoint
output = args.output
output.mkdir(exist_ok=True, parents=True)
brief = (checkpoint / "brief.txt").read_text().strip()
realization = read_json(checkpoint / "exploration/vision-artistique-ideale.json")
if hashlib.sha256(brief.encode()).hexdigest() != realization["brief_sha256"]:
    raise ValueError("The creative checkpoint does not match this brief")
target = checkpoint / "website/index.html"
observations = read_json(checkpoint / "browser-final/observations.json")
if not all(observations[screen]["issues"] for screen in ("desktop", "mobile")):
    raise ValueError("Expected the documented unsuccessful browser run")

instructions = """Tu es FABRYA, en charge de la correction de ton expérience web. Le modèle producteur précédent
avait mis en œuvre ta direction dans le fichier fourni, puis tenté une correction. Les captures montrent des
aplats triangulaires et du texte isolé. Le parcours et le mécanisme d'horloge de ta vision ne sont pas perceptibles.
Une exception JavaScript interrompt l'animation dès l'ouverture. Aucun changement n'est mesuré sur molette ou tactile.
Corrige ou réécris la réalisation à partir de la vision déjà choisie. Garde le concept et sa manière de découvrir
le métier. Décide toi-même du rendu, des médias, des textes et de la mise en scène. Fabrique les ressources
dans l'environnement navigateur, sans accès réseau ni service externe. Assure-toi que le mécanisme annoncé est
visible et que ses états changent réellement avec la molette dans les deux sens et le glissement tactile.
Prévois des commandes clavier ou boutons opérationnels et lisibles, un viewport mobile et les mouvements réduits.
Si ton expérience a du son, laisse le visiteur l'activer. Étiquette clairement la démonstration comme fictive
et évite les faits commerciaux invérifiables. Contrôle que les sélecteurs du script correspondent au DOM.
Écris le document HTML complet avec styles, médias générés et scripts intégrés. Retourne seulement le document,
de <!doctype html> jusqu'à </html>. Reste sous 3300 tokens pour livrer un fichier complet."""

payload = {
    "brief": brief,
    "concept": realization["concept"],
    "vision": realization["vision"],
    "premiere_realisation": target.read_text(),
    "observations_navigateur": observations,
}
request = {
    "model": args.model, "seed": 112, "temperature": 0.35, "max_tokens": 3900, "stream": False,
    "messages": [
        {"role": "system", "content": instructions},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))},
    ],
}
write_json(output / "repair-request.json", request)
connection = Request("http://127.0.0.1:18222/v1/chat/completions", headers={"Content-Type": "application/json"},
                     data=json.dumps(request).encode())
print("Model-authored repair started", flush=True)
with urlopen(connection, timeout=1100) as response:
    receipt = json.load(response)
write_json(output / "repair-response.json", receipt)
choice = receipt["choices"][0]
if choice["finish_reason"] != "stop":
    raise RuntimeError("Incomplete repair response")
html = choice["message"]["content"].strip()
if html.startswith("```") and html.endswith("```"):
    html = html.split("\n", 1)[1].removesuffix("```").strip()
if not html.lower().startswith("<!doctype html>") or not html.lower().endswith("</html>"):
    raise RuntimeError("No complete website in the model response")
website = output / "website"
website.mkdir(exist_ok=True)
(website / "index.html").write_text(html + "\n")
print("Model-authored repair produced a complete HTML document", flush=True)
