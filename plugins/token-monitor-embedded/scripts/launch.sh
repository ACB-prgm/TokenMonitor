#!/bin/sh
# Resolve bundled files independently of the caller's working directory or PATH.
set -eu
plugin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
node_path="$plugin_root/runtime/node"
if [ ! -x "$node_path" ]; then
    # Account uploads limit individual file sizes. The release carries the same
    # verified runtime compressed; expand it privately, without any downloads.
    expected=$(/bin/cat "$plugin_root/runtime/node.sha256")
    case "$expected" in ''|*[!0-9a-f]*) exit 1;; esac
    [ "${#expected}" -eq 64 ] || exit 1
    data_root=${PLUGIN_DATA:-${CODEX_HOME:-$HOME/.codex}/token-monitor-embedded}
    cache_root="$data_root/runtime/$expected"
    umask 077
    /bin/mkdir -p "$cache_root"
    node_path="$cache_root/node"
    if [ ! -x "$node_path" ] || [ "$(/usr/bin/shasum -a 256 "$node_path" | /usr/bin/cut -d ' ' -f 1)" != "$expected" ]; then
        temporary=$(/usr/bin/mktemp "$cache_root/node.XXXXXX")
        trap '/bin/rm -f "$temporary"' EXIT HUP INT TERM
        /usr/bin/gzip -dc "$plugin_root/runtime/node.gz" > "$temporary"
        actual=$(/usr/bin/shasum -a 256 "$temporary" | /usr/bin/cut -d ' ' -f 1)
        [ "$actual" = "$expected" ] || exit 1
        /bin/chmod 700 "$temporary"
        /bin/mv -f "$temporary" "$node_path"
        trap - EXIT HUP INT TERM
    fi
fi
case "${1:-}" in
    --hook) exec "$node_path" "$plugin_root/server/dist/hook.mjs";;
    --startup-hook) exec "$node_path" "$plugin_root/server/dist/startup-hook.mjs";;
    --node-version) exec "$node_path" --version;;
    '') exec "$node_path" "$plugin_root/server/dist/index.mjs";;
    *) exit 2;;
esac
