# Public distribution validation

Version: 1.3.0. Validation performed October 19–20, 2026.

## Executed locally

- Existing baseline: 73 Swift tests, 26 embedded Node tests, six Python hook tests;
  all passed. TypeScript type checking passed.
- Production arm64 collector build and ad-hoc signing; bundled server/UI build;
  all 26 Node tests and type checking passed after version synchronization.
- Extracted standalone ZIP in a path containing spaces: offline MCP initialization,
  four-tool discovery, real Swift metrics from synthetic telemetry, UI-only results,
  runtime cold/warm startup, corruption recovery, and private data-root precedence;
  passed without developer Node/Python on PATH.
- Actual Codex app-server with a disposable profile discovered all six hooks as
  plugin hooks, untrusted. No trust records changed or hook delivery assumed.
- Public release marketplace: checksum and ZIP integrity, isolated Codex profile
  installation, installed collector execution, installed first-prompt hook,
  source replacement/update, uninstall and retained user state; all passed.
- Visually checked the production UI through its MCP Apps fixture bridge. Screenshot
  uses synthetic data. It rendered at narrow width and refreshed without prompts
  or model-context updates. This is a browser fixture, not desktop-host certification.
- Scanned 300 historical file versions for recognized credential patterns and
  private-data filenames; no matches. Tracked files contain source, tests, assets,
  and historical validation notes, not raw conversations or private runtime logs.
  Historical development paths and public/account plugin identifiers remain in
  preserved Git history. Current installation instructions are portable.
- Root LICENSE downloaded byte-for-byte from the official PolyForm plain-text URL.
  Original holder identity uses Git's existing ACB-prgm author and repository owner.
- Dependency lockfile licenses reviewed: MIT, ISC, Apache-2.0, BSD-2-Clause,
  BSD-3-Clause. Release bundles retain Node's license and dependency notices.
  Existing icon retained. No new third-party visual assets introduced.

## Limits

The tested Codex CLI is 0.163.0-alpha.10.2. macOS arm64 is the only binary target.
A fresh desktop chat rendering the publicly downloaded installation and automatic
first-prompt delivery after user hook trust remain manual verification steps;
the isolated test does not bypass trust or issue a model request. Existing private
installation behavior was previously confirmed by the owner, and the public setup
preserves its implementation. Remote execution, other Codex versions, minimum-OS
hardware testing, Windows, Intel Macs, web/mobile and universal directory acceptance
are not certified. Binaries are ad-hoc signed, not notarized.

CI runs source/build, license/version wiring, Swift/Node/hook tests, and extracted
MCP package tests. GitHub runners do not have the desktop host; their log states
this explicitly. Publication must not be interpreted as passing those manual checks.
