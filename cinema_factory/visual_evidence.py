"""Verify source-derived observations before interpreting a model's artistic opinion."""
import math
from collections import Counter

from .contracts import Rejected
from .film import FPS, ffmpeg
from .runtime import digest


def frame_positions(plan):
    offset = 0
    count = 2 if len(plan["shots"]) == 4 else 3
    for shot, spec in enumerate(plan["shots"]):
        length = spec["seconds"] * FPS
        yield shot, [offset + round(part * (length - 1)) for part in
                     ((.08, .55, .92) if count == 3 else (.08, .92))]
        offset += length


def capture_frames(master, plan, metadata, crop, left, directory):
    if abs(metadata["fps"] - FPS) > .001:
        raise Rejected("Inspection requires the player's 24 fps master")
    height = metadata["height"]
    rows = []
    for shot, positions in frame_positions(plan):
        selector = "+".join(f"eq(n\\,{index})" for index in positions)
        for profile in ("desktop", "mobile"):
            filters = f"select={selector},"
            if profile == "mobile":
                filters += f"crop={crop}:{height}:{left}:0,"
            filters += "scale=320:-2"
            prefix = f"s{shot}-{profile}"
            ffmpeg("-threads", 2, "-i", master, "-an", "-vf", filters,
                   "-fps_mode", "vfr", "-start_number", 0, "-q:v", 3, "-threads", 1,
                   directory / f"{prefix}-%02d.jpg")
            files = sorted(directory.glob(f"{prefix}-*.jpg"))
            if len(files) != len(positions):
                raise Rejected("Evidence captures do not match the expected source positions")
            offset = sum(spec["seconds"] for spec in plan["shots"][:shot])
            for path, frame in zip(files, positions, strict=True):
                rows.append(dict(id=path.stem, file=path.name, profile=profile, shot=shot,
                                 frame=frame, time=frame/FPS-offset, sha256=digest(path)))
    return rows


def check_evidence(rows, plan, directory, metadata, crop, left, observations=None):
    expected = {(shot, profile, frame) for shot, frames in frame_positions(plan) for frame in frames
                for profile in ("desktop", "mobile")}
    found = {(row["shot"], row["profile"], row["frame"]) for row in rows}
    if found != expected or len(rows) != len(expected) or len({r["id"] for r in rows}) != len(rows):
        raise Rejected("Evidence has missing positions, duplicate IDs, or unexpected source frames")
    if len({r["file"] for r in rows}) != len(rows):
        raise Rejected("Evidence reuses a capture at a different position")
    defects = []
    for row in rows:
        path = directory / f'{row["id"]}.jpg'
        if not path.is_file() or path.name != row["file"] or digest(path) != row["sha256"]:
            raise Rejected("Missing or modified evidence capture")
        offset = sum(s["seconds"] for s in plan["shots"][:row["shot"]])
        if not math.isclose(row["time"], row["frame"]/FPS-offset, abs_tol=1e-7):
            raise Rejected("Evidence time does not match its source frame")
    hashes = Counter((r["shot"], r["profile"], r["sha256"]) for r in rows)
    for row in rows:
        if hashes[row["shot"], row["profile"], row["sha256"]] > 1:
            defects.append(dict(axis="stabilité temporelle", code="duplicate_image",
                                evidence_id=row["id"], shot=row["shot"], time=row["time"],
                                scope="stop", confidence="high",
                                detail="Deux positions distinctes montrent la même capture."))
            break
    if observations is not None:
        if observations.get("master_sha256") != metadata["sha256"] or not observations.get("origin", "").strip():
            raise Rejected("Measured subject observations must identify the exact source and origin")
        by_frame = {r["frame"]: r for r in rows if r["profile"] == "mobile"}
        seen = set()
        for item in observations["subjects"]:
            frame = item["frame"]
            row = by_frame.get(frame)
            if not row or frame in seen or not item["subject"].strip():
                raise Rejected("Measured subject observation lacks a unique sampled frame and subject")
            seen.add(frame)
            x0, y0, x1, y1 = item["bbox"]
            visibility = item["visible_fraction"]
            if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1 and 0 <= visibility <= 1):
                raise Rejected("Measured subject observation is outside the normalized source")
            width = metadata["width"]
            inside = max(0, min(x1, (left+crop)/width)-max(x0, left/width))/(x1-x0)
            detail = f'{item["subject"]} · {inside:.0%} dans le cadre, {visibility:.0%} visible dans la source.'
            common = dict(evidence_id=row["id"], shot=row["shot"], time=row["time"],
                          confidence="high", detail=detail)
            if inside < .95:
                defects.append(dict(axis="composition", code="mobile_crop_subject", scope="reframe", **common))
            if visibility < .8:
                defects.append(dict(axis="cohérence des objets", code="occluded_subject", scope="stop", **common))
    return defects


def ground_review(raw, report, frames, defects):
    ids = {r["id"]: r for r in frames}
    measured_axes = {d["axis"] for d in defects}
    for result in report["axes"]:
        axis = result["axis"]
        authored = raw["axes"][axis]
        cited = [ids.get(key) for key in authored["frames"]]
        if not cited or None in cited or len({row["id"] for row in cited}) != len(cited):
            raise Rejected("Visual opinion must cite existing distinct source captures")
        shot, time = authored["shot"], authored["time"]
        if not any(math.isclose(row["time"] if shot != -1 else row["frame"]/FPS, time, abs_tol=.05)
                   and (shot == -1 or shot == row["shot"]) for row in cited):
            raise Rejected("Visual opinion does not match the cited shot and position")
        if result["grade"] == "PASS" and authored.get("confidence") == "low":
            result.update(grade="UNVERIFIED", fix="Reprendre l’observation avec des images probantes.")
            report["diagnoses"].append(dict(axis=axis, shot=shot, time=time,
                evidence=result["evidence"], scope="stop", confidence="low", correction=result["fix"]))
        if result["grade"] == "PASS" and axis in ("composition", "cohérence des objets"):
            profile_pairs = {(r["shot"], r["frame"], r["profile"]) for r in cited}
            matched = any((s, f, "desktop") in profile_pairs and (s, f, "mobile") in profile_pairs
                          for s, f, _ in profile_pairs)
            if not matched and axis not in measured_axes:
                result.update(grade="UNVERIFIED", fix="Comparer les deux cadrages à la même position.")
                report["diagnoses"].append(dict(axis=axis, shot=shot, time=time,
                    evidence=result["evidence"], scope="stop", confidence="low", correction=result["fix"]))
        result["frames"] = authored["frames"]
    return apply_measured_defects(report, defects)


def apply_measured_defects(report, defects):
    for defect in defects:
        axis = next(row for row in report["axes"] if row["axis"] == defect["axis"])
        correction = ("Revoir le cadrage mobile et la visibilité du sujet."
                      if defect["scope"] == "reframe" else "")
        axis.update(grade="REVISE", evidence=defect["detail"], fix=correction,
                    frames=[defect["evidence_id"]])
        report["diagnoses"] = [d for d in report["diagnoses"] if d["axis"] != defect["axis"]]
        report["diagnoses"].append(dict(axis=defect["axis"], shot=defect["shot"], time=defect["time"],
            evidence=defect["detail"], scope=defect["scope"], confidence=defect["confidence"],
            correction=correction))
    report["deterministic_defects"] = defects
    return report
