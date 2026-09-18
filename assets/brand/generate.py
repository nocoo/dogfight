#!/usr/bin/env python3
"""Regenerate logo derivatives: uv run --with pillow python assets/brand/generate.py."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
config=json.loads((ROOT/'assets/brand/usage.json').read_text())
foreground=Image.open(ROOT/'logo.png').convert('RGBA')
square=Image.open(ROOT/'assets/brand/icon.png').convert('RGBA')
files=[]
for item in config['derivatives']:
    path=ROOT/item['path'];path.parent.mkdir(parents=True,exist_ok=True)
    role=item['role'];size=item.get('size',32)
    master=square if role=='platform-tile' else foreground
    if path.suffix=='.ico':
        foreground.save(path,format='ICO',sizes=[(s,s) for s in [16,24,32,48,64]])
    else:
        master.resize((size,size),Image.Resampling.LANCZOS).save(path)
    files.append({**item,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(ROOT/'assets/brand/derivatives.json').write_text(json.dumps({'source':'logo.png','files':files},indent=2)+'\n')
print('Generated',len(files),'role-specific logo derivatives.')
