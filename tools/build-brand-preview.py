"""Package editable brand artwork into the self-contained design comparison."""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'design' / 'brand-comparison.template.html'
output = source.with_name('brand-comparison.html')
html = source.read_text(encoding='utf-8')
for name in ('yudu', 'youyu', 'yujian'):
    artwork = (ROOT / 'design' / 'brand' / f'{name}.svg').read_bytes()
    uri = 'data:image/svg+xml;base64,' + base64.b64encode(artwork).decode('ascii')
    html = html.replace(f'__{name.upper()}_ICON__', uri)
if '__ICON__' in html or any(f'__{name.upper()}_ICON__' in html for name in ('yudu', 'youyu', 'yujian')):
    raise SystemExit('Unresolved brand asset')
output.write_text(html, encoding='utf-8')
print(output)
