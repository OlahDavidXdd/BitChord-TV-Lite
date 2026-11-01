#!/usr/bin/env python3
"""Build a deterministic unsigned widget with a strict size budget."""
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
import sys

root = Path(__file__).resolve().parents[1]
source = root / 'app'
ET.parse(source / 'config.xml')
# Keep browser and helper implementations identical.
import json
import shutil
shutil.copyfile(root.parent / 'shared/soundcloud-public.cjs', source / 'soundcloud-public.js')
bootstrap = json.loads((root.parent / 'shared/soundcloud-bootstrap.json').read_text())
(source / 'soundcloud-bootstrap.js').write_text('window.SOUNDCLOUD_PUBLIC_BOOTSTRAP = ' + json.dumps(bootstrap) + ';\n')
shutil.copyfile(root.parent / 'shared/music-public.cjs', source / 'music-public.js')
on_tv = '--on-tv' in sys.argv
files = ['on-tv-boot.js', 'on-tv-player.js', 'youtube-player.html', 'youtube-player.js', 'config.xml', 'index.html', 'app.js', 'style.css', 'icon.png', 'config.js', 'soundcloud-public.js', 'soundcloud-bootstrap.js', 'soundcloud-free.js', 'tv-services.js', 'music-public.js', 'music-providers.js', 'soundcloud-browse.js', 'library-sync.js', 'logo.svg']
if on_tv:
    service = root / 'service'
    shutil.copyfile(root.parent / 'shared/soundcloud-public.cjs', service / 'soundcloud-public.js')
    shutil.copyfile(root.parent / 'shared/music-public.cjs', service / 'music-public.js')
    shutil.copyfile(root.parent / 'shared/soundcloud-bootstrap.json', service / 'soundcloud-bootstrap.json')
    files += ['../service/local-service.js', '../service/soundcloud-public.js', '../service/music-public.js', '../service/soundcloud-bootstrap.json', '../service/ca.pem']
output = root / 'dist' / ('BitChord-TV-OnDevice-unsigned.wgt' if on_tv else 'BitChord-TV-Lite-unsigned.wgt')
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in files + [p.relative_to(source).as_posix() for p in sorted((source / 'fonts').glob('*.woff2'))]:
        archive_name = name.replace('../service/', 'service/')
        info = zipfile.ZipInfo(archive_name, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        data = (source / name).read_bytes()
        if on_tv and name == 'config.js':
            data = b"window.BITCHORD_CONFIG = { onTVService: true, soundCloudPublicHelperUrl: 'http://127.0.0.1:8790' };\n"
        elif on_tv and name == 'index.html':
            data = data.replace(b'1.6.0 \xc2\xb7 TV Lite', b'1.7.1 \xc2\xb7 On-TV service test')
        elif on_tv and name == 'config.xml':
            data = data.replace(b'BitChordTV', b'BChordOnTV').replace(b'https://bitchord.in/tv-lite', b'https://bitchord.in/tv-on-device-test').replace(b'<name>BitChord TV Lite</name>', b'<name>BitChord On-TV Test</name>')
            data = data.replace(b'version="1.6.0"', b'version="1.7.1"').replace(b'background-support="disable"', b'background-support="enable"')
            data = data.replace(b'</widget>', b'  <feature name="http://tizen.org/feature/web.service"/>\n  <tizen:privilege name="http://developer.samsung.com/privilege/network.public"/>\n  <tizen:service id="BChordOnTV.LocalService"><tizen:content src="service/local-service.js"/><tizen:name>BitChordLocalService</tizen:name><tizen:description>On-TV public music metadata and media proxy</tizen:description></tizen:service>\n</widget>')
            ET.fromstring(data)
        archive.writestr(info, data)
size = output.stat().st_size
if size > 1024 * 1024:
    output.unlink()
    raise SystemExit('Widget exceeded the 1 MiB package budget')
print(f'{output}: {size:,} bytes ({size / 1024:.1f} KiB), UNSIGNED')
