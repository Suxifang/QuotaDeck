"""Render the approved 余度 mark. Requires CairoSVG and Pillow."""
import io
from pathlib import Path
import cairosvg
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'design' / 'brand' / 'yudu.svg'
image = Image.open(io.BytesIO(cairosvg.svg2png(url=str(source), output_width=1024, output_height=1024))).convert('RGB')
assets = root / 'mobile' / 'assets'
image.save(assets / 'icon.png')
image.resize((64, 64), Image.Resampling.LANCZOS).save(assets / 'favicon.png')
print('Generated approved Yudu icon and favicon from', source.name)
