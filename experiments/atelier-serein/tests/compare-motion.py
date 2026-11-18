"""Compare the direction of movement between event anchors, rescaling time explicitly."""
import json
from pathlib import Path
import subprocess
import sys

reference, recorded, cues_path, output = sys.argv[1:]
cues = json.loads(Path(cues_path).read_text())
ref = [0, 2.25, 3.50, 5.55]
demo = [0, *(cues[str(frame)] for frame in (33, 56, 95))]
if not (0 < demo[1] < demo[2] < demo[3] < 15):
    raise ValueError(f'Repères Chromium hors plage: {demo}')
parts = []
for i in range(3):
    scale = (ref[i+1] - ref[i]) / (demo[i+1] - demo[i])
    parts.append(f'[1:v]trim=start={demo[i]}:end={demo[i+1]},setpts=(PTS-STARTPTS)*{scale}[d{i}]')
parts += [
    '[d0][d1][d2]concat=n=3:v=1:a=0,fps=30,scale=320:-2,pad=360:756:20:47:color=0x101b17[demo]',
    '[0:v]trim=end=5.55,setpts=PTS-STARTPTS,crop=322:636:113:93,scale=320:-2,pad=360:756:20:47:color=0x101b17[ref]',
    '[ref][demo]hstack=inputs=2,drawtext=text=Apex Beauty:x=20:y=14:fontsize=21:fontcolor=white,'
    'drawtext=text=Atelier Serein:x=380:y=14:fontsize=21:fontcolor=white',
]
subprocess.run([
    'ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', reference, '-i', recorded,
    '-filter_complex_threads', '2', '-filter_complex', ';'.join(parts), '-an',
    '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
], check=True)
