#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 MASTER.mp4" >&2
    exit 2
fi
root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
master="$1"

encode_profile() {
    name="$1"
    filter="$2"
    directory="$root/web/media/$name"
    mkdir -p "$directory"
    ffmpeg -nostdin -v error -y -threads 3 -filter_threads 2 -i "$master" -an \
        -vf "$filter" -c:v libx264 -preset fast -tune fastdecode -threads 3 -crf 20 \
        -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -pix_fmt yuv420p -movflags +faststart "$directory/seek.mp4"
    ffmpeg -nostdin -v error -y -threads 3 -filter_threads 2 -i "$master" -an \
        -vf "$filter" -c:v libwebp -quality 78 -compression_level 4 -start_number 0 "$directory/%03d.webp"
    test "$(find "$directory" -maxdepth 1 -name '*.webp' | wc -l)" -eq 120
}
encode_profile desktop 'scale=1280:720:flags=lanczos'
encode_profile mobile 'crop=1620:2160:1360:0,scale=540:720:flags=lanczos'
