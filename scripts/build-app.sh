#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
swift build "$@" -c release --arch arm64 -Xswiftc -gnone -Xswiftc -file-prefix-map -Xswiftc "$PWD=."
bundle="$PWD/build/Codex Usage Monitor.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
cp .build/arm64-apple-macosx/release/CodexUsageMonitor "$bundle/Contents/MacOS/"
/usr/bin/strip -S "$bundle/Contents/MacOS/CodexUsageMonitor"
cp "$bundle/Contents/MacOS/CodexUsageMonitor" "$bundle/Contents/MacOS/CodexUsageLauncher"
if [[ -f plugins/token-monitor/assets/icon.png ]]; then
    iconset="$PWD/build/TokenMonitor.iconset"
    mkdir -p "$iconset"
    for size in 16 32 128 256 512; do
        /usr/bin/sips -z "$size" "$size" plugins/token-monitor/assets/icon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
        double=$((size * 2))
        /usr/bin/sips -z "$double" "$double" plugins/token-monitor/assets/icon.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
    done
    /usr/bin/iconutil -c icns "$iconset" -o "$bundle/Contents/Resources/TokenMonitor.icns"
fi
/usr/bin/python3 - "$bundle" "$(cat VERSION)" <<'PY'
import plistlib,sys
from pathlib import Path
p=Path(sys.argv[1])/'Contents/Info.plist'
p.write_bytes(plistlib.dumps(dict(CFBundleIdentifier='local.codex.usage-monitor',CFBundleName='Codex Usage Monitor',CFBundleDisplayName='TokenMonitor',CFBundleExecutable='CodexUsageMonitor',CFBundlePackageType='APPL',CFBundleShortVersionString=sys.argv[2],CFBundleVersion=sys.argv[2],CFBundleIconFile='TokenMonitor.icns',LSMinimumSystemVersion='13.0',LSUIElement=True,NSHighResolutionCapable=True)))
PY
codesign --force --sign - "$bundle"
printf 'Built %s\n' "$bundle"
