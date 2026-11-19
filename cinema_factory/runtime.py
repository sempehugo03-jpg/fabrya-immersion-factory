"""Run artifacts, reservations and guarded provider I/O."""
import hashlib
import json
import os
import re
import shutil
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlsplit

from .contracts import Blocked, Rejected


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


class Run:
    def __init__(self, directory, cap):
        directory.mkdir(parents=True, exist_ok=False)
        self.directory = directory
        self.cap = cap
        self.events = []
        self.charges = []
        self.local = {}
        self.record("intake", "started")

    @property
    def remaining(self):
        return self.cap - sum(item["accounted_microusd"] for item in self.charges)

    def record(self, stage, status, **details):
        self.events.append(dict(
            stage=stage, status=status, utc=datetime.now(timezone.utc).isoformat(), **details,
        ))
        write_json(self.directory / "journal.json", self.events)
        self.save_costs()

    def save_costs(self):
        write_json(self.directory / "costs.json", {
            "cap_microusd": self.cap, "remaining_microusd": self.remaining,
            "provider_operations": self.charges, "local_measurements": self.local,
            "storage": "bytes measured if built; hosting bill unavailable",
            "delivery": "no external deployment or egress billing in this run",
        })

    def reserve(self, provider, operation, estimate):
        if not 0 < estimate <= self.remaining:
            raise Blocked(f"Remaining authorized budget cannot reserve {operation}: {estimate} µUSD")
        entry = dict(provider=provider, operation=operation, reserved_microusd=estimate,
                     accounted_microusd=estimate, state="reserved_outcome_unknown")
        self.charges.append(entry)
        self.save_costs()
        return entry

    def settle(self, entry, estimate, **evidence):
        entry.update(accounted_microusd=estimate, state="usage_estimated", **evidence)
        self.save_costs()
        if estimate > entry["reserved_microusd"]:
            raise Blocked("Observed usage exceeded reservation. Further calls stopped.")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def request_json(url, *, headers, payload=None, timeout=240):
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(url, data, headers={"Content-Type": "application/json", **headers})
    try:
        with OPENER.open(request, timeout=timeout) as output:
            return json.load(output)
    except urllib.error.HTTPError as exc:
        raise Blocked(f"{urlsplit(url).hostname} returned HTTP {exc.code}") from None
    except (OSError, ValueError):
        raise Blocked(f"{urlsplit(url).hostname}: connection or response unavailable") from None


def download(url, target, domains):
    parts = urlsplit(url)
    host = parts.hostname or ""
    if (parts.scheme != "https" or parts.username or parts.port not in (None, 443)
            or not any(host == domain or host.endswith("." + domain) for domain in domains)):
        raise Rejected("Unexpected provider media host")
    temporary = target.with_suffix(".part")
    try:
        with OPENER.open(url, timeout=90) as response, temporary.open("wb") as output:
            for _ in range(256):
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
            else:
                raise Rejected("Provider media exceeds 256 MiB")
        temporary.replace(target)
    except OSError:
        raise Blocked(f"Provider media download failed on {host}") from None
    finally:
        temporary.unlink(missing_ok=True)


def read_assets(path):
    if path is None:
        return {}
    base = path.resolve().parent
    rows = json.loads(path.read_text())
    result = {}
    for item in rows:
        key = item["id"]
        if not re.fullmatch(r"[a-z0-9_-]{1,64}", key) or key in result:
            raise Rejected("Asset IDs must be unique and portable")
        file = (base / item["file"]).resolve()
        if not file.is_relative_to(base) or not file.is_file() or not item["rights"].strip():
            raise Rejected(f"Missing or invalid authorized footage for {key}")
        result[key] = dict(path=file, rights=item["rights"], description=item["description"],
                           sha256=digest(file))
    return result


def capabilities():
    return {
        "credentials": {key: bool(os.getenv(key, "").strip()) for key in (
            "OPENAI_API_KEY", "FAL_KEY", "RUNWAYML_API_SECRET",
        )},
        "executables": {name: shutil.which(name) for name in (
            "ffmpeg", "ffprobe", "node", "chromium",
        )},
    }
