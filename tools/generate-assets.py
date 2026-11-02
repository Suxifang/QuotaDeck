"""Generate QuotaDeck's own vector-like application mark. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
size = 1024
image = Image.new('RGB', (size, size))
pixels = image.load()
for y in range(size):
    ratio = y / (size - 1)
    for x in range(size):
        light = (1 - x / size) * 8
        pixels[x, y] = (int(78 - ratio * 35 + light), int(147 - ratio * 42 + light), int(250 - ratio * 31))
draw = ImageDraw.Draw(image)
white = (255, 255, 255)
width = 70
draw.line([(280, 260), (280, 730)], fill=white, width=width)
draw.line([(280, 260), (475, 260)], fill=white, width=width)
draw.arc((240, 260, 735, 730), -90, 90, fill=white, width=width)
draw.line([(280, 730), (475, 730)], fill=white, width=width)
draw.line([(500, 555), (760, 800)], fill=white, width=width)
draw.line([(280, 450), (420, 450)], fill=white, width=width)
draw.line([(280, 575), (365, 575)], fill=white, width=width)
assets = root / 'mobile' / 'assets'
image.save(assets / 'icon.png')
image.resize((64, 64), Image.Resampling.LANCZOS).save(assets / 'favicon.png')
