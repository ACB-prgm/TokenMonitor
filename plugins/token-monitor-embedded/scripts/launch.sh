#!/bin/sh
# Legacy local-plugin configs resolve cwd relative to the installed plugin.
# Do not depend on placeholder expansion or the recipient's Node/PATH.
set -eu
plugin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
exec "$plugin_root/runtime/node" "$plugin_root/server/dist/index.mjs"
