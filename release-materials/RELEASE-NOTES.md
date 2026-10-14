# 1.2.0 — Settings and optional SSH monitoring

- HUD settings gear groups task locking and layout size; an editable settings window manages remotes and remains reachable from the menu bar during click-through.
- Optional dedicated-key SSH streams parsed telemetry from other Macs, with machine-grouped tasks, machine-qualified locking, reconnect backoff and visible connection failures.
- Headless protocol-v1 helper runs through SSH without a telemetry port or source HUD. Initial connection/reconnect does not replay old task-selection events.
- Local-only operation and the existing local Codex lifecycle remain the default. Source Macs must update to 1.2.0 before remote setup; key restriction is a separate explicit setup step.
- Derived task titles and workspace labels are transmitted with remote metrics; transcripts and raw tool content remain source-local.
# 1.1.0 — Shareable TokenMonitor plugin

Adds an explicitly invoked maintenance skill and prebuilt Apple silicon native companion. Native setup, doctor, uninstall and silent hook modes replace Python as a recipient requirement. Includes exact-match legacy hook migration, transactional updates with rollback, and settings-preserving cleanup. The existing HUD and token calculations are unchanged; the app menu gains uninstall.

This is an ad-hoc-signed, unnotarized initial distribution. No public-directory approval is claimed. Follow LOCAL-VERIFICATION.md for executed checks and remaining manual verification.
