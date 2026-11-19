"""Unrestricted concept development. Its documents carry no production authorization."""
import hashlib
import json

from .contracts import STR, Rejected, array, choice, record, validate
from .reliability import _stage
from .runtime import write_json

MECHANISM = record(
    intention=STR, discovery=STR, temporality=STR, visitor_relation=STR,
    object_role=STR, brand_revelation=STR, interaction=STR,
    transformation=STR, progression=STR,
)
CONCEPT = record(title=STR, proposition=STR, emotion=STR, brand_relevance=STR, mechanism=MECHANISM)
EXPLORATION = record(concepts={**array(CONCEPT), "minItems": 2})

EXPLORE = """Tu es l'explorateur créatif de FABRYA. Imagine l'expérience la plus juste et singulière
pour cette marque et ce public. Le brief courant est ta seule source sur le client. Les possibilités
artistiques, le médium, la forme et le degré de spectacle restent ouverts. Ne préjuge d'aucun
équipement, budget, délai ou mode de fabrication. Distingue la fiction artistique des faits
sur la marque. Explore autant de directions que nécessaire pour permettre une décision réelle.
Décris l'expérience et sa causalité à un niveau conceptuel, sans storyboard ni structure narrative
imposée. Pour chaque piste, explique ce que fait ou perçoit le visiteur, ce que cela change et
pourquoi cette transformation a du sens pour cette marque. Les axes de description servent
à rendre le mécanisme lisible, ils n'imposent aucun dispositif. Écris en français."""

DIVERGE = """\nC'est un second passage après une convergence conceptuelle dans ce même projet.
Repars du brief. Remets en question la relation proposée au visiteur et la façon dont naît le sens.
Explore des hypothèses indépendantes avant de proposer les pistes. Aucune variation superficielle
ni opposition artificielle n'est nécessaire. Une direction sobre peut avoir le mécanisme le plus riche."""

SELECT = """Tu es le directeur artistique de FABRYA. Compare les pistes par leur causalité.
Regroupe les variantes si, après avoir retiré les noms, objets, décors et effets de surface, le
visiteur accomplit ou éprouve le même changement essentiel et comprend la marque de la même façon.
Appuie chaque regroupement sur des éléments concrets. Distingue les pistes quand le rapport au temps,
les décisions du visiteur, le rôle d'un objet, la progression ou la façon dont la marque se révèle
changent le sens de l'expérience. Un procédé partagé ne suffit pas à établir une répétition.
Les profils antérieurs anonymisés servent uniquement à signaler une répétition de mécanisme, jamais
à emprunter une idée. Signale les répétitions historiques étayées, sans obligation de différence
artificielle. Si tu retiens une piste répétée, explique la valeur spécifique qu'elle apporte au brief.
Choisis pour le sens, l'émotion, le récit et l'intérêt métier. N'utilise ni facilité ni difficulté
de production comme critère. Dans reason, justifie expressément l'ID choisi, son avantage décisif
pour le brief et, s'il existe, le meilleur concurrent issu d'un autre groupe. Demande une nouvelle
divergence si toutes les pistes convergent ou si aucun autre groupe ne représente une alternative
artistique crédible. Dans ce dernier cas, nomme ce qui manque et pourquoi les groupes existants
ne l'apportent pas. Une piste déjà présente ne peut pas être la lacune à combler. Sois concis.
Répartis chaque ID courant dans exactement un groupe et sélectionne un seul ID existant. Écris en français."""

DIRECT = """Tu es le réalisateur de FABRYA. Mets en scène l'idée retenue avec toute son ambition.
Définis librement ce que le visiteur perçoit et fait, l'ouverture, les événements, les cadrages,
les mouvements, le rythme, les matières, la lumière et l'interaction quand ils servent cette idée.
Décris la progression et les réactions aux gestes selon la logique propre à l'expérience. Si elle
utilise le défilement, le geste doit commander la progression dans les deux sens, sans lecture
automatique. Prévois un accès équivalent à l'information et à l'action sans dépendre du mouvement.
La réalisation idéale est indépendante des composants, formats et capacités de production.
Confirme uniquement des faits cités textuellement dans le brief. Sépare les choix de fiction et
les informations ou preuves client manquantes. N'invente ni preuve, ni promesse ni destination réelle.
Les invariants décrivent ce que la fabrication devra préserver. Écris en français."""

CRITIQUE = """Tu es le critique artistique. Évalue la vision idéale sur le sens pour la marque,
la singularité du mécanisme, son potentiel émotionnel, la cohérence de la mise en scène et
l'accès à l'information et aux actions essentielles. Signale les défauts concrets et leur effet.
Compare la mise en scène au mécanisme retenu et relève tout changement de logique de découverte.
Sépare les affirmations attribuées à l'entreprise sans source des fictions déclarées. Les
incohérences artistiques donnent lieu à des observations, aucune capacité, aucun coût et
aucune facilité de fabrication n'entrent dans cette critique. Écris en français."""

