"""Run an audited brief, or assemble footage from an explicitly supplied plan."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from time import monotonic

from .contracts import Blocked, Rejected, validate_destination, validate_plan
from .director import OFFERS, compile_direction, media_cost, propose, read_history, shot_key
from .inspection import constrain_revision, correction_scope, evaluate, inspect_movie
from .local_model import local_speaker
from .film import build_site, probe
from .providers import REASONING_RESERVATION, ROUTES, produce, routes_for, speak
from .qa import browser_qa, deliver
from .runtime import Run, capabilities, digest, read_assets, read_funds, write_json

def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    modes.add_parser("doctor", help="inspect local executables and credential presence")
    for mode in ("run", "assemble", "design"):
        sub = modes.add_parser(mode)
        sub.add_argument("brief", type=Path)
        sub.add_argument("--out", type=Path, required=True)
        sub.add_argument("--assets", type=Path, help="authorized local footage inventory")
        sub.add_argument("--destinations", type=Path, help="trusted destination IDs and URLs")
        if mode == "assemble":
            sub.add_argument("--plan", type=Path, required=True)
            continue
        sub.add_argument("--budget-microusd", type=int, default=0, help="authorized per-run provider limit")
        sub.add_argument("--funds", type=Path, help="fresh verification of provider balances")
        sub.add_argument("--offer", choices=OFFERS, default="cinematic")
        sub.add_argument("--history", type=Path, action="append", default=[])
        sub.add_argument("--corrections", type=int, choices=(0, 1, 2), default=1)
        if mode == "design":
            sub.add_argument("--production-cap-microusd", type=int, default=2_300_000,
                             help="hypothetical media envelope; design does not submit media")
            sub.add_argument("--local-url", help="loopback llama.cpp URL for no-charge bench")
            sub.add_argument("--local-model", default="qwen2.5")
    inspect = modes.add_parser("inspect", help="measure existing real film without API calls")
    inspect.add_argument("master", type=Path)
    inspect.add_argument("--plan", type=Path, required=True)
    inspect.add_argument("--out", type=Path, required=True)
    inspect.add_argument("--brief", type=Path, help="brief for a local vision critique")
    inspect.add_argument("--local-url", help="loopback URL of a vision-capable llama.cpp server")
    inspect.add_argument("--local-model", default="qwen2.5-vl")
    return parser.parse_args()


def launch(args, run):
    info = capabilities()
    brief = args.brief.read_text().strip()
    if not brief or len(brief.encode()) > 8_000:
        raise Rejected("The brief must contain 1–8,000 UTF-8 bytes")
    assets = read_assets(args.assets)
    destinations = json.loads(args.destinations.read_text()) if args.destinations else {}
    for url in destinations.values():
        validate_destination(url)
    run.record("intake", "completed", brief_sha256=digest(args.brief),
               capabilities=info, source="model" if args.mode == "run" else "supplied-plan")
    design_only = args.mode == "design"
    planned = args.mode != "assemble"
    offer = getattr(args, "offer", "cinematic")
    local = getattr(args, "local_url", None)
    speaker = local_speaker(local, args.local_model) if local else speak
    history = read_history(args.history) if planned else []
    if not design_only and not all(info["executables"][name] for name in ("ffmpeg", "ffprobe", "node")):
        raise Blocked("FFmpeg, ffprobe and Node are required")
    if args.mode == "run" and offer == "immersive":
        raise Blocked("Use design to export an Immersive blueprint for its media renderer")
    if planned and not local:
        if not info["credentials"]["OPENAI_API_KEY"]:
            raise Blocked("OPENAI_API_KEY absent from the execution runtime")
        if run.cap <= 0:
            raise Blocked("No authorized provider budget")
        run.funds = read_funds(args.funds)
        run.record("funds", "verified_by_operator", balances=run.funds)
    if design_only:
        if args.production_cap_microusd < 0:
            raise Rejected("Invalid hypothetical production budget")
        routes = {k: v for k, v in ROUTES.items() if k != "client" or assets}
    else:
        routes = routes_for(assets, run.cap)
        if args.mode == "run":
            routes = {k: v for k, v in routes.items() if k == "client" or
                      ("fal" if k.startswith("fal-") else "runway") in run.funds}
            if not routes:
                raise Blocked("No verified production route with matching credentials and funds")
    run.record("production_inventory", "completed", enabled=routes, supported=ROUTES,
               hypothetical=design_only)
    asset_context = {k: {a: v for a, v in value.items() if a != "path"} for k, value in assets.items()}
    feedback = []
    generated = {}
    references = {}
    prior = None
    prior_sources = []
    correction = None
    corrections = args.corrections if planned else 0
    for turn in range(corrections + 1):
        work = run.directory / f"attempt-{turn + 1}"
        work.mkdir()
        try:
            cap = (args.production_cap_microusd if design_only else
                   max(0, run.remaining - REASONING_RESERVATION * (1 if prior else 2)))
            if planned:
                run.record("creative_plan", "started", attempt=turn + 1)
                direction = propose(speaker, run, brief, routes, asset_context, destinations, history,
                                    feedback, offer, cap)
                write_json(work / "direction.json", direction)
                write_json(work / "similarity.json", [])
                plan, comparisons = compile_direction(
                    direction, routes, assets, destinations, history, offer,
                    editing=correction is not None,
                )
                write_json(work / "similarity.json", comparisons)
                if correction:
                    constrain_revision(prior, plan, correction)
                reused = {i: prior_sources[i] for i, shot in enumerate(plan["shots"])
                          if correction and i not in correction["regenerate"] and shot["route"] != "client"
                          } if plan else {}
                new_media = {"shots": [s for i, s in enumerate(plan["shots"]) if i not in reused]} if plan else None
                minimum = media_cost(new_media, generated, references)
                if minimum > cap:
                    raise Rejected("Planned media exceeds the declared production envelope")
                write_json(work / "production-estimate.json", {
                    "video_and_references_microusd": minimum if plan else None,
                    "ceiling_microusd": cap,
                    "hypothetical": design_only,
                    "review_reserve_microusd": REASONING_RESERVATION,
                })
            else:
                reused = {}
                plan = json.loads(args.plan.read_text())
                validate_plan(plan, routes, assets, destinations)
            if plan:
                write_json(work / "plan.json", plan)
            chosen = direction if planned else plan
            run.record("creative_plan", "completed", attempt=turn + 1,
                       selected=chosen["concepts"][chosen["selected"]]["name"],
                       routes=[shot["route"] for shot in plan["shots"]] if plan else [],
                       origin="autonomous_model" if planned else "supplied_plan")
            if design_only:
                run.record("design", "completed", video_requests=0, offer=offer)
                return
            if planned and minimum + REASONING_RESERVATION > run.remaining:
                raise Rejected("Planned media plus artistic inspection exceed remaining budget")
            shot_keys = [shot_key(s) for s in plan["shots"]]
            sources = []
            started = monotonic()
            for index, shot in enumerate(plan["shots"]):
                run.record("media", "started", shot=index, route=shot["route"])
                if shot["route"] == "client":
                    asset = assets[shot["asset_id"]]
                    path = asset["path"]
                    rights = asset["rights"]
                    if digest(path) != asset["sha256"]:
                        raise Rejected("Authorized input was modified after intake")
                elif index in reused:
                    path = reused[index]
                    rights = "Reused verified source within the diagnosed revision"
                else:
                    key = shot_keys[index]
                    if key not in generated:
                        path = work / f"source-{index + 1}.mp4"
                        produce(run, shot, path, references)
                        probe(path)
                        generated[key] = path
                    path = generated[key]
                    rights = "Provider-generated; verify agreement and dispute input rights before publication"
                sources.append(path)
                run.record("media", "completed", shot=index, route=shot["route"],
                           sha256=digest(path), rights=rights)
            run.local["media_wall_seconds"] = round(monotonic() - started, 2)
            master, report = build_site(plan, sources, destinations, work)
            run.local.update({key: report[key] for key in (
                "assembly_seconds", "encode_seconds", "total_web_bytes",
            )})
            run.record("assembly", "completed", attempt=turn + 1, frames=report["frames"])
            started = monotonic()
            browser_qa(work)
            run.local["browser_qa_seconds"] = round(monotonic() - started, 2)
            run.record("browser_qa", "completed", attempt=turn + 1)
            if args.mode == "assemble":
                deliver(work, run.directory)
                run.record("delivery", "technical_preview",
                           artistic_review="not run", origin="supplied_plan_and_footage")
                return
            review = evaluate(speaker, run, master, brief, plan, work)
            defects = [axis for axis in review["axes"] if axis["grade"] != "PASS"]
            run.record("artistic_review", "completed", defects=defects,
                       limitations=review["limitations"])
            if defects:
                correction = correction_scope(review)
                write_json(work / "correction-decision.json", correction)
                prior = plan
                prior_sources = sources
                if not correction or turn == corrections:
                    run.record("correction", "stopped", attempt=turn + 1,
                               reason="No reliable or authorized correction remaining")
                    raise Rejected("The film did not pass every sampled artistic axis")
                feedback = [{"previous_direction": direction, "targeted_correction": correction}]
                continue
            deliver(work, run.directory)
            run.record("delivery", "quality_gated_preview",
                       commercial_acceptance="pending on-device and rights verification")
            return
        except Rejected as exc:
            run.record("correction", "rejected", attempt=turn + 1, reason=str(exc), defects=feedback)
            # After any video or inspection, only an evidence-backed diagnosis can revise.
            if turn == corrections or correction or (work / "master.mp4").exists():
                raise
            feedback = [{"reason": str(exc), "defects": feedback}]

    raise Rejected("No deliverable")


def main():
    args = parse_args()
    if args.mode == "doctor":
        print(json.dumps(capabilities(), indent=2))
        return 0
    cap = getattr(args, "budget_microusd", 0)
    if cap < 0:
        print("Budget must be nonnegative", file=sys.stderr)
        return 2
    try:
        run = Run(args.out.resolve(), cap)
    except FileExistsError:
        print("Use a new output directory. Previous evidence and reservations are immutable.", file=sys.stderr)
        return 2
    try:
        if args.mode == "inspect":
            plan = json.loads(args.plan.read_text())
            if args.local_url:
                if not args.brief:
                    raise Rejected("A local vision review needs the original brief")
                reviewer = local_speaker(args.local_url, args.local_model)
                review = evaluate(reviewer, run, args.master, args.brief.read_text().strip(), plan, run.directory)
                write_json(run.directory / "correction-decision.json", correction_scope(review))
            else:
                inspect_movie(args.master, plan, run.directory)
            run.record("inspection", "completed", artist_review=bool(args.local_url))
        else:
            launch(args, run)
    except (Blocked, Rejected, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        status = "blocked" if isinstance(exc, Blocked) else "rejected"
        reason = str(exc) if isinstance(exc, (Blocked, Rejected)) else type(exc).__name__
        run.record("execution", status, reason=reason)
        print(f"{status}: {reason}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
