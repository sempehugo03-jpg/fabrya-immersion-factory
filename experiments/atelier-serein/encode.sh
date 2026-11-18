#!/bin/sh
set -eu
source_dir="${1:-/tmp/serein-render}"
output_dir="$(dirname "$0")/web/frames"
mkdir -p "$output_dir"
# The Blender build used for this run has no OpenImageDenoise. Filter each frame
# independently so that forward and reverse display show the same image.
ffmpeg -hide_banner -loglevel error -y -threads 3 -filter_threads 4 \
  -start_number 1 -i "$source_dir/frame-%04d.jpg" \
  -vf "nlmeans=s=11:p=5:r=13,eq=contrast=1.055:brightness=-0.027:saturation=0.91" \
  -frames:v 96 -c:v libwebp -quality 80 -compression_level 4 -start_number 0 "$output_dir/%03d.webp"
test "$(find "$output_dir" -name '*.webp' | wc -l)" -eq 96
