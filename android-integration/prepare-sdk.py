#!/usr/bin/env python3
"""Expose the real SDK 37.0 under the integer name expected by upstream AGP 8."""
from pathlib import Path
import os
import shutil
import sys

sdk = Path(sys.argv[1])
source = sdk / 'platforms/android-37.0'
target = sdk / 'platforms/android-37'
if (target / 'android.jar').is_file():
    raise SystemExit(0)
if not (source / 'android.jar').is_file():
    raise SystemExit("Install the official 'platforms;android-37.0' SDK package first")
if 'AndroidVersion.ApiLevel=37.0' not in (source / 'source.properties').read_text():
    raise SystemExit('Unexpected SDK version; refusing to alias another platform')
# All binaries remain byte-for-byte copies of Google's API 37.0 platform.
shutil.copytree(source, target, copy_function=shutil.copy2)
for name in ['source.properties', 'package.xml']:
    file = target / name
    text = file.read_text().replace('platforms;android-37.0', 'platforms;android-37')
    text = text.replace('AndroidVersion.ApiLevel=37.0', 'AndroidVersion.ApiLevel=37')
    text = text.replace('<api-level>37.0</api-level>', '<api-level>37</api-level>')
    file.write_text(text)
print('Prepared an API 37 metadata alias for legacy AGP. SDK binaries are unchanged.')
