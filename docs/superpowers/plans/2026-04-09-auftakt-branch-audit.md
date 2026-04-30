# Auftakt Branch Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `feat/auftakt-foundation` と `feat/auftakt-migration` を「正常実装ではない破棄済みブランチ」として監査し、現行 [docs/auftakt/specs.md](/root/src/github.com/ikuradon/Resonote/docs/auftakt/specs.md) に対する再利用候補と破棄対象を分類する。

**Architecture:** ブランチのコードは復活前提で扱わず、現行仕様を基準に `採用 / 参考再実装 / 破棄` の 3 区分で監査する。先にファイル棚卸しと仕様矛盾の一覧を作り、その後に回収順序を `tests -> transport/store/sync の部品 -> facade/write path -> app migration hints` の順で決める。

**Tech Stack:** Git, pnpm monorepo, TypeScript, existing `docs/auftakt/specs.md`, abandoned branches `feat/auftakt-foundation` and `feat/auftakt-migration`

---

### Task 1: 監査前提を固定する

**Files:**

- Modify: `docs/auftakt/specs.md`
- Create: `docs/superpowers/specs/2026-04-09-auftakt-branch-audit-rules.md`

- [ ] **Step 1: 監査ルール文書を追加する**

```md
# Auftakt Branch Audit Rules

- `feat/auftakt-foundation` と `feat/auftakt-migration` は、どちらも正常挙動ではない前提で扱う
- cherry-pick や wholesale revive は行わない
- 現行仕様 `docs/auftakt/specs.md` を唯一の正とする
- 各ファイルは `採用 / 参考再実装 / 破棄` のいずれかに分類する
- `採用` はテストまたは小さな純ロジックに限定する
- `参考再実装` は設計やアルゴリズムのみ参考にし、コードは新規実装する
- `破棄` は現行仕様と矛盾する、または異常挙動の温床になっていたもの
```

- [ ] **Step 2: 監査ルールを統合仕様から参照できるように補足する**

```md
## Branch Audit Rule

`feat/auftakt-foundation` および `feat/auftakt-migration` は正常系の先行実装ではなく、異常挙動を理由に破棄された試作として扱う。以後の回収は `採用 / 参考再実装 / 破棄` の 3 区分でのみ行い、現行仕様への wholesale revive は認めない。
```

- [ ] **Step 3: 差分なしで文書が作成できたことを確認する**

Run: `git diff -- docs/auftakt/specs.md docs/superpowers/specs/2026-04-09-auftakt-branch-audit-rules.md`
Expected: 追加した監査ルールだけが表示される

- [ ] **Step 4: Commit**

```bash
git add docs/auftakt/specs.md docs/superpowers/specs/2026-04-09-auftakt-branch-audit-rules.md
git commit -m "docs: add audit rules for abandoned auftakt branches"
```

### Task 2: `feat/auftakt-foundation` の回収候補一覧を作る

**Files:**

- Create: `docs/superpowers/specs/2026-04-09-auftakt-foundation-audit.md`
- Reference: `src/shared/nostr/auftakt/` on branch `feat/auftakt-foundation`
- Reference: `docs/auftakt/specs.md`

- [ ] **Step 1: foundation の棚卸し項目を作る**

```md
# feat/auftakt-foundation Audit

## Candidate Buckets

- Transport candidates
- Sync candidates
- Store candidates
- Handle/facade candidates
- Built-in candidates
- Test-only candidates
- Reject candidates
```

- [ ] **Step 2: foundation のファイル一覧を抽出する**

Run: `git ls-tree -r --name-only feat/auftakt-foundation src/shared/nostr/auftakt | sort`
Expected: `src/shared/nostr/auftakt/...` の完全なファイル一覧が出る

- [ ] **Step 3: 回収候補を文書に整理する**

```md
## Adopt

- `src/shared/nostr/auftakt/backends/dexie/persistent-store.ts`
- `src/shared/nostr/auftakt/backends/dexie/schema.ts`
- `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts`
- `src/shared/nostr/auftakt/core/relay/forward-assembler.ts`
- `src/shared/nostr/auftakt/core/relay/publish-manager.ts`
- `src/shared/nostr/auftakt/core/relay/slot-counter.ts`
- `src/shared/nostr/auftakt/testing/fakes.ts`

## Rewrite With Reference

- `src/shared/nostr/auftakt/core/runtime.ts`
- `src/shared/nostr/auftakt/core/models/session.ts`
- `src/shared/nostr/auftakt/core/sync-engine.ts`
- `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`

## Reject

- `src/shared/nostr/auftakt/builtin/comments.ts`
- app wiring 全般
- 現行の `handles` / `registry` 境界に反する models 主体の箇所
```

- [ ] **Step 4: foundation 文書に「異常挙動があった前提」を明記する**

```md
## Reliability Note

このブランチは正常挙動を満たせず破棄されているため、候補一覧は品質保証ではなく回収可能性の評価である。`Adopt` でも必ず現行仕様に沿った再検証を行う。
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-09-auftakt-foundation-audit.md
git commit -m "docs: audit feat/auftakt-foundation recovery candidates"
```

### Task 3: `feat/auftakt-migration` の回収候補一覧を作る

**Files:**

- Create: `docs/superpowers/specs/2026-04-09-auftakt-migration-audit.md`
- Reference: files on branch `feat/auftakt-migration`
- Reference: `docs/auftakt/specs.md`

- [ ] **Step 1: migration の棚卸し項目を作る**

```md
# feat/auftakt-migration Audit

## Candidate Buckets

- Store/cache patterns
- Feature wiring patterns
- Query batching patterns
- Test-only candidates
- Reject candidates
```

