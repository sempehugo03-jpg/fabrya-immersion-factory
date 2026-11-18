"""Measure a simple edge-energy retention indicator at the delivered raster."""
import json
from pathlib import Path
import subprocess
import sys
import numpy as np

master = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
sample = (0,20,40,60,80,100,119)
select = 'select=' + '+'.join(f'eq(n\\,{n})' for n in sample)
profiles = {
    'desktop': (1280,720,'scale=1280:720:flags=lanczos'),
    'mobile': (540,720,'crop=1620:2160:1360:0,scale=540:720:flags=lanczos'),
}

def energy(source, filter_chain, width, height, sequence=False):
    args = ['ffmpeg','-nostdin','-v','error','-threads','2','-filter_threads','2']
    if sequence:
        args += ['-framerate','24','-start_number','0']
    args += ['-i',str(source),'-vf',filter_chain+',format=gray','-fps_mode','passthrough','-f','rawvideo','-']
    payload = subprocess.check_output(args)
    block = np.frombuffer(payload,dtype=np.uint8).reshape(len(sample),height,width).astype(np.float32)
    core = block[:,1:-1,1:-1]
    lap = core * 4 - block[:,1:-1,:-2] - block[:,1:-1,2:] - block[:,:-2,1:-1] - block[:,2:,1:-1]
    return float(np.sqrt(np.mean(lap**2)))

raw = {}
for name,(width,height,filter_chain) in profiles.items():
    directory = root/'web/media'/name
    reference = energy(master,select+','+filter_chain,width,height)
    a = energy(directory/'seek.mp4',select,width,height)
    c = energy(directory/'%03d.webp',select,width,height,sequence=True)
    raw[name] = {
        'referenceRms': round(reference,3),
        'videoRms': round(a,3),
        'webpRms': round(c,3),
        'videoRatio': round(a/reference,4),
        'webpRatio': round(c/reference,4),
    }
print(json.dumps({'indices':sample,'edgeIndicator':raw},indent=2))
