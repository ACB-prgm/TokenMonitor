#!/bin/sh
# Run only after verifying the downloaded ZIP checksum and extracting it.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec /bin/sh "$root/plugins/token-monitor-embedded/scripts/launch.sh" --install "$@"
