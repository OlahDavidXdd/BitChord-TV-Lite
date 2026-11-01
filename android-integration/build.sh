#!/usr/bin/env bash
set -euo pipefail
integration_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"
: "${BITCHORD_SOUNDCLOUD_AUTH_URL:?Set the HTTPS origin of the deployed SoundCloud OAuth service}"
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
./gradlew :app:assembleProdDebug -Pbitchord.bundleWear=false
printf 'APKs: %s/app/build/outputs/apk/prod/debug\n' "$checkout"
