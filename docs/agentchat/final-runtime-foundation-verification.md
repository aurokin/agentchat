# Final Runtime Foundation Verification

Linear issue: [AUR-125](https://linear.app/aurokin/issue/AUR-125/final-runtime-foundation-verification-gate)

Verification date: 2026-04-26

This record closes the trunk reconciliation and runtime foundation cleanup
sweep. It records what passed locally, what was blocked by local environment,
and what remains intentionally deferred.

## Automated Gates

Passed:

```bash
bun run verify:ci
bun run health
```

During the gate, two deterministic repo-policy issues were fixed before the
final passing run:

- mobile files were formatted to satisfy `apps/mobile` health
- the server Codex runtime test fake now uses the existing
  `JsonRpcNotification` type instead of test-only `any` annotations, bringing
  type-suppression counts back under baseline

Focused checks run while fixing the gate:

```bash
bun scripts/report-type-suppressions.ts --baseline scripts/ci/type-suppressions.baseline.json
bun run --cwd apps/mobile format:check
bun run --cwd apps/server typecheck
bun test ./apps/server/src/__tests__/codexRuntime.test.ts
```

## Wrapper And Worktree Guardrails

Historical: this verification was originally run against the lane-based
wrapper harness (now-removed bootstrap/worktree-create/dev wrapper scripts).
That harness has been replaced by [portless](https://github.com/vercel-labs/portless)

- [worktrunk](https://github.com/max-sixty/worktrunk); the current equivalent
  flow is documented in [local-modes.md](../local-modes.md). The notes below are
  preserved for archival reference.

Passed (legacy harness, AUR-125 era):

- wrapper `bootstrap` completed without producing tracked generated-file churn
- worktree lifecycle smoke completed teardown — it reported doctor issues in
  the temporary worktree and skipped `dev`/`stop`, matching the local
  readiness state at the time

Blocked locally (legacy harness):

- `NEXT_PUBLIC_CONVEX_URL` is missing
- `AGENTCHAT_CONVEX_SITE_URL` is the placeholder `https://example.convex.site`

Host guardrails were not run in this gate. No host scripts, stable install
scripts, Caddy config, systemd user-service files, or stable-host examples were
changed during AUR-125.

## Live Runtime Coverage

Blocked locally:

```bash
bun run doctor:server
```

The server doctor reached live Codex model discovery successfully, but the
generated local agent is not ready because it points at the repo checkout with
`workspaceMode: "copy-on-conversation"` and the checkout contains symlinks under
`node_modules`.

Observed blocker:

- agent: `current-checkout`
- first symlink: `node_modules/xcode/node_modules/.bin/uuid`

Because `doctor`, `doctor:server`, and Convex readiness are blocked, live
runtime smoke and browser confidence were not run in this gate:

```bash
bun run test:manual:runtime-confidence
bun run test:manual:web-browser-confidence -- --json
```

These should be run after configuring a real Convex deployment and pointing the
copy-on-conversation agent at a symlink-free fixture workspace, or after
switching the local checkout agent to `workspaceMode: "shared"` for live local
testing.

## Residual Risks

- Live Convex/Codex/browser confidence is not proven in this local gate because
  the checkout is intentionally unconfigured for Convex.
- The generated current-checkout agent is unsuitable for
  copy-on-conversation live testing while `node_modules` symlinks are present.
- Stable-host guardrails remain manual-only and were not exercised because no
  host behavior changed in this ticket.

## Deferred Work

The following work remains outside the completed runtime foundation:

- Pi runtime implementation
- OpenCode runtime implementation
- Claude Code runtime implementation
- ACP-compatible clients
- approval UI beyond current auto-approve behavior
- admin UI for managing agents or runtime config

Each follow-up should start from the current trunk foundation: scoped runtime
identity, agent-owned inline Codex runtime config, `KindRuntime`, compatibility
provider bridges, and the reconciled docs in
[Runtime Foundation Reconciliation Status](./reconciliation-status.md).
