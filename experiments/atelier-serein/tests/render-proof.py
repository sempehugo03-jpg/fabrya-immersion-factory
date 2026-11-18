"""Build a continuous camera render with verified stills when screen recording is unavailable."""
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont, ImageOps

proof, source = map(Path, sys.argv[1:3])
frames = Path(__file__).resolve().parents[1] / 'web/frames'
fps = 16
width, height = 390, 844
cream = (244, 234, 221)
foreground = (9, 21, 16)

def font(family, size):
    return ImageFont.truetype(f'/usr/share/fonts/truetype/{family}', size)

serif = font('liberation2/LiberationSerif-Regular.ttf', 45)
small = font('dejavu/DejaVuSans.ttf', 15)
eyebrow = font('dejavu/DejaVuSans-Bold.ttf', 11)
chrome = Image.open(proof / 'mobile-ouverture.jpg').convert('RGB').crop((0, 0, width, 59))
shade = Image.new('RGBA', (width, height))
da = ImageDraw.Draw(shade)
for y in range(height):
    alpha = int(235 * max(0, (y / height - .2) / .8)**1.65)
    da.line((0, y, width, y), fill=(*foreground, alpha))

chapters = [
    ('MAISON DE SOINS', 'Atelier\nSerein', 'Un temps réservé à soi.'),
    ('L’ACCUEIL', 'Le bruit reste\ndehors.', 'La lumière guide les premiers pas.'),
    ('LA SALLE', 'Chaque détail\nprépare le soin.', 'Le lin et la pierre donnent le ton.'),
    ('LE RITUEL', 'Le soin\ncommence ici.', 'Une huile tiède, choisie avec vous.'),
]

def make_frame(index):
    base = ImageOps.fit(Image.open(frames / f'{index:03}.webp').convert('RGB'), (width, height))
    base = Image.alpha_composite(base.convert('RGBA'), shade).convert('RGB')
    base.paste(chrome, (0, 0))
    draw = ImageDraw.Draw(base)
    progress = index / 95
    chapter = max(0, min(3, (progress - .085) * 4.2))
    text_layer = Image.new('RGBA', (width,height))
    for i, (label, title, line) in enumerate(chapters):
        opacity = round(255 * max(0, 1 - 1.55 * abs(chapter - i)))
        if opacity == 0:
            continue
        text = ImageDraw.Draw(text_layer)
        text.text((24, 564), label, font=eyebrow, fill=(220,223,185,opacity))
        text.multiline_text((24, 588), title, font=serif, spacing=-6, fill=(*cream,opacity))
        text.text((24, 687), line, font=small, fill=(*cream,opacity))
    base = Image.alpha_composite(base.convert('RGBA'), text_layer).convert('RGB')
    draw = ImageDraw.Draw(base)
    draw.line((24, 765, 38, 765), fill=(220,223,185), width=1)
    draw.text((48, 755), 'Découvrir la maison', font=small, fill=cream)
    draw.rectangle((0, 841, width, 843), fill=(56,65,51))
    draw.rectangle((0, 841, round(width * progress), 843), fill=(220,223,185))
    return base

with TemporaryDirectory(prefix='serein-proof-') as directory:
    folder = Path(directory)
    for index in range(96):
        make_frame(index).save(folder / f'frame-{index:03}.jpg', quality=91)
    clips = [(f'frame-{index:03}.jpg', 1/fps) for index in range(96)]
    traversal = [('desktop-start.jpg', 1.2), ('mobile-start.jpg', 1.2)] + clips
    traversal += [('frame-095.jpg', .65)] + list(reversed(clips[38:-1]))
    traversal += [('frame-038.jpg', .65)] + clips[39:]
    traversal += [('mobile-recapitulatif.jpg', 3)]
    ImageOps.contain(Image.open(proof / 'desktop-ouverture.jpg'), (width, height)).save(folder / 'desktop-small.jpg')
    desktop = Image.open(folder / 'desktop-small.jpg')
    pad = Image.new('RGB',(width,height), '#101b17')
    pad.paste(desktop, (0, (height-desktop.height)//2))
    note = ImageDraw.Draw(pad)
    note.text((23, 190),'Atelier Serein', font=serif, fill=cream)
    note.text((25, 245),'Rendu séquentiel et captures Chromium', font=small, fill=cream)
    pad.save(folder / 'desktop-start.jpg',quality=90)
    for name, dst in [('mobile-ouverture.jpg','mobile-start.jpg'),('mobile-recapitulatif.jpg','mobile-recapitulatif.jpg')]:
        (folder / dst).write_bytes((proof / name).read_bytes())

    def encode(parts, path):
        concat = ['ffconcat version 1.0']
        for name, duration in parts:
            concat += [f"file '{name}'", f'duration {duration:.6f}']
        concat.append(f"file '{parts[-1][0]}'")
        (folder / 'sequence.ffconcat').write_text('\n'.join(concat) + '\n')
        subprocess.run([
            'ffmpeg','-nostdin','-v','error','-y','-f','concat','-safe','0','-i',str(folder/'sequence.ffconcat'),
            '-vf','fps=30,format=yuv420p','-an','-c:v','libx264','-crf','19','-movflags','+faststart',str(path),
        ],check=True)

    encode(traversal, proof / 'parcours.mp4')
    first = folder / 'opening.mp4'
    encode(clips, first)
    cue_path = proof / 'reperes-mouvement.json'
    cue_path.write_text(json.dumps({i:i/fps for i in [33,56,95]}, indent=2)+'\n')
    subprocess.run([
        sys.executable, str(Path(__file__).with_name('compare-motion.py')),
        str(source),str(first),str(cue_path),str(proof/'comparaison-mouvement.mp4'),
    ],check=True)
