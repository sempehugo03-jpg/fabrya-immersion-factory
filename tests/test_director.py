from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest

from cinema_factory.contracts import Blocked, Rejected, validate_plan
from cinema_factory.director import compile_direction, media_cost, similarities
from cinema_factory.inspection import constrain_revision, correction_scope
from cinema_factory.local_model import local_speaker
from cinema_factory.prompting import check_prompt, video_request
from cinema_factory.providers import ROUTES, media_fingerprint
from cinema_factory.runtime import Run, read_funds

BASE = Path(__file__).parent.parent
REFERENCE = BASE / "docs/essais/la-traverse/plan.json"


def direction_fixture():
    """Contract fixture. It is not a benchmark result or a model output."""
    old = json.loads(REFERENCE.read_text())
    for concept in old["concepts"]:
        concept.update(visual_mechanism=concept["entry"], business_reason=concept["tradeoff"],
                       feasibility="Plan court à vérifier sur les images finales.")
    old.update(value_proposition="Aide à préparer un diagnostic.", emotion="attention",
               authenticity="Atelier fictif.", assumptions=["Aucun lieu n’est confirmé."], references=[])
    cinematic = dict(intention="Faire apparaître une relation mécanique", subject="vélo sans marque",
                     setting="fond sobre", composition="sujet essentiel dans le cadre mobile",
                     camera="déplacement latéral", subject_motion="rotation lente",
                     light_materials="jour doux, métal mat", continuity="même vélo identifié",
                     constraints="aucune inscription, proportions cohérentes")
    shot = old["shots"][0]
    shot = {key: shot[key] for key in ("route", "asset_id", "seconds", "trim_start", "resolution")}
    shot.update(direction=cinematic, compact_prompt="", reference_id="", incoming="la roue en rotation",
                outgoing="détail de la transmission", invariants=["vélo bleu"], acceptance="La roue reste lisible.",
                cues=[dict(time=0, x=.5, half_width=.1, image="roue", reverse="retour au pneu"),
                      dict(time=8, x=.5, half_width=.1, image="transmission", reverse="revenir à la roue")])
    old["shots"] = [shot]
    return old


class PromptContractTests(unittest.TestCase):
    def test_preserves_the_actual_1722_character_kling_prompt(self):
        historical = json.loads(REFERENCE.read_text())
        validate_plan(historical, ROUTES, {}, {})
        endpoint, payload = video_request(historical["shots"][0])
        self.assertEqual(endpoint, "kling/v4/text-to-video")
        self.assertEqual(payload["prompt"], historical["shots"][0]["video_prompt"])
        self.assertEqual(len(payload["prompt"]), 1722)
        self.assertEqual(set(payload), {"prompt", "duration", "resolution", "aspect_ratio"})

    def test_runway_length_is_counted_in_utf16(self):
        check_prompt("runway-text", "🌱" * 500)
        with self.assertRaisesRegex(Rejected, "character contract"):
            check_prompt("runway-text", "🌱" * 501)

    def test_reference_request_has_only_supported_controls(self):
        shot = dict(route="fal-reference", video_prompt="Un sujet en mouvement.",
                    resolution="1080p", seconds=4)
        endpoint, body = video_request(shot, "https://v3b.fal.media/ref.jpg")
        self.assertEqual(endpoint, "kling/v4/image-to-video")
        self.assertEqual(set(body), {"prompt", "duration", "resolution", "start_image_url"})


class DirectionTests(unittest.TestCase):
    def test_compiled_plan_preserves_the_existing_player_contract(self):
        plan, comparisons = compile_direction(direction_fixture(), ROUTES, {}, {})
        self.assertEqual(plan["shots"][0]["seconds"], 8)
        self.assertEqual(plan["hotspots"][0]["action_id"], "observer")
        self.assertEqual(len(comparisons), 3)
        self.assertEqual(media_cost(plan), 1_880_000)

    def test_unrenderable_mobile_hold_fails_before_any_media(self):
        direction = direction_fixture()
        direction["shots"][0]["cues"][1]["x"] = .8
        with self.assertRaisesRegex(Rejected, "mobile safe area"):
            compile_direction(direction, ROUTES, {}, {})

    def test_scroll_holds_include_ordered_endpoints(self):
        direction = direction_fixture()
        direction["shots"][0]["cues"][1]["time"] = 7
        with self.assertRaisesRegex(Rejected, "scroll holds"):
            compile_direction(direction, ROUTES, {}, {})

    def test_name_changes_do_not_hide_a_duplicate_mechanism(self):
        value = direction_fixture()["concepts"][0]
        renamed = {**value, "name": "Autre titre"}
        self.assertTrue(similarities([value, renamed], [value])[0]["duplicate"])
        direction = direction_fixture()
        direction["concepts"][1] = renamed
        with self.assertRaisesRegex(Rejected, "repeat"):
            compile_direction(direction, ROUTES, {}, {})

    def test_cuts_need_an_explicit_common_invariant(self):
        direction = direction_fixture()
        other = deepcopy(direction["shots"][0])
        other["invariants"] = ["concours de rayons"]
        direction["shots"].append(other)
        with self.assertRaisesRegex(Rejected, "share"):
            compile_direction(direction, ROUTES, {}, {})

    def test_shared_start_image_billed_once(self):
        direction = direction_fixture()
        first = direction["shots"][0]
        first.update(route="fal-reference", reference_id="hero")
        direction["references"] = [dict(id="hero", prompt="portrait du vélo")]
        second = deepcopy(first)
        second["direction"]["camera"] = "change of viewpoint with spatial occlusion"
        direction["shots"].append(second)
        plan, _ = compile_direction(direction, ROUTES, {}, {})
        self.assertEqual(media_cost(plan), 16 * 235_000 + 3000)
        self.assertEqual(media_cost(plan, references=["portrait du vélo"]), 16 * 235_000)

    def test_low_confidence_stops_regeneration(self):
        review = {"diagnoses": [{"scope": "prompt", "confidence": "low", "shot": 0}]}
        self.assertIsNone(correction_scope(review))

    def test_mobile_reframe_cannot_regenerate_or_change_actions(self):
        decision = correction_scope({"diagnoses": [{"scope": "reframe", "confidence": "high", "shot": 0}]})
        plan, _ = compile_direction(direction_fixture(), ROUTES, {}, {})
        revised = deepcopy(plan)
        revised["mobile_center"] = .48
        constrain_revision(plan, revised, decision)
        self.assertEqual(decision["regenerate"], [])
        revised["shots"][0]["video_prompt"] += " Nouveau mouvement."
        with self.assertRaisesRegex(Rejected, "regeneration scope"):
            constrain_revision(plan, revised, decision)

    def test_edit_only_uses_a_shorter_range(self):
        plan, _ = compile_direction(direction_fixture(), ROUTES, {}, {})
        decision = correction_scope({"diagnoses": [{"scope": "edit", "confidence": "high", "shot": 0}]})
        revised = deepcopy(plan)
        revised["shots"][0].update(trim_start=1, seconds=7)
        constrain_revision(plan, revised, decision)
        revised["shots"][0]["seconds"] = 8
        with self.assertRaisesRegex(Rejected, "shorten"):
            constrain_revision(plan, revised, decision)


