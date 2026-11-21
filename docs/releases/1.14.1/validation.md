# TokenMonitor 1.14.1 validation

The Usage Analytics regression test covers the weekly default, grain retention across date-range changes, a connected line across missing buckets, and opt-in columns. The history tests verify weekly UTC buckets and check that selecting a grain preserves the date scope.

Protected-main CI and the tagged release workflow check packaging, installation, updates, rollback, and hook discovery on macOS Apple silicon, Windows x64, and Windows ARM64. The release workflow verifies the source commit and SHA-256 checksums for each archive. [GitHub Actions](https://github.com/ACB-prgm/TokenMonitor/actions)

Desktop rendering and trusted hook delivery require separate checks in Codex Desktop.
