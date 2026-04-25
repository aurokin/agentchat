# Agentchat Architecture And Direction

This directory is the canonical product and architecture reference for
Agentchat. It exists for humans and agents: use it to understand the active
self-hosted, agent-centric direction and to avoid rebuilding old hosted-product
assumptions.

## Read In Order

1. [Vision](./vision.md)
2. [Product Rules](./product-rules.md)
3. [Architecture V1](./architecture-v1.md)
4. [Roadmap](./roadmap.md)
5. [Harness Engineering](./harness-engineering.md)

## Operating The System

- [Local Modes](../local-modes.md) - wrapper-first local workflow, worktrees, generated config, and stable host modes.
- [Operator Guide](./operator-guide.md) - repo-local setup for Codex-backed agents.
- [Stable Host Runbook](./stable-host-runbook.md) - protected host lifecycle.
- [Testing Plan](./testing-plan.md) - confidence layers and manual runtime checks.
- [Manual QA Checklist](./manual-qa-checklist.md) - deliberate human validation.

## Cleanup Sweep Evidence

- [Branch Reconciliation Inventory](./branch-reconciliation-inventory.md) - AUR-115 inventory for stale runtime/worktree branches.

## Implementation Contracts

- [Server Config Spec](./server-config-spec.md)
- [Convex Spec](./convex-spec.md)
- [Backend API Spec](./backend-api-spec.md)
- [Codex Runtime Spec](./codex-runtime-spec.md)
- [Runtime And Auth Plan](./runtime-and-auth-plan.md)
- [Mobile Follow-Up](./mobile-followup.md)
- [Mobile Integration Testing](./mobile-integration-testing.md)

## Planned Runtime Work

- [Provider-Agent Merge Plan](../../plans/provider-agent-merge-plan.md)
- [Pi Runtime Spec](./pi-runtime-spec.md)
- [OpenCode Runtime Spec](./opencode-runtime-spec.md)
- [Claude Code Runtime Spec](./claude-code-runtime-spec.md)

## Scope

These docs describe the active Agentchat direction:

- Self-hosted and open source.
- Agent-centric UX where conversations are bound to the selected agent.
- Convex-managed access through Google and local-user auth modes.
- Conversations, runs, and runtime bindings stored in Convex.
- An instance-local backend server that owns runtime sessions.
- Codex as the current active runtime.
- Pi, OpenCode, and Claude Code as planned runtime implementations.

If another document conflicts with this directory, treat this directory as the
source of truth and update the stale document.
