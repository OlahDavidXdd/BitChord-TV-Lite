#!/usr/bin/env python3
"""Verify the final APK, including flags rejected by normal Android installers."""
from pathlib import Path
import re
import subprocess
import sys
import zipfile

sdk, *apks = sys.argv[1:]
if not apks:
    raise SystemExit('Usage: verify-apk.py ANDROID_SDK APK [APK ...]')
tools = sorted((Path(sdk) / 'build-tools').iterdir(), key=lambda p: [int(x) for x in re.findall(r'\d+', p.name)])[-1]
for name in apks:
    apk = Path(name)
    with zipfile.ZipFile(apk) as archive:
        bad = archive.testzip()
        if bad:
            raise SystemExit(f'{apk}: corrupt ZIP entry {bad}')
    manifest = subprocess.check_output([str(tools / 'aapt'), 'dump', 'xmltree', str(apk), 'AndroidManifest.xml'], text=True)
    for flag in ['testOnly', 'isSplitRequired', 'isFeatureSplit']:
        line = re.search(r'android:' + flag + r'[^\n]*', manifest)
        if line and not re.search(r'\b0x0\b|\bfalse\b', line.group(0)):
            raise SystemExit(f'{apk}: {flag} is enabled; this is not a normal standalone sideload APK')
    if re.search(r'^\s+A: split=', manifest, flags=re.MULTILINE):
        raise SystemExit(f'{apk}: split APK requires a base package')
    subprocess.run([str(tools / 'apksigner'), 'verify', str(apk)], check=True)
    subprocess.run([str(tools / 'zipalign'), '-c', '-P', '16', '4', str(apk)], check=True)
    print(f'{apk}: signature, alignment, ZIP integrity and standalone install flags verified')
