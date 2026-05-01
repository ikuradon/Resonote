# Auftakt Final Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gateway` を最終 transitional 境界まで縮小し、残る runtime bridge の実処理を package helper 経由へ寄せて、最終回帰を通す。

**Architecture:** app/feature 側の read/write import は `client.ts` と `publish-signed.ts` に直接寄せる。`src/shared/nostr/auftakt-runtime.ts` は package 側 helper を実利用する thin orchestration に寄せ、最後に広めの回帰で境界を固定する。

**Tech Stack:** TypeScript, Vitest, Svelte, pnpm, rx-nostr, Dexie

---

### Task 1: Remove Remaining Gateway Usage

- `src/app/bootstrap/init-app.ts`
- `src/features/content-resolution/application/resolve-feed.ts`
- `src/features/content-resolution/application/resolve-content.ts`
- associated `*.test.ts`

### Task 2: Use Package Bridge Helpers From Runtime

- `src/shared/nostr/auftakt-runtime.ts`
- `src/shared/nostr/auftakt-runtime.test.ts`
- `packages/auftakt/src/app-bridge/profile-relay-helpers.ts`
- `packages/auftakt-resonote/src/bridge/emoji-helpers.ts`

### Task 3: Shrink Gateway Surface

- `src/shared/nostr/gateway.ts`
- `src/shared/nostr/gateway.test.ts`

### Task 4: Final Verification And Blocker Check

- broad focused regression over runtime / gateway / app slices
- residual `gateway.js` import scan
- clean worktree confirmation
