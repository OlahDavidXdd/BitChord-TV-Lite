#!/usr/bin/env bash
set -euo pipefail
integration_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"
python3 "$integration_dir/prepare-sdk.py" "$ANDROID_HOME"
checkout="$integration_dir/build/BitChord"
mkdir -p "$integration_dir/build"
if [[ ! -d "$checkout/.git" ]]; then
  git clone https://github.com/kushagrasinghx/BitChord.git "$checkout"
  git -C "$checkout" checkout b690dc146009d4815825fa4a20815ef2e4ee8898
fi
if git -C "$checkout" apply --check "$integration_dir/soundcloud-login.patch"; then
  git -C "$checkout" apply "$integration_dir/soundcloud-login.patch"
elif ! git -C "$checkout" apply --reverse --check "$integration_dir/soundcloud-login.patch"; then
  echo 'Checkout differs from the pinned integration; preserve your edits and use a fresh checkout.' >&2
  exit 1
fi
cd "$checkout"
./gradlew :app:assembleProdRelease -Pbitchord.bundleWear=false -Pandroid.injected.build.abi=arm64-v8a -Pandroid.injected.testOnly=false -Pkotlin.compiler.execution.strategy=in-process --max-workers=1
python3 - "$integration_dir/verify-apk.py" "$ANDROID_HOME" <<'PYVERIFY'
from pathlib import Path
import subprocess
import sys
apks = [p for p in Path('app/build').rglob('*.apk') if '/apk/prod/release/' in p.as_posix()]
if not apks:
    raise SystemExit('No prod/release APK was produced')
subprocess.run([sys.executable, sys.argv[1], sys.argv[2], *map(str, apks)], check=True)
PYVERIFY
