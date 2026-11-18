"""Render a five-second, fixed-focal-length track past a separate foreground plane."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import json
import math
from multiprocessing import get_context
from pathlib import Path
import subprocess
import time

import numpy as np
from PIL import Image, ImageFilter

FPS = 24
COUNT = 120
FOCAL = 1.03
PLATE_DEPTH = 4.55
VESSEL_DEPTH = .94
ROOT = Path(__file__).resolve().parent
PROFILES = {
    'desktop': {'width': 1280, 'height': 720, 'left': 0, 'span': 1},
    'mobile': {'width': 540, 'height': 720, 'left': .3540625, 'span': .421875},
}

def camera(index):
    u = index / (COUNT - 1)
    ease = u * u * (3 - 2 * u)
    return .605 * ease, .023 * ease, .15 * ease, -.036 * ease

def project(point, pose, width, height):
    cx, cy, cz, yaw = pose
    x, y, z = (p - c for p, c in zip(point, (cx, cy, cz)))
    sine, cosine = math.sin(yaw), math.cos(yaw)
    image_x = x * cosine - z * sine
    depth = x * sine + z * cosine
    return width * (.5 + FOCAL * image_x / depth), height / 2 - width * FOCAL * y / depth

def plane(center, width, height, depth):
    cx, cy = center
    return [
        (cx-width/2, cy+height/2, depth),
        (cx+width/2, cy+height/2, depth),
        (cx+width/2, cy-height/2, depth),
        (cx-width/2, cy-height/2, depth),
    ]

def homography(destination, source):
    system, values = [], []
    for (x, y), (u, v) in zip(destination, source):
        system.extend(([x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]))
        values.extend((u, v))
    return np.linalg.solve(system, values).tolist()

def initialize(width, height):
    global raster, plate, prop, back_plane, front_plane, hero
    raster = (width, height)
    plate = Image.open(ROOT / 'media/workshop.png').convert('RGB')
    prop = Image.open(ROOT / 'media/vessel.png').convert('RGBA')
    prop = prop.crop(prop.getchannel('A').getbbox())
    prop = prop.filter(ImageFilter.GaussianBlur(.8))
    plate_width = PLATE_DEPTH / FOCAL * 1.25
    plate_height = plate_width * plate.height / plate.width
    back_plane = plane((.04,0), plate_width, plate_height, PLATE_DEPTH)
    prop_width = .559
    front_plane = plane((-.048,-.205), prop_width, prop_width * prop.height / prop.width, VESSEL_DEPTH)
    hero = (.04 + (.664 - .5) * plate_width, (.5 - .421) * plate_height, PLATE_DEPTH)

def corners(texture):
    return [(0,0),(texture.width,0),(texture.width,texture.height),(0,texture.height)]

def render(index):
    width, height = raster
    pose = camera(index)
    destination = [project(p, pose, width, height) for p in back_plane]
    background_map = homography(destination, corners(plate))
    image = plate.transform(raster, Image.Transform.PERSPECTIVE, background_map, Image.Resampling.BICUBIC)
    foreground = [project(p, pose, width, height) for p in front_plane]
    xs, ys = zip(*foreground)
    x0, y0 = max(0, math.floor(min(xs))), max(0, math.floor(min(ys)))
    x1, y1 = min(width, math.ceil(max(xs))), min(height, math.ceil(max(ys)))
    if x1 > x0 and y1 > y0:
        destination = [(x-x0, y-y0) for x,y in foreground]
        foreground_map = homography(destination, corners(prop))
        layer = prop.transform((x1-x0,y1-y0), Image.Transform.PERSPECTIVE, foreground_map, Image.Resampling.BICUBIC)
        image.paste(layer,(x0,y0),layer)
    return image.tobytes()

def generate_track():
    initialize(1280,720)
    points = []
    for index in range(COUNT):
        pose = camera(index)
        x,y = project(hero,pose,1280,720)
        foreground = project((-.048,-.205,VESSEL_DEPTH), pose,1280,720)
        points.append({
            'x': round(x/1280,6), 'y': round(y/720,6),
            'foregroundX': round(foreground[0]/1280,6),
        })
    return {'fps': FPS, 'frames': COUNT, 'profiles': PROFILES, 'hotspot': points}

def run(output, width, height, workers):
    command = [
        'ffmpeg','-nostdin','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24',
        '-video_size',f'{width}x{height}','-framerate',str(FPS),'-i','pipe:0','-an',
        '-c:v','libx264','-threads','3','-preset','fast','-crf','15','-pix_fmt','yuv420p',
        '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
        '-vf','scale=out_color_matrix=bt709','-movflags','+faststart',str(output),
    ]
    started = time.monotonic()
    with ProcessPoolExecutor(max_workers=workers, mp_context=get_context('spawn'), initializer=initialize, initargs=(width,height)) as executor:
        with subprocess.Popen(command, stdin=subprocess.PIPE) as ffmpeg:
            # Bound decoded 4K output waiting in the Python process.
            for start in range(0,COUNT,workers*2):
                for frame in executor.map(render,range(start,min(COUNT,start+workers*2))):
                    ffmpeg.stdin.write(frame)
                print(f'{min(COUNT,start+workers*2)}/{COUNT}',flush=True)
            ffmpeg.stdin.close()
            if ffmpeg.wait():
                raise RuntimeError('Échec du master FFmpeg')
    print(f'Composition et encodage: {time.monotonic()-started:.1f} s')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output',type=Path)
    parser.add_argument('--size',default='3840x2160')
    parser.add_argument('--workers',type=int,default=4)
    parser.add_argument('--stills',action='store_true')
    args = parser.parse_args()
    w,h = map(int,args.size.split('x'))
    if args.stills:
        initialize(w,h)
        args.output.mkdir(parents=True,exist_ok=True)
        for i in (0,36,60,88,119):
            Image.frombytes('RGB',(w,h),render(i)).save(args.output / f'view-{i:03}.jpg',quality=92)
    else:
        run(args.output,w,h,args.workers)
        (ROOT / 'web/track.json').write_text(json.dumps(generate_track(),separators=(',',':'))+'\n')
