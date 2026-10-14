#!/bin/bash
set -euo pipefail
# Recipient bootstrap: only macOS system utilities; never remove quarantine.
script_dir="$(cd "$(dirname "$0")" && pwd)"
assets="$(cd "$script_dir/../assets" && pwd)"
release="$assets/release.json"
app_name='Codex Usage Monitor.app'
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ "$(/usr/bin/uname -s)" == Darwin ]] || fail 'TokenMonitor requires macOS.'
[[ "$(/usr/bin/uname -m)" == arm64 ]] || fail 'TokenMonitor requires Apple silicon. Run natively, not under Rosetta.'
os_version="$(/usr/bin/sw_vers -productVersion)"
[[ "${os_version%%.*}" -ge 13 ]] || fail 'TokenMonitor requires macOS 13 or later.'
operation="${1:---setup}"
case "$operation" in --setup|--verify) ;; *) fail 'Usage: setup.sh [--setup|--verify]' ;; esac
get() { /usr/bin/plutil -extract "$1" raw -o - "$release"; }
[[ "$(get architecture)" == arm64 && "$(get minimumOS)" == 13.0 ]] || fail 'Unsupported release metadata.'
count="$(get fileCount)"
[[ "$count" =~ ^[1-9][0-9]*$ && "$count" -le 5000 ]] || fail 'Invalid checksum inventory.'
for ((index=0; index<count; index++)); do
    relative="$(get "files.$index.path")"
    expected="$(get "files.$index.sha256")"
    [[ "$relative" == "$app_name/"* && "$relative" != *'/../'* && "$relative" != *'/./'* && "$relative" != *'//'* ]] || fail 'Unsafe inventory path.'
    [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || fail 'Invalid checksum.'
    [[ -f "$assets/$relative" && ! -L "$assets/$relative" ]] || fail "Missing regular file: $relative"
    actual="$(/usr/bin/shasum -a 256 "$assets/$relative")"
    [[ "${actual%% *}" == "$expected" ]] || fail "Checksum mismatch: $relative"
done
[[ -z "$(/usr/bin/find "$assets/$app_name" -type l -print -quit)" ]] || fail 'Symlinks are not supported in the app package.'
actual_count="$(/usr/bin/find "$assets/$app_name" -type f | /usr/bin/wc -l | /usr/bin/tr -d ' ')"
[[ "$actual_count" == "$count" ]] || fail 'Unlisted app files found.'
info="$assets/$app_name/Contents/Info.plist"
[[ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$info")" == local.codex.usage-monitor ]] || fail 'Wrong app identity.'
[[ "$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$info")" == "$(get version)" ]] || fail 'Version mismatch.'
[[ "$(/usr/bin/lipo -archs "$assets/$app_name/Contents/MacOS/CodexUsageMonitor")" == arm64 ]] || fail 'Wrong executable architecture.'
/usr/bin/codesign --verify --deep --strict "$assets/$app_name"
if [[ "$operation" == --verify ]]; then
    printf 'Verified TokenMonitor %s (arm64, macOS 13+). No installation changes made.\n' "$(get version)"
    exit 0
fi
# Check known install locations and Spotlight before creating staging files.
desktop=''
for candidate in '/Applications/ChatGPT.app' '/Applications/Codex.app' "$HOME/Applications/ChatGPT.app" "$HOME/Applications/Codex.app"; do
    if [[ -f "$candidate/Contents/Info.plist" ]] && [[ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$candidate/Contents/Info.plist" 2>/dev/null)" == com.openai.codex ]]; then desktop="$candidate"; break; fi
done
if [[ -z "$desktop" ]]; then
    while IFS= read -r candidate; do
        if [[ -f "$candidate/Contents/Info.plist" ]] && [[ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$candidate/Contents/Info.plist" 2>/dev/null)" == com.openai.codex ]]; then desktop="$candidate"; break; fi
    done < <(/usr/bin/mdfind 'kMDItemCFBundleIdentifier == "com.openai.codex"')
fi
[[ -n "$desktop" ]] || fail 'Could not locate Codex Desktop. Install and open Codex first.'
printf '%s\n' 'Setup installs the TokenMonitor companion app, six user hooks, and an event-driven launch helper. Preferences are preserved. You must approve macOS first open and trust hooks in Codex.'
stage="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/TokenMonitor-setup.XXXXXXXX")"
/usr/bin/ditto "$assets/$app_name" "$stage/$app_name"
/bin/cp "$release" "$stage/release.json"
# Some plugin archive extractors normalize executable permissions. Bytes stay unchanged.
/bin/chmod 755 "$stage/$app_name/Contents/MacOS/CodexUsageMonitor" "$stage/$app_name/Contents/MacOS/CodexUsageLauncher"
# -n keeps setup separate from an already-running HUD; -W waits for setup's result.
if ! /usr/bin/open -n -W "$stage/$app_name" --args --setup; then
    fail "macOS did not open setup. Review Privacy & Security > Open Anyway, then open: $stage/$app_name. No trust or quarantine bypass was performed."
fi
result="$stage/setup-result.json"
[[ -f "$result" ]] || fail "Setup did not finish. Review macOS first-open approval, then open: $stage/$app_name"
message="$(/usr/bin/plutil -extract message raw -o - "$result")"
[[ "$(/usr/bin/plutil -extract success raw -o - "$result")" == true ]] || fail "$message (Setup files kept at $stage)"
printf '%s\n' "$message"
/bin/rm -rf "$stage"
