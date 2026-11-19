import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from cinema_factory.contracts import Rejected, record, choice, validate
from cinema_factory.director import compile_direction, propose, similarities
from cinema_factory.prompting import video_request
from cinema_factory.providers import ROUTES
from cinema_factory.reliability import CreativeRejection, assess, compile_candidate, production_options
from cinema_factory.runtime import digest
from cinema_factory.visual_evidence import apply_measured_defects, check_evidence, frame_positions


def creative_fixture():
    # Exercises structure only. No creative fixture is injected into a real benchmark.
    ideas = {key: dict(title=title, entry=entry, transformation=motion, discovery=end,
                       value="Préparer une demande", limits="Une simulation annoncée")
             for key, title, entry, motion, end in (
                 ("a", "Pli", "Cuir tendu", "Le contact révèle un pli", "Le pli devient lisible"),
                 ("b", "Trace", "Prisme translucide", "Le halo s'étale", "Les contours d'une trace se distinguent"),
                 ("c", "Alignement", "Segments distants", "Les segments se rejoignent", "Une jonction coïncide"),
             )}
    ideation = dict(ideas=ideas, brand="Atelier fictif", audience="Public local",
                    objective="Préparer une demande", promise="Étudier la matière")
    shot = dict(option="fal-text/720p/4", reference="", arrival="Le bord du pli apparaît.",
                acceptance="Le contour se distingue à l'arrivée.", start_left=.40, start_right=.60,
                end_left=.45, end_right=.65, direction=dict(
                    subject="Même cuir", setting="Banc neutre", composition="Zone centrale lisible",
                    camera="Léger parcours latéral", subject_motion="Le cuir se plie",
                    light_materials="Lumière rasante", constraints="Aucune marque, décor fictif"))
    direction = dict(concept="a", reason="Le pli illustre la souplesse de façon lisible.",
                     identity="Le même cuir brun", opening="Cuir plat.", emotion="Curiosité",
                     authenticity="Atelier fictif", shots=[shot],
                     action=dict(label="Préparer ma demande", heading="À préciser",
                                 body="Indiquez la matière.", destination_id=""))
    return ideation, direction


class KnownCreativeDefects(unittest.TestCase):
    def setUp(self):
        self.ideas, self.candidate = creative_fixture()
        self.options = production_options(ROUTES, {}, 2_300_000)

    def compile(self):
        direction = compile_candidate(self.ideas, self.candidate, self.options)
        return compile_direction(direction, ROUTES, {}, {})[0]

    def test_valid_plan_keeps_selected_intent_and_real_request(self):
        plan = self.compile()
        self.assertEqual(plan["concepts"][plan["selected"]]["name"], "Pli")
        self.assertEqual(video_request(plan["shots"][0])[1]["duration"], 4)

    def test_missing_reference_and_user_asset_rejected(self):
        for option in ("fal-reference/720p/4", "client/unknown/720p/4"):
            with self.subTest(option=option), self.assertRaises(Rejected):
                self.candidate["shots"][0]["option"] = option
                self.compile()

    def test_image_dependency_exists_before_it_is_referenced(self):
        self.candidate["shots"][0].update(option="fal-reference/720p/4",
                                         reference="Portrait fictif du cuivre sans inscription.")
        direction = compile_candidate(self.ideas, self.candidate, self.options)
        self.assertEqual(direction["shots"][0]["reference_id"], direction["references"][0]["id"])
        self.assertTrue(self.compile()["shots"][0]["reference_prompt"])

    def test_two_plans_cannot_leave_a_contradictory_shared_boundary(self):
        second = deepcopy(self.candidate["shots"][0])
        self.candidate["shots"].append(second)
        with self.assertRaisesRegex(Rejected, "different observable state"):
            self.compile()
        second.update(arrival="Le pli se stabilise dans le même cuir.")
        direction = compile_candidate(self.ideas, self.candidate, self.options)
        self.assertEqual(direction["shots"][0]["outgoing"], direction["shots"][1]["incoming"])

    def test_mobile_out_of_frame_and_valid_offset(self):
        shot = self.candidate["shots"][0]
        shot.update(start_left=.05, end_right=.9)
        with self.assertRaisesRegex(Rejected, "mobile safe area"):
            self.compile()
        shot.update(start_left=.51, start_right=.70, end_left=.60, end_right=.80)
        self.assertAlmostEqual(self.compile()["mobile_center"], .655)

    def test_changed_title_does_not_clear_repeat(self):
        original = dict(entry="la table", discovery="plan pivotant fixe",
                        visual_mechanism="pivot chasse le reflet")
        repeated = {**original, "name": "Titre inédit"}
        self.assertTrue(similarities([repeated], [original])[0]["duplicate"])

    def test_wrong_route_shape_and_unsupported_reference_syntax(self):
        with self.assertRaises(Rejected):
            validate({"anyOf": [record(route=choice("text"), reference=choice("")),
                                record(route=choice("image"), reference={"type": "string"})]},
                     {"route": "text", "reference": "une ressource fantôme"})
        shot = dict(route="runway-text", resolution="1080p", seconds=4, video_prompt="Plan.")
        with self.assertRaises(Rejected):
            video_request(shot)
        shot.update(resolution="720p", video_prompt="Utilise @Image1.")
        with self.assertRaisesRegex(Rejected, "reference tokens"):
            video_request(shot)

    def test_two_projects_and_comparison_history_do_not_enter_the_model_context(self):
        observed = []

        def speaker(run, stage, instructions, schema, content):
            observed.append((stage, json.loads(content[0]["text"])))
            reply = self.ideas if stage == "creative_ideation" else self.candidate
            validate(schema, reply)
            return reply

        with tempfile.TemporaryDirectory() as root:
            for project, brief in (("project-1", "CUIVRE-CANARY"), ("project-2", "SON-CANARY")):
                work = Path(root) / project / "attempt-1"
                work.mkdir(parents=True)
                propose(speaker, None, brief, ROUTES, {}, {}, [{"entry": "HISTORICAL-CANARY"}],
                        [], "cinematic", 2_300_000, work=work)
            self.assertNotIn("CUIVRE-CANARY", str(observed[2:]))
            self.assertNotIn("HISTORICAL-CANARY", str(observed))
            self.assertEqual(observed[2][1]["brief"], "SON-CANARY")
            ledger = json.loads((work / "creative_ideation-provenance.json").read_text())
            self.assertIsNone(ledger["previous_response"])
            self.assertFalse(ledger["retrieval"])

    def test_structural_retry_keeps_the_previous_concept(self):
        called = []

        def speaker(run, stage, instructions, schema, content):
            called.append(stage)
            self.assertEqual(schema["properties"]["concept"]["enum"], ["a"])
            return self.candidate

        with tempfile.TemporaryDirectory() as root:
            first = Path(root) / "attempt-1"
            second = Path(root) / "attempt-2"
            first.mkdir()
            second.mkdir()
            (first / "creative_ideation.json").write_text(json.dumps(self.ideas))
            (first / "creative_realization.json").write_text(json.dumps(self.candidate))
            propose(speaker, None, "un brief courant", ROUTES, {}, {}, (),
                    [{"reason": "cadrage incompatible", "rethink_creative": False}],
                    "cinematic", 2_300_000, work=second)
        self.assertEqual(called, ["creative_realization"])

    def test_technically_valid_artistic_weakness_has_independent_verdict(self):
        self.candidate["shots"][0]["direction"]["camera"] = "Simple zoom sur le même sujet."
        direction = compile_candidate(self.ideas, self.candidate, self.options)
        compile_direction(direction, ROUTES, {}, {})
        review = dict(diversity={key: dict(verdict="PASS", reason="Découverte distincte.")
                                 for key in ("ab", "ac", "bc")},
                      relevance=dict(verdict="PASS", reason="Demande métier présente."),
                      realization=dict(verdict="REJECT", reason="Le zoom ne montre pas le pli promis."))
        with tempfile.TemporaryDirectory() as root, self.assertRaises(CreativeRejection):
            assess(lambda *_: review, None, Path(root), "Préparer une demande", self.ideas,
                   self.candidate, direction, 628_000)


