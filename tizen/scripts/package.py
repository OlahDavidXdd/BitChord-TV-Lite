#!/usr/bin/env python3
"""Build a deterministic unsigned widget with a strict size budget."""
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'app'
ET.parse(source / 'config.xml')
files = ['config.xml', 'index.html', 'app.js', 'style.css', 'icon.png']
output = root / 'dist' / 'BitChord-TV-Lite-unsigned.wgt'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in files:
        info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (source / name).read_bytes())
size = output.stat().st_size
if size > 1024 * 1024:
    output.unlink()
    raise SystemExit('Widget exceeded the 1 MiB package budget')
print(f'{output}: {size:,} bytes ({size / 1024:.1f} KiB), UNSIGNED')
