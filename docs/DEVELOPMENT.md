# Local Token Monitor DEV

Install build dependencies once with Node 24+ and npm:

```sh
npm --prefix plugins/token-monitor-embedded ci
```

From the repository root, build and install the current checkout:

```sh
npm run dev
```

Restart Codex, review the **Token Monitor DEV** hooks in its trust controls, then
ask **Open Token Monitor DEV**. Repeating `npm run dev` after source edits builds
a new version and refreshes the DEV installation. Already open panels and MCP
processes need a Codex restart to load that version. Installation never grants
hook trust automatically. Desktop rendering still needs verification in Codex.

The plugin ID is `token-monitor-dev@tokenmonitor-dev`. Its marketplace, server,
panel resource URLs, startup records, layout preferences, and fallback state
directory are separate from the release. Both read the existing Codex transcripts
and database without modifying them. DEV retains five metadata hooks but omits
the first-prompt auto-open hook so installing both does not request two panels.
DEV shows its build version in the header and does not run automatic release checks.

DEV uses the Node executable that runs the build; it does not bundle or download
a runtime. Keep that Node installation available. `CODEX_CLI_PATH` can point to a
native Codex CLI executable when `codex` is absent from PATH. Local artifacts live
in ignored `.build/tokenmonitor-dev/`. Each build creates an immutable snapshot
and updates the DEV catalog after successful compilation; old snapshots remain
available to running processes. Builds include uncommitted source changes.

Build without installing, or run validation:

```sh
npm run dev:build
npm run dev:test
npm --prefix plugins/token-monitor-embedded run typecheck
npm --prefix plugins/token-monitor-embedded run build
npm --prefix plugins/token-monitor-embedded test
```

The install command registers only the DEV marketplace and installs only the DEV
plugin. If that marketplace belongs to another checkout, it stops with the
existing path instead of silently taking it over. Remove the old DEV marketplace
explicitly before switching checkouts.

To remove DEV while retaining the release:

```sh
codex plugin remove token-monitor-dev@tokenmonitor-dev
codex plugin marketplace remove tokenmonitor-dev
```

After removal and closing DEV processes, `.build/tokenmonitor-dev/` may be deleted.
The regular release build and distribution workflow is unchanged. DEV artifacts
are machine-specific local builds, not public release packages.