class KnownVisualDefects(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.work = Path(temp.name)
        self.plan = {"shots": [{"seconds": 4}]}
        self.source = {"width": 1000, "sha256": "source A"}
        self.rows = []
        for shot, positions in frame_positions(self.plan):
            for view in ("desktop", "mobile"):
                for frame in positions:
                    key = f"{view}-{frame}"
                    path = self.work / f"{key}.jpg"
                    path.write_text(key)
                    self.rows.append(dict(id=key, file=path.name, profile=view, shot=shot,
                                          frame=frame, time=frame/24, sha256=digest(path)))

    def defects(self, bbox=None, visibility=1):
        obs = None if bbox is None else {"master_sha256": "source A", "origin": "fixture",
            "subjects": [{"frame": self.rows[0]["frame"], "subject": "outil",
                          "bbox": bbox, "visible_fraction": visibility}]}
        return check_evidence(self.rows, self.plan, self.work, self.source, 450, 275, obs)

    def test_valid_evidence_is_not_rejected(self):
        self.assertEqual(self.defects([.35, .2, .65, .8]), [])

    def test_mobile_crop_and_occlusion_are_independent_of_model_pass(self):
        for bbox, visibility, expected in (([.15, .1, .82, .91], 1, "mobile_crop_subject"),
                                           ([.35, .1, .65, .9], .45, "occluded_subject")):
            with self.subTest(expected=expected):
                defects = self.defects(bbox, visibility)
                self.assertEqual(defects[0]["code"], expected)
                model_pass = {"axes": [{"axis": defects[0]["axis"], "grade": "PASS"}], "diagnoses": []}
                self.assertEqual(apply_measured_defects(model_pass, defects)["axes"][0]["grade"], "REVISE")

    def test_identical_capture_at_new_position_is_a_critical_defect(self):
        path = self.work / self.rows[1]["file"]
        path.write_bytes((self.work / self.rows[0]["file"]).read_bytes())
        self.rows[1]["sha256"] = digest(path)
        self.assertEqual(self.defects()[0]["code"], "duplicate_image")

    def test_wrong_timing_and_modified_file_rejected(self):
        self.rows[0]["time"] += .3
        with self.assertRaisesRegex(Rejected, "source frame"):
            self.defects()
        self.rows[0]["time"] -= .3
        (self.work / self.rows[0]["file"]).write_text("modified")
        with self.assertRaisesRegex(Rejected, "modified"):
            self.defects()
