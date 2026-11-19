"""Reproduce the offline inference benchmark. Never submits video or paid inference."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys

# Running this file as a script normally puts scripts/ first.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cinema_factory.director import read_history, similarities
from cinema_factory.runtime import write_json


def run_brief(brief, args):
    dest = args.out / brief.parent.name / brief.stem
    cmd = [sys.executable, "-m", "cinema_factory", "design", str(brief),
           "--out", str(dest), "--local-url", args.url, "--local-model", args.model,
           "--corrections", str(args.corrections), "--production-cap-microusd", str(args.cap)]
    for previous in args.history:
        cmd += ["--history", str(previous.resolve())]
    process = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    result = {"brief": str(brief.relative_to(ROOT)), "passed": process.returncode == 0,
              "returncode": process.returncode, "message": process.stderr.strip()}
    attempts = sorted(dest.glob("attempt-*"), reverse=True)
    latest_direction = next((work for work in attempts if (work / "direction.json").is_file()), None)
    if latest_direction:
        direction = json.loads((latest_direction / "direction.json").read_text())
        concepts = direction["concepts"]
        result.update(concepts=concepts, selected=direction["selected"], rationale=direction["rationale"],
                      direction_attempt=latest_direction.name)
        estimate = latest_direction / "production-estimate.json"
        if estimate.is_file():
            result["estimate"] = json.loads(estimate.read_text())
    print(f'{brief.stem}: {"accepted" if result["passed"] else result["message"]}', flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", type=lambda s: Path(s).resolve(), required=True)
    parser.add_argument("--jobs", type=int, choices=(1, 2), default=1)
    parser.add_argument("--cap", type=int, default=2_300_000)
    parser.add_argument("--corrections", type=int, choices=(0, 1, 2), default=1)
    parser.add_argument("--history", type=Path, action="append",
                        default=[ROOT / "docs/essais/la-traverse/plan.json"])
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    main_briefs = sorted((ROOT / "briefs/director/calibration").glob("*.md"))
    holdouts = sorted((ROOT / "briefs/director/holdout").glob("*.md"))
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        rows = list(pool.map(lambda brief: run_brief(brief, args), main_briefs + holdouts))
    selected = [row["concepts"][row["selected"]] for row in rows if row.get("passed") and "concepts" in row]
    write_json(args.out / "benchmark.json", {"model": args.model, "mode": "real_local_inference",
               "video_requests": 0, "provider_spend_microusd": 0, "results": rows,
               "cross_brief_similarity": similarities(selected, read_history(args.history))})
    return int(not all(row["passed"] for row in rows))


if __name__ == "__main__":
    sys.exit(main())
