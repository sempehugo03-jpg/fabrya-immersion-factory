"""Ask the configured local director to implement and, optionally, repair its own vision."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen


BUILD = """Tu es FABRYA et tu produis ta propre vision. Le brief client a déjà été interprété par toi.
Décide de la réalisation, écris le contenu et génère les médias qui te sont nécessaires avec
les moyens locaux déclarés. Rends un vrai site interactif autonome, exécutable immédiatement.
Le document peut embarquer ses médias ou les générer dans le navigateur. Tu écris tout ce qui
sera présenté au visiteur. Préserve la vision et ses invariants et réalise les interactions.
Fais fonctionner l'expérience sur ordinateur et téléphone, en tenant compte du mouvement réduit.
Les affirmations sur des clients, entreprises ou réalisations réels exigent des preuves.
Il n'existe aucune preuve client associée à ce brief fictif. Les outils réseau, comptes,
services payants, licences externes et secrets ne sont pas accessibles.
Retourne un seul document HTML complet et compact, CSS et JavaScript inclus, en texte brut.
L'HTML doit contenir <!doctype html> en tête et </html> à la fin. Aucun préambule."""

REVIEW = """Tu es FABRYA, auteur de cette réalisation. Inspecte les observations réelles du navigateur,
la vision et le code de ta réalisation. Identifie les écarts réellement observables, puis corrige-les
dans ta propre réalisation en préservant tes décisions. Conserve les comportements fonctionnels.
Retourne uniquement un objet JSON de la forme {"changes": [], "assessment": "..."}.
Chaque changement contient "before" (extrait exact et unique du code existant) et "after" (son remplacement).
Laisse "changes" vide si aucun correctif n'est justifié. Travaille avec les moyens du premier rendu."""


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def generate(args):
    directory = args.evidence
    directory.mkdir(parents=True, exist_ok=True)
    result = json.loads((args.exploration / "vision-artistique-ideale.json").read_text())
    critique_path = args.exploration / "unrestricted_critique.json"
    strategy_path = args.exploration / "strategie-de-production.json"
    brief = args.brief.read_text().strip()
    if result["brief_sha256"] != hashlib.sha256(brief.encode()).hexdigest():
        raise ValueError("The recorded vision belongs to a different brief")
    facts_path = args.exploration / "unrestricted_realization.json"
    if json.loads(facts_path.read_text()) != result["vision"]:
        raise ValueError("The consolidated vision differs from the actual model response")
    payload = {
        "brief": brief,
        "concept": result["concept"],
        "vision": result["vision"],
        "critique": json.loads(critique_path.read_text()) if critique_path.exists() else None,
        "strategie": json.loads(strategy_path.read_text())["strategy"] if strategy_path.exists() else None,
        "ressources_locales": "HTML, CSS, JavaScript et APIs intégrées du navigateur. Budget supplémentaire nul.",
    }
    system = BUILD
    phase = "production"
    if args.review:
        system = REVIEW
        phase = "corrections"
        payload["observations_navigateur"] = json.loads(args.review.read_text())
        payload["html_precedent"] = args.site.read_text()
    request = {
        "model": args.model,
        "stream": False,
        "temperature": 0.45,
        "seed": 31,
        "max_tokens": 4600,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    }
    write_json(directory / f"{phase}-request.json", request)
    endpoint = f"http://127.0.0.1:{args.port}/v1/chat/completions"
    if args.review:
        request["response_format"] = {"type": "json_object"}
        request["max_tokens"] = 1500
        write_json(directory / f"{phase}-request.json", request)
    with urlopen(Request(endpoint, data=json.dumps(request).encode(),
                         headers={"Content-Type": "application/json"}), timeout=1200) as response:
        output = json.load(response)
    write_json(directory / f"{phase}-response.json", output)
    completion = output["choices"][0]
    if completion["finish_reason"] != "stop":
        raise ValueError(f"Incomplete production response: {completion['finish_reason']}")
    html = completion["message"]["content"].strip()
    if args.review:
        review = json.loads(html)
        if not isinstance(review["assessment"], str) or not isinstance(review["changes"], list):
            raise ValueError("Invalid model review")
        html = args.site.read_text().strip()
        for change in review["changes"]:
            before = change["before"]
            if not before or html.count(before) != 1:
                raise ValueError("Model repair does not uniquely match the implementation")
            html = html.replace(before, change["after"], 1)
        write_json(directory / "corrections-appliquees.json", review)
    if html.startswith("```") and html.endswith("```"):
        html = html.split("\n", 1)[1].removesuffix("```").strip()
    if not html.lower().startswith("<!doctype html>") or not html.lower().endswith("</html>"):
        raise ValueError("Model response is missing a complete HTML document")
    args.site.parent.mkdir(parents=True, exist_ok=True)
    args.site.write_text(html + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("exploration", "brief", "evidence", "site", "review"):
        parser.add_argument(f"--{name}", type=Path, required=name != "review")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--model", required=True)
    generate(parser.parse_args())
