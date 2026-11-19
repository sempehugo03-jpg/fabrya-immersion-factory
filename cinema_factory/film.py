"""FFmpeg timeline, frame packs, provenance and site assembly."""
import base64
import html
from hashlib import sha256
import json
import math
import re
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path
from time import monotonic

from .contracts import Rejected
from .runtime import digest, write_json

FPS = 24
ROOT = Path(__file__).resolve().parents[1]
PLAYER = ROOT / "experiments" / "gestes-cinema" / "web"
HEIGHT = {"720p": 720, "1080p": 1080, "2160p": 2160}
PROFILES = {"desktop": (1152, 648, 6_000_000), "mobile": (576, 720, 3_000_000)}


def command(args, timeout=180):
    return subprocess.run(args, capture_output=True, check=True, timeout=timeout)


def ffmpeg(*args):
    return command(["ffmpeg", "-nostdin", "-v", "error", "-y", "-filter_threads", "2", *map(str, args)])


def probe(path):
    data = json.loads(command([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_streams", "-show_format", "-of", "json", str(path),
    ]).stdout)
    if not data["streams"]:
        raise Rejected("The source does not contain film footage")
    stream = data["streams"][0]
    duration = float(stream.get("duration") or data["format"].get("duration") or 0)
    fps = float(Fraction(stream["avg_frame_rate"]))
    if (stream.get("disposition", {}).get("attached_pic") or not math.isfinite(duration)
            or fps < 12 or duration < 1):
        raise Rejected("The source contains no usable continuous moving image")
    rotation = next((row.get("rotation", 0) for row in stream.get("side_data_list", [])
                     if "rotation" in row), 0)
    return dict(width=stream["width"], height=stream["height"], fps=fps,
                seconds=duration, rotation=rotation, sha256=digest(path))


def master_film(plan, sources, work):
    started = monotonic()
    inputs = [probe(source) for source in sources]
    native_limits = []
    for shot, item in zip(plan["shots"], inputs, strict=True):
        if item["rotation"] or item["width"] * 9 != item["height"] * 16:
            raise Rejected("Current master encoding requires landscape 16:9 footage with no rotation")
        if item["seconds"] + .05 < shot["trim_start"] + shot["seconds"]:
            raise Rejected("The source does not contain the requested time range")
        if item["height"] < HEIGHT[shot["resolution"]]:
            raise Rejected("Source dimensions fell short of the production plan")
        native_limits.append(min(item["height"], HEIGHT[shot["resolution"]]))
    height = min(native_limits)
    width = height * 16 // 9
    parts = []
    for i, (shot, path) in enumerate(zip(plan["shots"], sources, strict=True)):
        part = work / f"cut-{i:02}.mp4"
        ffmpeg("-ss", shot["trim_start"], "-threads", 3, "-i", path,
               "-frames:v", shot["seconds"] * FPS, "-an", "-map", "0:v:0",
               "-vf", f"fps={FPS},scale={width}:{height}:flags=lanczos,setsar=1",
               "-c:v", "libx264", "-threads", 4, "-preset", "fast", "-crf", "16",
               "-pix_fmt", "yuv420p", part)
        parts.append(part)
    concat = work / "timeline.txt"
    concat.write_text("".join(f"file '{part.name}'\n" for part in parts))
    master = work / "master.mp4"
    ffmpeg("-f", "concat", "-safe", "1", "-i", concat, "-c", "copy", "-movflags", "+faststart", master)
    for part in parts:
        part.unlink()
    frames = sum(shot["seconds"] for shot in plan["shots"]) * FPS
    report = {"sources": inputs, "master": probe(master), "frames": frames,
              "upscaled": False, "interpolated": False, "assembly_seconds": round(monotonic() - started, 2),
              "native_definition": "Source dimensions verified. Capture/generation origin requires provenance."}
    return master, report


