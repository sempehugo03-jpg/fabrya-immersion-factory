import hashlib
import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

from cinema_factory.__main__ import launch_exploration
from cinema_factory.contracts import Rejected
from cinema_factory.exploration import MECHANISM, explore, select
from cinema_factory.runtime import Run


BRIEF = "L'entreprise répare les appareils qu'elle reçoit."
MEANS = {"hypothetical_budget_microusd": 0, "routes": []}


def concept(title, discovery):
    return {
        "title": title, "proposition": discovery, "emotion": "Attention",
        "brand_relevance": "Rendre perceptible le service décrit dans le brief.",
        "mechanism": {key: discovery for key in MECHANISM["properties"]},
    }


class CreativeExplorationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.run_artifacts = Run(self.root / "run", 0)
        self.requests = {}
        self.inventory_read = False
        self.claims = []

    def speaker(self, run, stage, instructions, schema, content):
        payload = json.loads(content[0]["text"])
        self.requests[stage] = payload
        if stage.startswith("unrestricted_exploration"):
            self.assertEqual(set(payload), {"brief", "rule"})
            if stage.endswith("_divergence"):
                return {"concepts": [concept("C", "Le choix du visiteur modifie les conséquences."),
                                     concept("D", "Plusieurs personnes apportent des observations distinctes."),
                                     concept("E", "Le visiteur compare des interprétations simultanées.")]}
            return {"concepts": [concept("A", "L'occultation décroît et rend visible un sujet."),
                                 concept("B", "Le masquage est levé pour que le sujet apparaisse.")]}
        if stage.startswith("artistic_selection"):
            ids = list(payload["concepts"])
            if not stage.endswith("_divergence"):
                groups = [dict(members=ids, evidence="Même changement d'occlusion et même résultat.")]
                return dict(selected=ids[0], reason="Choix provisoire.", groups=groups,
                            prior_repetitions=[], needs_divergence="yes", divergence_reason="Même causalité.")
            groups = [dict(members=ids[:2], evidence="L'information est simplement rendue visible."),
                      *(dict(members=[key], evidence="Causalité distincte.") for key in ids[2:])]
            return dict(selected="idea-3", reason="La décision donne son sens à l'expérience.",
                        groups=groups, prior_repetitions=[], needs_divergence="no", divergence_reason="")
        if stage == "unrestricted_realization":
            self.assertFalse(self.inventory_read)
            self.assertEqual(payload["concept"]["title"], "C")
            return dict(direction="Vision idéale", opening="Ouverture", progression="Progression libre",
                        mise_en_scene="Voie ambitieuse", interaction="Interaction",
                        accessibility="Accès direct à la même information", invariants=["Sens préservé"],
                        confirmed_facts=[BRIEF], fiction=[], client_evidence_needed=[])
        if stage == "unrestricted_critique":
            self.assertFalse(self.inventory_read)
            return dict(artistic_assessment="Pertinent", strengths=["Sens"], artistic_issues=[],
                        unsupported_client_claims=self.claims)
        if stage == "production_engineering":
            self.assertTrue(self.inventory_read)
            self.assertEqual(payload["production"], MEANS)
            return dict(feasibility="missing_capability", faithful_approach="À étudier", available_means=[],
                        capability_gaps=["Une capacité manque"], verification_required=[],
                        rights_and_accessibility="Droits et accès à vérifier",
                        optional_compromises=[dict(option="Une autre voie", artistic_difference="Interaction différente")])
        self.fail(stage)

    def inventory(self):
        self.inventory_read = True
        vision = self.run_artifacts.directory / "vision-artistique-ideale.json"
        self.assertTrue(vision.is_file())
        self.vision_before_engineering = vision.read_bytes()
        return MEANS

    def read(self, artifact):
        return json.loads((self.run_artifacts.directory / artifact).read_text())

    def test_free_exploration_has_isolated_inputs_and_preserves_ambitious_vision(self):
        history = {"past-1": concept("without title", "Historical mechanism")["mechanism"]}
        explore(self.speaker, self.run_artifacts, BRIEF, history, self.inventory)
        self.assertEqual(list(self.requests), [
            "unrestricted_exploration", "artistic_selection",
            "unrestricted_exploration_divergence", "artistic_selection_divergence",
            "unrestricted_realization", "unrestricted_critique", "production_engineering",
        ])
        self.assertEqual(self.requests["artistic_selection"]["historical_mechanisms"], history)
        for stage, value in self.requests.items():
            if not stage.startswith("artistic_selection"):
                self.assertNotIn("Historical mechanism", json.dumps(value))
        decision = self.read("concept-retenu.json")["selection"]
        self.assertEqual(decision["groups"][0]["members"], ["idea-1", "idea-2"])
        self.assertEqual(len(decision["groups"]), 4)
        self.assertEqual(self.read("vision-artistique-ideale.json")["concept"]["title"], "C")
        vision = self.run_artifacts.directory / "vision-artistique-ideale.json"
        self.assertEqual(vision.read_bytes(), self.vision_before_engineering)
        production = self.read("strategie-de-production.json")
        self.assertEqual(production["vision_sha256"], hashlib.sha256(vision.read_bytes()).hexdigest())
        self.assertEqual(production["strategy"]["feasibility"], "missing_capability")
        self.assertEqual(self.run_artifacts.charges, [])
        request = self.read("unrestricted_exploration-request.json")
        self.assertEqual(json.loads(request["input"][0]["text"]), self.requests["unrestricted_exploration"])

    def test_fact_issue_preserves_vision_but_blocks_engineering(self):
        self.claims = ["Allégation non justifiée."]
        with self.assertRaisesRegex(Rejected, "unsupported real client claims"):
            explore(self.speaker, self.run_artifacts, BRIEF, {}, self.inventory)
        self.assertFalse(self.inventory_read)
        self.assertEqual(self.read("unrestricted_critique.json")["unsupported_client_claims"], self.claims)
        self.assertEqual(self.read("vision-artistique-ideale.json")["concept"]["title"], "C")

    def test_selection_require_each_concept_exactly_once(self):
        def bad_selection(name, instructions, schema, value):
            return dict(selected="idea-1", reason="Raison", prior_repetitions=[],
                        groups=[dict(members=["idea-1", "idea-1"], evidence="Non valide")],
                        needs_divergence="no", divergence_reason="")

        with self.assertRaisesRegex(Rejected, "justified partition"):
            select(bad_selection, {"idea-1": {}, "idea-2": {}}, BRIEF, {}, "")

    def test_cli_does_not_expose_history_titles_or_read_technical_context_early(self):
        brief = self.root / "brief.md"
        brief.write_text(BRIEF)
        history = self.root / "prior.json"
        history.write_text(json.dumps({
            "concept": concept("TITLE FROM ANOTHER PROJECT", "Historical mechanism"),
            "vision": {"opening": "VISUAL FROM ANOTHER PROJECT"},
        }))
        args = Namespace(brief=brief, production_cap_microusd=0, history=[history], assets=None,
                         local_url="http://127.0.0.1:5555", local_model="fixture",
                         no_divergence=False)

        def speaker(run, stage, instructions, schema, content):
            if stage == "production_engineering":
                payload = json.loads(content[0]["text"])
                self.assertEqual(payload["production"]["hypothetical_budget_microusd"], 0)
                self.assertNotIn("credentials", payload["production"])
                payload["production"] = MEANS
                content = [{"type": "input_text", "text": json.dumps(payload)}]
            return self.speaker(run, stage, instructions, schema, content)

        with patch("cinema_factory.__main__.local_speaker", return_value=speaker), \
             patch("cinema_factory.__main__.read_assets", side_effect=self.cli_inventory):
            launch_exploration(args, self.run_artifacts)
        self.assertEqual(self.requests["artistic_selection"]["historical_mechanisms"]["past-1"]["discovery"],
                         "Historical mechanism")
        self.assertNotIn("ANOTHER PROJECT", json.dumps(self.requests))

    def cli_inventory(self, path):
        self.inventory()
        return {}