ENGINEER = """Tu es l'ingénieur de production. La vision et ses invariants sont des données acquises.
Étudie comment produire cette expérience. Distingue ce que les moyens déclarés permettent, ce qui
reste à vérifier, ce qu'il faut obtenir et les capacités manquantes. Tu peux envisager d'autres
moyens. Une option partielle doit exposer précisément l'écart par rapport à la vision et rester une
option distincte. Si la vision dépasse l'enveloppe ou les capacités, conserve-la et signale le
blocage. N'annonce ni coût exact ni accès fournisseur non vérifié. Aucun droit ne se déduit d'une
description ou d'une référence de média. Préserve l'accès aux mêmes informations et actions sur
mobile et avec mouvement réduit. Cette stratégie est descriptive et ne déclenche aucune production.
Écris en français."""

VISION = record(
    direction=STR, opening=STR, progression=STR, mise_en_scene=STR,
    interaction=STR, accessibility=STR, invariants={**array(STR), "minItems": 1},
    confirmed_facts=array(STR), fiction=array(STR), client_evidence_needed=array(STR),
)
REVIEW = record(artistic_assessment=STR, strengths=array(STR), artistic_issues=array(STR),
                unsupported_client_claims=array(STR))
STRATEGY = record(
    feasibility=choice("feasible", "conditional", "missing_capability"),
    faithful_approach=STR, available_means=array(STR), capability_gaps=array(STR),
    verification_required=array(STR), rights_and_accessibility=STR,
    optional_compromises=array(record(option=STR, artistic_difference=STR)),
)


def load_comparison(paths):
    """Only causal profiles leave the historical files; titles, visuals and briefs stay out."""
    profiles = {}
    for index, path in enumerate(paths, 1):
        data = json.loads(path.read_text())
        profile = data["concept"]["mechanism"]
        validate(MECHANISM, profile)
        profiles[f"past-{index}"] = profile
    return profiles


def select(speak, concepts, brief, comparison, suffix):
    current = choice(*concepts)
    group = record(members={**array(current), "minItems": 1}, evidence=STR)
    repetitions = array(record(current=current, past=choice(*comparison), evidence=STR)) if comparison else {
        **array(STR), "maxItems": 0,
    }
    schema = record(
        selected=current, reason=STR, groups={**array(group), "minItems": 1},
        prior_repetitions=repetitions, needs_divergence=choice("yes", "no"), divergence_reason=STR,
    )
    selection = speak("artistic_selection" + suffix, SELECT, schema,
                      dict(brief=brief, concepts=concepts, historical_mechanisms=comparison))
    memberships = [member for group in selection["groups"] for member in group["members"]]
    if (sorted(memberships) != sorted(concepts) or not selection["reason"].strip()
            or any(not group["evidence"].strip() for group in selection["groups"])
            or any(not pair["evidence"].strip() for pair in selection["prior_repetitions"])
            or (selection["needs_divergence"] == "yes" and not selection["divergence_reason"].strip())):
        raise Rejected("Artistic selection requires a justified partition of the current concepts")
    return selection


def explore(speaker, run, brief, comparison, production_context, *, divergence=True):
    def stage(name, instructions, schema, payload):
        return _stage(speaker, run, run.directory, name, instructions, schema, payload,
                      sorted(payload), record_request=True)

    concepts = {}
    attempts = ("", "_divergence") if divergence else ("",)
    for suffix in attempts:
        exploration = stage("unrestricted_exploration" + suffix, EXPLORE + (DIVERGE if suffix else ""),
                            EXPLORATION, dict(brief=brief))
        new_concepts = enumerate(exploration["concepts"], start=len(concepts) + 1)
        concepts.update((f"idea-{index}", concept) for index, concept in new_concepts)
        selection = select(stage, concepts, brief, comparison, suffix)
        if len(selection["groups"]) > 1 and selection["needs_divergence"] == "no":
            break
    diversity_unresolved = len(selection["groups"]) == 1 or selection["needs_divergence"] == "yes"
    chosen = concepts[selection["selected"]]
    write_json(run.directory / "concept-retenu.json", {
        "concept": chosen, "selection": selection,
        "selected_from": "artistic_selection" + suffix,
        "diversity_unresolved": diversity_unresolved,
    })

    vision = stage("unrestricted_realization", DIRECT, VISION, dict(brief=brief, concept=chosen))
    ideal_path = run.directory / "vision-artistique-ideale.json"
    write_json(ideal_path, {
        "concept": chosen, "selection": selection, "vision": vision,
        "brief_sha256": hashlib.sha256(brief.encode()).hexdigest(),
    })
    ideal_digest = hashlib.sha256(ideal_path.read_bytes()).hexdigest()
    review = stage("unrestricted_critique", CRITIQUE, REVIEW, dict(brief=brief, concept=chosen, vision=vision))
    if (review["unsupported_client_claims"]
            or any(not fact.strip() or fact not in brief for fact in vision["confirmed_facts"])):
        raise Rejected("Ideal vision was preserved; unsupported real client claims need correction")

    strategy = stage("production_engineering", ENGINEER, STRATEGY,
                     dict(brief=brief, concept=chosen, vision=vision, production=production_context()))
    write_json(run.directory / "strategie-de-production.json", {
        "vision_sha256": ideal_digest, "strategy": strategy,
    })
    run.record("unrestricted_creative_exploration", "completed", vision_sha256=ideal_digest,
               diversity_unresolved=diversity_unresolved,
               production_feasibility=strategy["feasibility"], production_requests=0)
