#!/bin/sh
set -eu
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 SOURCE_4K.mp4 MASTER_COUPE.mp4" >&2
    exit 2
fi
experiment="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/desktop" "$work/mobile" "$experiment/web/media"
ffmpeg -nostdin -v error -y -ss 13.5 -i "$1" -t 8 -an -map 0:v:0 \
    -vf 'eq=contrast=1.075:brightness=-0.025:saturation=0.92' -c:v libx264 -threads 4 \
    -preset fast -crf 16 -pix_fmt yuv420p -movflags +faststart "$2"
ffmpeg -nostdin -v error -y -threads 3 -filter_threads 2 -i "$2" -an \
    -vf 'scale=1152:648:flags=lanczos' -c:v libwebp -quality 77 -compression_level 4 \
    -start_number 0 "$work/desktop/%03d.webp"
ffmpeg -nostdin -v error -y -threads 3 -filter_threads 2 -i "$2" -an \
    -vf 'crop=1728:2160:840:0,scale=576:720:flags=lanczos' -c:v libwebp -quality 77 -compression_level 4 \
    -start_number 0 "$work/mobile/%03d.webp"
python3 - "$work" "$experiment/web" <<'PY'
from pathlib import Path
import json
import sys
root, web = map(Path, sys.argv[1:])
media = web / 'media'
profiles = {}
count = 192
for name, width, height, left, span in [
    ('desktop', 1152, 648, 0, 1),
    ('mobile', 576, 720, 840/3840, 1728/3840),
]:
    files = sorted((root / name).glob('*.webp'))
    if len(files) != count:
        raise ValueError(f'{name}: {len(files)} images au lieu de {count}')
    pack = f'media/{name}.bin'
    offsets = [0]
    with (web / pack).open('wb') as output:
        for file in files:
            payload = file.read_bytes()
            output.write(payload)
            offsets.append(offsets[-1] + len(payload))
    (media / (name+'.webp')).write_bytes(files[0].read_bytes())
    profiles[name] = dict(width=width,height=height,left=left,span=span,pack=pack,offsets=offsets)
manifest = dict(fps=24,frames=count,hotspot=dict(start=86,end=191,x=.458,y=.53),profiles=profiles)
(web / 'track.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
PY
