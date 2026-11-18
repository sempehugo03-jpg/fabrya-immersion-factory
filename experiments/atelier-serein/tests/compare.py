"""Make a contact sheet of event-matched source and Chromium frames."""
from io import BytesIO
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps

source = Path(sys.argv[1])
proof = Path(sys.argv[2])
marks = [
    ('Accueil', '00:00.00', 'mobile-ouverture.png', '0 %'),
    ('Seuil', '00:02.25', 'mobile-seuil.png', '35 %'),
    ('Cabine', '00:03.50', 'mobile-cabine.png', '59 %'),
    ('Détail', '00:05.55', 'mobile-detail.png', '100 %'),
    ('Récapitulatif', '00:17.00', 'mobile-recapitulatif.png', 'Simulation'),
]

def font(size, bold=False):
    name = 'DejaVuSans-Bold' if bold else 'DejaVuSans'
    return ImageFont.truetype(f'/usr/share/fonts/truetype/dejavu/{name}.ttf', size)

def source_frame(at):
    data = subprocess.check_output([
        'ffmpeg', '-nostdin', '-v', 'error', '-ss', at, '-i', str(source),
        '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-threads', '1', '-',
    ])
    return Image.open(BytesIO(data)).crop((113, 93, 436, 729)).convert('RGB')

page = Image.new('RGB', (1400, 1238), '#101b17')
draw = ImageDraw.Draw(page)
draw.text((36, 28), 'Apex Beauty / Atelier Serein', fill='#f4eadd', font=font(36, True))
draw.text((36, 80), 'Comparaison par événements visuels et états du parcours commercial', fill='#d2dbc9', font=font(20))
for i, (name, time, filename, progress) in enumerate(marks):
    x = 36 + i * 269
    draw.text((x, 124), name, fill='#f4eadd', font=font(22, True))
    draw.text((x, 155), 'Réf.  ' + time, fill='#dcdfb9', font=font(17))
    page.paste(ImageOps.contain(source_frame(time), (235, 450)), (x, 186))
    draw.text((x, 654), 'Démo  ' + progress, fill='#dcdfb9', font=font(17))
    screenshot = proof / filename
    if not screenshot.exists():
        screenshot = screenshot.with_suffix('.jpg')
    shot = Image.open(screenshot).convert('RGB')
    page.paste(ImageOps.contain(shot, (235, 450)), (x, 685))
draw.text((36, 1154), 'Référence recadrée dans l’écran filmé. Démo capturée à 390 × 844 dans Chromium.', fill='#f4eadd', font=font(19))
draw.text((36, 1185), 'Le plan de soin oppose un geste humain à un détail matériel. Aucune équivalence de cadrage n’est postulée.', fill='#d2dbc9', font=font(17))
page.save(proof / 'comparaison.jpg', quality=90, optimize=True)
