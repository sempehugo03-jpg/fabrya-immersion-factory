"""Give the director an independent visual production pass and browser contract."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.request import Request, urlopen


MEDIA = """Tu es FABRYA. Réalise le média original de ta direction artistique, visible dès l'ouverture
de ce document dans un navigateur. Fabrique visuellement le sujet à manipuler dans ta vision. Le média
est l'objet de cet appel. Sa composition, ses matières, sa palette, son cadrage, ses détails,
son traitement du mouvement et son procédé de rendu relèvent de tes décisions. Une interface textuelle,
une liste de scènes et les noms des pièces seules échouent à livrer ce média.
Le navigateur est ton atelier et tu disposes de ses APIs natives en local. Aucune ressource externe
ni allégation commerciale réelle. Retourne uniquement un HTML autonome complet avec doctype et balise de fin.
Le média sera chargé dans une iframe. Contrat d'intégration obligatoire : déclare dans
<script id="fabrya-media-protocol" type="application/json"> un objet "controls" contenant une liste.
Chaque entrée a "key", "label" et "choices". Chaque choice a "value" et "label" et correspond à
une vraie modification visible. Les clés et valeurs sont des chaînes que tu choisis selon ta vision.
L'écouteur de message reçoit {type:"fabrya:configuration",values:{...}} ; les valeurs reçues doivent
se traduire immédiatement dans le rendu actuel. Le document doit aussi afficher son état initial
même en accès direct et conserver tous ses graphismes à différentes dimensions. Garde le code concis."""

ASSEMBLY = """Tu es FABRYA, auteur du média visuel qui vient d'être fabriqué. Assemble ton expérience
à partir de ta vision et du contrat de ton média. Charge le fichier media.html dans une iframe titrée
et visible dès l'ouverture. Les commandes relaient immédiatement leur état avec
iframe.contentWindow.postMessage({type:"fabrya:configuration",values:...},"*").
Utilise les clés et les valeurs exactes du contrat, sans simuler de commandes. Envoie l'état initial
lorsque l'iframe est prête. Tous les libellés, la navigation, la mise en page et les interactions
qui respectent cette vision relèvent de ta propre décision. Assure une présentation utilisable sur mobile,
l'accès au clavier et la lisibilité à l'ouverture. Démo fictive, aucun appel externe, aucun formulaire
commercial réel. Rends un seul document HTML complet, CSS et JavaScript intégrés, sans Markdown.
Le média visuel est déjà produit. L'interface et sa mise en scène complètent ton expérience."""


class Protocol(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.text = ""

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("id") == "fabrya-media-protocol":
            self.capture = True

    def handle_data(self, data):
        if self.capture:
            self.text += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.capture = False


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def generate(args, stage, system, payload):
    request = {
        "model": args.model, "temperature": 0.44, "seed": 53,
        "repeat_penalty": 1.12, "repeat_last_n": 192, "max_tokens": 2700,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    }
    save_json(args.evidence / f"{stage}-request.json", request)
    endpoint = f"http://127.0.0.1:{args.port}/v1/chat/completions"
    with urlopen(Request(endpoint, data=json.dumps(request).encode(),
                         headers={"Content-Type": "application/json"}), timeout=1100) as response:
        output = json.load(response)
    save_json(args.evidence / f"{stage}-response.json", output)
    choice = output["choices"][0]
    content = choice["message"]["content"].strip()
    if content.startswith("```") and content.endswith("```"):
        content = content.split("\n", 1)[1].removesuffix("```").strip()
    if choice["finish_reason"] != "stop" or not content.lower().startswith("<!doctype html>") or not content.lower().endswith("</html>"):
        raise ValueError(f"Incomplete {stage}: {choice['finish_reason']}")
    return content + "\n"


def main(args):
    args.evidence.mkdir(parents=True, exist_ok=True)
    args.website.mkdir(parents=True, exist_ok=True)
    opt = json.loads((args.exploration / "vision-artistique-ideale.json").read_text())
    context = {"brief": args.brief.read_text(), "concept": opt["concept"], "vision": opt["vision"]}
    media_file = args.website / "media.html"
    if args.phase == "media":
        instructions = MEDIA
        if args.repair_previous:
            previous = args.repair_previous.read_text()
            old_protocol = Protocol()
            old_protocol.feed(previous)
            context["contrat_existant"] = json.loads(old_protocol.text)
            context["defauts_constates"] = [
                "En mode quartz la toile affiche du texte seul; en mode mécanique elle prévoit un cercle seul.",
                "Object.assign écrit dans un objet temporaire. Le dessin lit ensuite les variables inchangées.",
                "Le préfixe # devant un nom de couleur ne produit pas une couleur CSS valide.",
            ]
            instructions += (
                "\nReprends le contrat déjà décidé par FABRYA, à l'identique, pour que le site utilise les mêmes commandes."
                " Corrige les défauts concrets et réalise un vrai média détaillé, fidèle aux matières et à l'objet de ta vision."
                " Chaque clé et chaque valeur du contrat doit déclencher un changement de la représentation."
                " Valide la continuité entre état, dessin et messages avant de terminer. Tes décisions de réalisation restent libres."
            )
        media_file.write_text(generate(args, "media", instructions, context))
    parser = Protocol()
    parser.feed(media_file.read_text())
    protocol = json.loads(parser.text)
    controls = protocol["controls"]
    if not controls or len({control["key"] for control in controls}) != len(controls):
        raise ValueError("The model must supply a media configuration contract")
    for control in controls:
        if not control["label"] or len({option["value"] for option in control["choices"]}) < 2:
            raise ValueError("Every media control needs distinct visual states")
    save_json(args.evidence / "media-protocol.json", protocol)
    if args.phase == "assembly":
        context["media_protocol"] = protocol
        (args.website / "index.html").write_text(generate(args, "assembly", ASSEMBLY, context))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("exploration", "brief", "evidence", "website"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--repair-previous", type=Path)
    parser.add_argument("--phase", choices=("media", "assembly"), required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--model", required=True)
    main(parser.parse_args())