class FinanceTests(unittest.TestCase):
    def test_provider_snapshot_and_request_guard_are_independent_of_total(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            report = root / "funds.json"
            report.write_text(json.dumps({"fal": {
                "checked_at": datetime.now(timezone.utc).isoformat(), "currency": "USD",
                "verification": "balance checked", "automatic_recharge": False,
                "available_microusd": 100,
            }}))
            run = Run(root / "run", 500)
            run.funds = read_funds(report)
            key = media_fingerprint("fal", "video", {"duration": 5})
            run.reserve("fal", "video", 50, fingerprint=key)
            with self.assertRaisesRegex(Blocked, "exact media request"):
                run.reserve("fal", "video", 50, fingerprint=key)
            with self.assertRaisesRegex(Blocked, "funds"):
                run.reserve("fal", "video", 51)
            with self.assertRaisesRegex(Blocked, "No verified balance"):
                run.reserve("runway", "video", 10)

    def test_local_bench_refuses_non_loopback(self):
        with self.assertRaisesRegex(Rejected, "loopback"):
            local_speaker("https://example.test", "qwen2.5")


class EndToEndContractTests(unittest.TestCase):
    def test_non_media_correction_reuses_the_source_in_the_real_orchestrator(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        from cinema_factory import __main__ as cli

        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            brief = root / "brief.md"
            brief.write_text("Atelier fictif de vélos.")
            run = Run(root / "run", 3_000_000)
            d1 = direction_fixture()
            d2 = deepcopy(d1)
            d2["mobile_center"] = .49
            scopes = {"diagnoses": [{"axis": "composition", "scope": "reframe",
                                    "shot": 0, "confidence": "high"}],
                      "axes": [{"axis": "composition", "grade": "REVISE"}], "limitations": []}
            clear = {"diagnoses": [], "axes": [{"axis": "composition", "grade": "PASS"}], "limitations": []}

            def encode(plan, sources, destinations, work):
                self.assertEqual(sources[0], run.directory / "attempt-1/source-1.mp4")
                return work / "master.mp4", dict(frames=192, assembly_seconds=0,
                                                  encode_seconds=0, total_web_bytes=1)

            with patch.object(cli, "capabilities", return_value={
                "credentials": {"OPENAI_API_KEY": True},
                "executables": {"ffmpeg": True, "ffprobe": True, "node": True},
            }), patch.object(cli, "read_funds", return_value={"openai": {}, "fal": {}}), \
                 patch.object(cli, "routes_for", return_value={"fal-text": ROUTES["fal-text"]}), \
                 patch.object(cli, "propose", side_effect=[d1, d2]), \
                 patch.object(cli, "produce", side_effect=lambda run, shot, target, refs: target.write_bytes(b"fixture")) as generate, patch.object(cli, "probe"), \
                 patch.object(cli, "build_site", side_effect=encode), patch.object(cli, "browser_qa"), \
                 patch.object(cli, "evaluate", side_effect=[scopes, clear]):
                args = SimpleNamespace(mode="run", brief=brief, assets=None, destinations=None, funds=None,
                                       corrections=1, history=[], offer="cinematic")
                cli.launch(args, run)
            self.assertEqual(generate.call_count, 1)
            replay = json.loads((run.directory / "attempt-2/production-estimate.json").read_text())
            self.assertEqual(replay["video_and_references_microusd"], 0)
            self.assertEqual(json.loads((run.directory / "delivery.json").read_text())["preview"],
                             "attempt-2/web/index.html")
