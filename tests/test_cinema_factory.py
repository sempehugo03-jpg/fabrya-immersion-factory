import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from cinema_factory.contracts import Blocked, Rejected, validate_destination, validate_plan
from cinema_factory.film import render_html, structure
from cinema_factory.providers import ROUTES, fal_job, planned_charge, queue_url, routes_for, speak
from cinema_factory.runtime import Run, read_assets

ROOT = Path(__file__).parent
FIXTURE = ROOT / "fixtures/au-tour-plan.json"


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads(FIXTURE.read_text())
        self.assets = {"au-tour": {}}

    def test_exact_frame_ranges_and_mobile_crop(self):
        validate_plan(self.plan, ROUTES, self.assets, {})
        crop, left, actions, points = structure(self.plan, {}, 2160, 3840)
        self.assertEqual((crop, left), (1728, 840))
        self.assertEqual([(p["start"], p["end"]) for p in points], [(24, 71), (86, 191)])
        self.assertEqual(points[-1]["action"], actions[0])

    def test_offsets_include_previous_shots(self):
        self.plan["shots"].append(deepcopy(self.plan["shots"][0]))
        self.plan["hotspots"][1]["shot"] = 1
        validate_plan(self.plan, ROUTES, self.assets, {})
        _, _, _, points = structure(self.plan, {}, 2160, 3840)
        self.assertEqual((points[-1]["start"], points[-1]["end"]), (278, 383))

    def test_rejects_overlaps_and_wrong_destination(self):
        self.plan["hotspots"][1]["start"] = 2
        with self.assertRaisesRegex(Rejected, "overlap"):
            validate_plan(self.plan, ROUTES, self.assets, {})
        self.plan["actions"][0]["destination_id"] = "invented-checkout"
        with self.assertRaisesRegex(Rejected, "destination absent"):
            validate_plan(self.plan, ROUTES, self.assets, {})

    def test_rejects_offscreen_hotspot(self):
        self.plan["hotspots"][0]["x"] = .08
        with self.assertRaisesRegex(Rejected, "mobile crop"):
            structure(self.plan, {}, 2160, 3840)

    def test_html_escapes_client_content_and_has_direct_actions(self):
        self.plan["brand"] = '<script>alert("name")</script>'
        self.plan["description"] = 'x" onerror="alert(2)'
        self.plan["actions"][0]["label"] = '<svg onload="alert(3)">'
        _, _, actions, _ = structure(self.plan, {}, 2160, 3840)
        source = render_html(self.plan, actions)
        self.assertIn("&lt;script&gt;", source)
        self.assertIn("x&quot; onerror=&quot;alert(2)", source)
        self.assertIn("&lt;svg", source)
        self.assertIn('nav class="direct-actions"', source)

    def test_destinations_only_use_expected_schemes(self):
        for url in ("https://example.com/reserver", "tel:+33500000000", "mailto:essai@example.com"):
            validate_destination(url)
        for url in ("//example.com", "javascript:alert(1)", "https://who@example.com", "https://example.com/ a"):
            with self.subTest(url=url), self.assertRaises(Rejected):
                validate_destination(url)


class RuntimeTests(unittest.TestCase):
    def test_budget_keeps_unknown_provider_outcome_reserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Run(Path(tmp) / "test", 10)
            charge = run.reserve("fal", "video", 7)
            self.assertEqual(charge["state"], "reserved_outcome_unknown")
            with self.assertRaises(Blocked):
                run.reserve("fal", "retry", 7)
            run.settle(charge, 4)
            self.assertEqual(run.remaining, 6)
            with self.assertRaises(FileExistsError):
                Run(run.directory, 10)

    def test_provider_rejected_before_network_when_budget_missing(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"OPENAI_API_KEY": "test"}):
            run = Run(Path(tmp) / "test", 0)
            with patch("cinema_factory.providers.request_json") as request, self.assertRaises(Blocked):
                speak(run, "test", "instructions", {}, [])
            request.assert_not_called()

    def test_inventory_requires_runtime_auth_and_authorized_budget(self):
        with patch.dict("os.environ", {"FAL_KEY": "test"}, clear=True):
            self.assertEqual(routes_for({}, 0), {})
            self.assertEqual(set(routes_for({}, 10)), {"fal-text", "fal-reference"})
            self.assertEqual(set(routes_for({"clip": {}}, 0)), {"client"})
        self.assertEqual(planned_charge(
            {"route": "fal-reference", "seconds": 8, "resolution": "1080p"}), 1_883_000)

    def test_queue_url_keeps_credentials_on_provider_host(self):
        queue_url("https://queue.fal.run/kling/v4/requests/abc-123/status")
        for url in ("https://queue.fal.run.other.test/kling/v4/requests/aaa",
                    "https://queue.fal.run@other.test/kling/v4/requests/aaa"):
            with self.assertRaises(Rejected):
                queue_url(url)

    def test_fal_uses_provider_poll_and_result_urls_without_second_submission(self):
        status = "https://queue.fal.run/kling/v4/requests/job-1/status"
        output = "https://queue.fal.run/kling/v4/requests/job-1"
        responses = [
            {"request_id": "job-1", "status_url": status, "response_url": output},
            {"status": "COMPLETED"},
            {"video": {"url": "https://v3b.fal.media/clip.mp4"}},
        ]
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"FAL_KEY": "test"}):
            run = Run(Path(tmp) / "test", 900_000)
            with patch("cinema_factory.providers.request_json", side_effect=responses) as request:
                result = fal_job(run, "video", "kling/v4/text-to-video", {"duration": 3}, 471_000)
            self.assertIn("video", result)
            self.assertEqual(run.charges[0]["request_id"], "job-1")
            self.assertEqual(run.charges[0]["state"], "usage_estimated")
            calls = request.call_args_list
            self.assertTrue(calls[0].args[0].endswith("/text-to-video"))
            self.assertEqual([call.args[0] for call in calls[1:]], [status, output])
            self.assertTrue(all("payload" not in call.kwargs for call in calls[1:]))

    def test_assets_cannot_escape_operator_inventory_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "assets.json"
            path.write_text('[{"id":"escape","file":"../outside.mp4","rights":"test"}]')
            with self.assertRaisesRegex(Rejected, "authorized footage"):
                read_assets(path)


if __name__ == "__main__":
    unittest.main()