- [ ] **Step 2: migration の主要ファイルを抽出する**

Run: `git ls-tree -r --name-only feat/auftakt-migration | sort | rg 'src/shared/nostr/store.ts$|src/shared/nostr/client.ts$|profile\\.svelte\\.ts$|emoji-sets\\.svelte\\.ts$|comment-subscription\\.ts$|notifications-view-model\\.svelte\\.ts$|wot-fetcher\\.ts$|fetch-event\\.ts$|podcast-resolver|episode-resolver|init-session\\.ts$'`
Expected: migration で特徴的だった app/store/query 関連ファイルだけが出る

- [ ] **Step 3: 回収候補を文書に整理する**

```md
## Adopt

- tests only

## Rewrite With Reference

- `src/shared/nostr/store.ts`
- `src/shared/browser/profile.svelte.ts`
- `src/shared/browser/emoji-sets.svelte.ts`
- `src/features/comments/application/comment-subscription.ts`
- `src/features/notifications/ui/notifications-view-model.svelte.ts`

## Reject

- `src/shared/nostr/client.ts`
- 外部 `@ikuradon/auftakt` 前提の API 依存箇所
- `rx-nostr` を中核に残す構造
```

- [ ] **Step 4: migration 文書に「正常前提で見ない」注記を追加する**

```md
## Reliability Note

このブランチは app 置換の途中案であり、正常挙動を満たせず破棄されている。ここで回収するのは挙動保証済みコードではなく、cache-first や batch などの観察済みパターンのみとする。
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-09-auftakt-migration-audit.md
git commit -m "docs: audit feat/auftakt-migration recovery patterns"
```

### Task 4: 現行仕様との矛盾一覧を作る

**Files:**

- Create: `docs/superpowers/specs/2026-04-09-auftakt-spec-conflicts.md`
- Reference: `docs/auftakt/specs.md`
- Reference: `docs/superpowers/specs/2026-04-09-auftakt-foundation-audit.md`
- Reference: `docs/superpowers/specs/2026-04-09-auftakt-migration-audit.md`

- [ ] **Step 1: 矛盾分類の見出しを作る**

```md
# Auftakt Spec Conflicts

## Layer conflicts

## Package-boundary conflicts

## Built-in adoption conflicts

## API-surface conflicts

## Performance conflicts

## Security conflicts
```

- [ ] **Step 2: foundation / migration ごとの代表的な矛盾を記述する**

```md
## Layer conflicts

- foundation: `core/models/session.ts` が write path, retry, optimistic, publish completion を抱えすぎている
- foundation: `core/models/*` と `core/handles/*` の責務境界が現行 `handles` 主体構造と一致しない
- migration: app 側 `src/shared/nostr/store.ts` が store と feature wiring を兼ねている

## Package-boundary conflicts

- foundation: `builtin/comments.ts` は現行では `packages/auftakt-resonote` 側に出すべき
- migration: app 内 private store/client を中心にしており package 境界の考え方がない

## API-surface conflicts

- foundation: runtime 組み立てが厚すぎて `createRuntime` に責務集中
- migration: 外部 `@ikuradon/auftakt` の API に寄りすぎている
```

- [ ] **Step 3: 性能とセキュリティの矛盾を追記する**

```md
## Performance conflicts

- foundation: timeline / session / relay-manager が肥大化して hot path が読みにくい
- migration: `rx-nostr` 中心のままなので batch/shard 自動化の責務が library に閉じていない

## Security conflicts

- foundation: optimistic / publish / tombstone の境界が session に集まりすぎている
- migration: relay 由来イベントの検証責務が library 本体に固定されていない
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-09-auftakt-spec-conflicts.md
git commit -m "docs: map abandoned branch conflicts against auftakt spec"
```

### Task 5: 回収順序と実装方針を固定する

**Files:**

- Create: `docs/superpowers/plans/2026-04-09-auftakt-recovery-order.md`
- Reference: `docs/superpowers/specs/2026-04-09-auftakt-foundation-audit.md`
- Reference: `docs/superpowers/specs/2026-04-09-auftakt-migration-audit.md`
- Reference: `docs/superpowers/specs/2026-04-09-auftakt-spec-conflicts.md`

- [ ] **Step 1: 回収順序を文書化する**

```md
# Auftakt Recovery Order

1. tests and fakes
2. pure transport helpers
3. persistent store pieces
4. sync orchestration pieces
5. handle facade rewrite
6. write/session path rewrite
7. app migration hints only
```

- [ ] **Step 2: 各段階の禁止事項を併記する**

```md
## Guardrails

- branch 単位の復活は禁止
- `Adopt` でも現行 package 構成へ移植してから使う
- `Rewrite With Reference` はコード持ち込みではなく設計再実装とする
- `Reject` は二度と実装の正当化材料に使わない
```

- [ ] **Step 3: 次の実装 plan への入口を明記する**

```md
## Next Plans

- `packages/auftakt`: transport/store/sync foundation
- `packages/auftakt`: handles facade and signer/write path
- `packages/auftakt-resonote`: comments/content preset
- app migration from rx-nostr and custom cache
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-09-auftakt-recovery-order.md
git commit -m "docs: define recovery order for abandoned auftakt branches"
```

## Self-Review

- `feat/auftakt-foundation` と `feat/auftakt-migration` の両方を対象にしている
- 回収候補一覧と仕様矛盾一覧の 2 本柱が plan に含まれている
- どちらも正常挙動ではない前提を監査ルールに固定している
- wholesale revive を禁止している
- 次の実装 plan へつながる順序まで定義している

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-09-auftakt-branch-audit.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