def structure(plan, destinations, height, width):
    crop = (height * 4 // 5) // 2 * 2
    left = round((plan["mobile_center"] * width - crop / 2) / 2) * 2
    left = max(0, min(width - crop, left))
    actions = {a["id"]: dict(a, href=destinations.get(a["destination_id"], "")) for a in plan["actions"]}
    hotspots = []
    for point in plan["hotspots"]:
        mobile_x = (point["x"] * width - left) / crop
        if not .09 <= mobile_x <= .91:
            raise Rejected("The mobile crop cuts a synchronized business action")
        before = sum(shot["seconds"] * FPS for shot in plan["shots"][:point["shot"]])
        start = before + math.ceil(point["start"] * FPS)
        end = before + math.ceil(point["end"] * FPS) - 1
        hotspots.append(dict(start=start, end=end, x=point["x"], y=point["y"],
                             action=actions[point["action_id"]]))
    return crop, left, list(actions.values()), hotspots


def encode_packs(master, media, work, frames, height, width, crop, left):
    profiles = {}
    for name, (out_w, out_h, budget) in PROFILES.items():
        directory = work / f"frames-{name}"
        directory.mkdir()
        transform = f"scale={out_w}:{out_h}:flags=lanczos"
        if name == "mobile":
            transform = f"crop={crop}:{height}:{left}:0,{transform}"
        for quality in (77, 64, 53):
            ffmpeg("-threads", 3, "-i", master, "-an", "-vf", transform,
                   "-c:v", "libwebp", "-quality", quality, "-compression_level", 4,
                   "-start_number", 0, directory / "%04d.webp")
            files = sorted(directory.glob("*.webp"))
            if len(files) != frames:
                raise Rejected(f"{name}: expected {frames} frames, observed {len(files)}")
            if sum(file.stat().st_size for file in files) <= budget:
                break
        else:
            raise Rejected(f"{name}: frame pack exceeded {budget:,} bytes after compression")
        destination = media / f"{name}.bin"
        offsets = [0]
        unique = set()
        with destination.open("wb") as output:
            for file in files:
                data = file.read_bytes()
                output.write(data)
                offsets.append(offsets[-1] + len(data))
                unique.add(sha256(data).digest())
        if len(unique) < frames * .4:
            raise Rejected(f"{name}: insufficient distinct decoded frames")
        shutil.copy2(files[0], media / f"{name}.webp")
        shutil.rmtree(directory)
        profiles[name] = dict(width=out_w, height=out_h, left=left / width if name == "mobile" else 0,
                              span=crop / width if name == "mobile" else 1,
                              offsets=offsets, pack=f"media/{name}.bin")
        write_json(work / f"encoding-{name}.json", dict(
            pack_bytes=offsets[-1], unique_frames=len(unique), quality=quality,
        ))
    return profiles


def render_html(plan, actions):
    source = (PLAYER / "index.html").read_text()
    title = html.escape(plan["concepts"][plan["selected"]]["name"])
    brand = html.escape(plan["brand"])
    description = html.escape(plan["description"], quote=True)
    source = re.sub(r"<title>.*?</title>", lambda _: f"<title>{brand} · {title}</title>", source)
    source = source.replace("Résonance · FABRYA", brand).replace(">Au tour</h1>", f">{title}</h1>")
    source = source.replace("Des mains façonnent une pièce d’argile sur un tour de potier.", description)
    source = source.replace("Séquence filmée du façonnage au tour", description)
    source = source.replace("Examiner le façonnage au tour", "Ouvrir la fiche")
    source = re.sub(r"(<h2 id=\"detail-title\">).*?(</h2>)", r"\1Fiche\2", source)
    source = re.sub(r"    <p>Le tour fait tourner.*?</p>",
                    '    <p class="detail-copy"></p><p><a class="detail-link" hidden></a></p>', source)
    links = []
    for action in actions:
        label, heading, body, href = (html.escape(action[k], quote=True)
                                      for k in ("label", "heading", "body", "href"))
        if href:
            links.append(f'<a href="{href}">{label}</a>')
        else:
            links.append(f'<button type="button" data-heading="{heading}" data-body="{body}">{label}</button>')
    navigation = '<nav class="direct-actions" aria-label="Services">' + "".join(links) + "</nav>"
    source = source.replace("</header>", f"</header>\n        {navigation}")
    if any(shot["route"] == "runway-text" for shot in plan["shots"]):
        source = source.replace("<footer></footer>",
                                '<footer><a href="https://runwayml.com/">Powered by Runway</a></footer>')
    return source


def temporal_checks(master):
    # Checks every frame at reduced resolution, independent of the visual review samples.
    filters = ("scale=320:-2,freezedetect=n=-55dB:d=0.55,"
               "blackdetect=d=0.2:pix_th=0.06:pic_th=0.97")
    result = command([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "info", "-threads", "3",
        "-filter_threads", "2", "-i", str(master), "-an", "-vf", filters, "-f", "null", "-",
    ])
    diagnostics = result.stderr.decode()
    freezes = re.findall(r"freeze_start: ([\d.]+)", diagnostics)
    black = re.findall(r"black_start:([\d.]+)", diagnostics)
    if freezes or black:
        raise Rejected(f"Full-film check found freezes at {freezes} s or black intervals at {black} s")
    return {"freeze_min_seconds": .55, "black_min_seconds": .2, "sample_width": 320,
            "freeze_intervals": freezes, "black_intervals": black}


def build_site(plan, sources, destinations, work):
    master, report = master_film(plan, sources, work)
    height, width = (report["master"][key] for key in ("height", "width"))
    crop, left, actions, hotspots = structure(plan, destinations, height, width)
    report["temporal_checks"] = temporal_checks(master)
    media = work / "web" / "media"
    media.mkdir(parents=True)
    web = media.parent
    started = monotonic()
    profiles = encode_packs(master, media, work, report["frames"], height, width, crop, left)
    shutil.copy2(PLAYER / "player.js", web / "player.js")
    styles = (PLAYER / "style.css").read_text()
    (web / "style.css").write_text(styles + """
.direct-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:0 0 .55rem}
.direct-actions :is(a,button){display:inline-grid;min-height:44px;align-items:center;padding:.35rem .75rem;border:1px solid var(--edge);background:var(--ink);color:var(--paper);font-size:.86rem;text-decoration:none}
@media(max-width:650px){.pin{width:min(100%,max(260px,calc((100svh - 194px)*.8 + 1.2rem)))}}
""")
    (web / "index.html").write_text(render_html(plan, actions))
    write_json(web / "track.json", dict(fps=FPS, frames=report["frames"],
                                       actions=actions, hotspots=hotspots, profiles=profiles))
    report.update(encode_seconds=round(monotonic() - started, 2), browser_bytes={
        name: profile["offsets"][-1] for name, profile in profiles.items()
    }, total_web_bytes=sum(file.stat().st_size for file in web.rglob("*") if file.is_file()))
    write_json(work / "film.json", report)
    return master, report


def inspection_images(master, plan, work):
    """Sample the master at chronological positions, with extra coverage around cuts."""
    sample_dir = work / "inspection"
    sample_dir.mkdir()
    images = []
    offset = 0
    for number, shot in enumerate(plan["shots"], 1):
        seconds = shot["seconds"]
        for index, fraction in enumerate((.03, .25, .50, .75, .96)):
            timestamp = offset + fraction * seconds
            path = sample_dir / f"shot-{number}-{index}.jpg"
            ffmpeg("-ss", f"{timestamp:.4f}", "-i", master, "-frames:v", "1",
                   "-vf", "scale=640:-2", "-q:v", "3", "-threads", "2", path)
            images.append({"type": "input_text", "text": f"Plan {number}, t={timestamp:.2f} s"})
            images.append({"type": "input_image", "detail": "low",
                           "image_url": "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()})
        offset += seconds
    return images
