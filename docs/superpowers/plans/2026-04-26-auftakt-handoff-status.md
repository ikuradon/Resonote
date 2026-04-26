# Auftakt Handoff Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the status-first HANDOFF by validating the in-flight relay
selection gate, then splitting the remaining work into focused Entity Handles
and NIP Inventory Refresh design/plan tracks.

**Architecture:** This is a handoff execution plan, not a runtime code plan.
Covered waves stay delegated to their existing focused specs/plans. Remaining
runtime and maintenance work are planned separately so Entity Handles does not
encode unfinished relay routing assumptions and NIP automation does not block
runtime policy work.

**Tech Stack:** Markdown, pnpm scripts, Vitest, Prettier, Superpowers
brainstorming and writing-plans workflows, Auftakt package verification gates.

---

## Scope Check

The approved spec
`docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md` identifies
two independent remaining subsystems:

- Entity Handles, a runtime API design.
- NIP Inventory Refresh Automation, a maintenance automation design.

Do not implement both subsystems in one code plan. This plan only executes the
HANDOFF order:

1. Verify relay selection completion is closed or return to its existing
   completion plan.
2. Create the Entity Handles focused design.
3. Create the Entity Handles implementation plan.
4. Create the NIP Inventory Refresh Automation focused design.
5. Create the NIP Inventory Refresh Automation implementation plan.

## File Structure

- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md`
  - Source of the approved status-first HANDOFF.
- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-relay-selection-completion-design.md`
  - Source of relay selection completion requirements.
- Read:
  `docs/superpowers/plans/2026-04-26-auftakt-relay-selection-completion.md`
  - Existing implementation plan for the in-flight relay selection wave.
- Create:
  `docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md`
  - Focused Entity Handles design.
- Create:
  `docs/superpowers/plans/2026-04-26-auftakt-entity-handles.md`
  - Entity Handles implementation plan after the design is approved.
- Create:
  `docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md`
  - Focused NIP Inventory Refresh Automation design.
- Create:
  `docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md`
  - NIP Inventory Refresh Automation implementation plan after the design is
    approved.

---

### Task 1: Confirm Handoff Inputs

**Files:**

- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md`
- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-relay-selection-completion-design.md`
- Read:
  `docs/superpowers/plans/2026-04-26-auftakt-relay-selection-completion.md`

- [ ] **Step 1: Confirm the approved HANDOFF spec is committed**

Run:

```bash
git show --stat --oneline f0d682d -- docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md
```

Expected: PASS. Output starts with:

```text
f0d682d docs(auftakt): handoff status roadmap
```

- [ ] **Step 2: Confirm there are no staged files before execution**

Run:

```bash
git diff --cached --name-status
```

Expected: PASS with no output. If output appears, stop and ask the user how to
handle the staged files before continuing.

- [ ] **Step 3: Confirm relay selection completion plan exists**

Run:

```bash
test -s docs/superpowers/plans/2026-04-26-auftakt-relay-selection-completion.md
```

Expected: PASS with exit code 0.

- [ ] **Step 4: Confirm relay selection completion spec exists**

Run:

```bash
test -s docs/superpowers/specs/2026-04-26-auftakt-relay-selection-completion-design.md
```

Expected: PASS with exit code 0.

---

### Task 2: Close Relay Selection Completion Gate

**Files:**

- Read:
  `docs/superpowers/plans/2026-04-26-auftakt-relay-selection-completion.md`
- Verify:
  `packages/core/src/relay-selection.ts`
- Verify:
  `packages/core/src/relay-selection.contract.test.ts`
- Verify:
  `packages/resonote/src/relay-selection-runtime.ts`
- Verify:
  `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Verify:
  `packages/resonote/src/relay-routing-publish.contract.test.ts`
- Verify:
  `packages/resonote/src/runtime.ts`
- Verify:
  `src/shared/nostr/client.ts`
- Verify:
  `src/shared/auftakt/resonote.ts`

- [ ] **Step 1: Run the relay selection formatting gate**

Run:

```bash
pnpm exec prettier --check packages/core/src/relay-selection.ts packages/core/src/relay-selection.contract.test.ts packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/runtime.ts src/shared/nostr/client.ts src/shared/auftakt/resonote.ts docs/auftakt/status-verification.md docs/superpowers/specs/2026-04-26-auftakt-relay-selection-outbox-routing-design.md docs/superpowers/plans/2026-04-26-auftakt-relay-selection-outbox-routing.md
```

Expected: PASS with:

```text
All matched files use Prettier code style!
```

- [ ] **Step 2: Run the full type/check gate**

Run:

```bash
pnpm run check
```

Expected: PASS. If this fails in relay selection files, resume
`docs/superpowers/plans/2026-04-26-auftakt-relay-selection-completion.md` and
finish that plan before continuing this HANDOFF plan.

- [ ] **Step 3: Run focused relay selection contracts**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts src/shared/nostr/client.test.ts src/features/relays/application/relay-actions.test.ts
```

Expected: PASS. The relay selection completion wave is not closed until these
contracts pass.

- [ ] **Step 4: Run Auftakt package gates**

Run:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
```

Expected: PASS for all three commands.

- [ ] **Step 5: Run strict closure and migration proof gates**

Run:

```bash
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS for both commands. Do not start Entity Handles design if strict
closure or migration proof fails.

- [ ] **Step 6: Commit any relay selection completion fixes if required**

If Task 2 required changes from the relay selection completion plan, commit only
the relay selection completion files:

```bash
git add packages/core/src/relay-selection.ts packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts packages/resonote/src/runtime.ts src/shared/nostr/client.ts src/shared/nostr/client.test.ts src/shared/auftakt/resonote.ts src/features/relays/application/relay-actions.test.ts docs/auftakt/status-verification.md docs/superpowers/specs/2026-04-26-auftakt-relay-selection-outbox-routing-design.md docs/superpowers/plans/2026-04-26-auftakt-relay-selection-outbox-routing.md docs/superpowers/specs/2026-04-26-auftakt-relay-selection-completion-design.md docs/superpowers/plans/2026-04-26-auftakt-relay-selection-completion.md
git commit -m "fix(auftakt): close relay selection completion"
```

Expected: a focused commit. If Task 2 passed without changes, skip this step.

---

### Task 3: Create Entity Handles Focused Design

**Files:**

- Create:
  `docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md`
- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md`
- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-relay-selection-completion-design.md`
- Read:
  `packages/resonote/src/runtime.ts`
- Read:
  `packages/resonote/src/public-api.contract.test.ts`
- Read:
  `packages/resonote/src/plugin-isolation.contract.test.ts`
- Read:
  `src/shared/auftakt/resonote.ts`

- [ ] **Step 1: Start brainstorming for Entity Handles**

Use the `superpowers:brainstorming` skill with this prompt:

```text
docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md の Entity Handles focused design を作る。relay selection completion が通った前提で、event(id), profile(pubkey), addressable(coord), relaySet(subject), relayHints(eventId) を coordinator-safe な additive API として設計する。handles は settlement/read-model state を返し、raw relay session、raw WebSocket packet、raw Dexie handle/row、materializer queue、plugin registry internals、mutable routing index を公開しない。
```

Expected: brainstorming starts by exploring project context and asking
clarifying questions before writing the design.

- [ ] **Step 2: Ensure the Entity Handles design covers the required sections**

Before approving the design, confirm it has these sections:

```text
Summary
Current Context
Goals
Non-Goals
Public Surface
Handle Responsibilities
Data Flow
Error Handling
Testing
Acceptance Criteria
```

Expected: each section is present and specifically mentions coordinator
mediation.

- [ ] **Step 3: Ensure the Entity Handles design locks forbidden surfaces**

Confirm the design explicitly forbids these public surfaces:

```text
raw relay session
raw WebSocket packet
raw Dexie handle
raw Dexie row
materializer queue
plugin registry internals
mutable routing index
transport subscription id
```

Expected: all forbidden surfaces are listed as non-goals or boundary rules.

- [ ] **Step 4: Save and commit the Entity Handles design**

After user approval inside brainstorming, save the design to:

```text
docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md
```

Then commit:

```bash
git add docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md
git commit -m "docs(auftakt): design entity handles"
```

Expected: a focused docs commit containing only the Entity Handles design.

---

### Task 4: Create Entity Handles Implementation Plan

**Files:**

- Create:
  `docs/superpowers/plans/2026-04-26-auftakt-entity-handles.md`
- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md`

- [ ] **Step 1: Start writing the Entity Handles plan**

Use the `superpowers:writing-plans` skill with this prompt:

```text
docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md の implementation plan を作る。TDDで、package-root closure、facade compatibility、handle settlement state、deleted/missing/partial/repaired state、plugin isolation を個別タスクに分ける。実装は coordinator API に委譲し、raw relay/storage/materializer internals を公開しない。
```

Expected: plan creation starts from the approved Entity Handles design.

- [ ] **Step 2: Ensure the Entity Handles plan has test-first tasks**

Confirm the plan includes separate failing-test steps for:

```text
package-root public API
event(id) settlement states
profile(pubkey) settlement states
addressable(coord) replacement/deletion visibility
relaySet(subject) policy-backed relay selection
relayHints(eventId) read-only durable hint exposure
plugin isolation
facade compatibility
strict closure guard
```

Expected: every item has a concrete test file path and command.

- [ ] **Step 3: Save and commit the Entity Handles plan**

Save the plan to:

```text
docs/superpowers/plans/2026-04-26-auftakt-entity-handles.md
```

Then commit:

```bash
git add docs/superpowers/plans/2026-04-26-auftakt-entity-handles.md
git commit -m "docs(auftakt): plan entity handles"
```

Expected: a focused docs commit containing only the Entity Handles plan.

---

### Task 5: Create NIP Inventory Refresh Focused Design

**Files:**

- Create:
  `docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md`
- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md`
- Read:
  `docs/auftakt/nips-inventory.json`
- Read:
  `docs/auftakt/nip-matrix.json`
- Read:
  `scripts/check-auftakt-nips.ts`
- Read:
  `scripts/check-auftakt-nips.test.ts`
- Read:
  `docs/auftakt/status-verification.md`

- [ ] **Step 1: Start brainstorming for NIP Inventory Refresh Automation**

Use the `superpowers:brainstorming` skill with this prompt:

```text
docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md の NIP Inventory Refresh Automation focused design を作る。既存の docs/auftakt/nips-inventory.json、docs/auftakt/nip-matrix.json、scripts/check-auftakt-nips.ts、scripts/check-auftakt-nips.test.ts、docs/auftakt/status-verification.md を土台に、official inventory drift、owner gap、support boundary gap、proof command gap、docs sync drift を deterministic に検出する。network fetch failure は docs rewrite せず check failure または fixture mode にする。support status の自動昇格は禁止する。
```

Expected: brainstorming starts by exploring the current checker and matrix docs.

- [ ] **Step 2: Ensure the NIP automation design covers required sections**

Before approving the design, confirm it has these sections:

```text
Summary
Current Context
Goals
Non-Goals
Official Inventory Source
Local Matrix Contract
Refresh Command
Check Command
Docs Sync
Error Handling
Testing
Acceptance Criteria
```

Expected: each section is present and distinguishes refresh from check.

- [ ] **Step 3: Ensure the NIP automation design locks human review**

Confirm the design explicitly states:

```text
Support status changes are never auto-promoted.
Official fetch failure never rewrites local docs.
Fixture tests cover inventory drift without network access.
Unknown or unclassified NIPs fail deterministic checks.
```

Expected: all four rules are present.

- [ ] **Step 4: Save and commit the NIP automation design**

After user approval inside brainstorming, save the design to:

```text
docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md
```

Then commit:

```bash
git add docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md
git commit -m "docs(auftakt): design nip inventory refresh"
```

Expected: a focused docs commit containing only the NIP Inventory Refresh design.

---

### Task 6: Create NIP Inventory Refresh Implementation Plan

**Files:**

- Create:
  `docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md`
- Read:
  `docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md`

- [ ] **Step 1: Start writing the NIP automation plan**

Use the `superpowers:writing-plans` skill with this prompt:

```text
docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md の implementation plan を作る。TDDで、official inventory fixture drift、matrix owner/support/proof gaps、docs sync drift、network failure no-rewrite、support status no auto-promotion を個別タスクに分ける。既存の scripts/check-auftakt-nips.ts と scripts/check-auftakt-nips.test.ts を土台にする。
```

Expected: plan creation starts from the approved NIP automation design.

- [ ] **Step 2: Ensure the NIP automation plan has test-first tasks**

Confirm the plan includes separate failing-test steps for:

```text
official inventory fixture drift
unknown official NIP classification failure
missing matrix owner failure
missing support boundary failure
missing proof command failure
status-verification docs drift
network fetch failure does not rewrite docs
support status auto-promotion is rejected
```

Expected: every item has a concrete test file path and command.

- [ ] **Step 3: Save and commit the NIP automation plan**

Save the plan to:

```text
docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md
```

Then commit:

```bash
git add docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md
git commit -m "docs(auftakt): plan nip inventory refresh"
```

Expected: a focused docs commit containing only the NIP Inventory Refresh plan.

---

### Task 7: Final Handoff Summary

**Files:**

- Verify:
  `docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md`
- Verify:
  `docs/superpowers/plans/2026-04-26-auftakt-entity-handles.md`
- Verify:
  `docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md`
- Verify:
  `docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md`

- [ ] **Step 1: Confirm follow-up files exist**

Run:

```bash
test -s docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md
test -s docs/superpowers/plans/2026-04-26-auftakt-entity-handles.md
test -s docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md
test -s docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md
```

Expected: PASS with exit code 0 for all four commands.

- [ ] **Step 2: Confirm the new docs are committed**

Run:

```bash
git log --oneline -6
```

Expected: output includes commits for:

```text
docs(auftakt): plan nip inventory refresh
docs(auftakt): design nip inventory refresh
docs(auftakt): plan entity handles
docs(auftakt): design entity handles
docs(auftakt): handoff status roadmap
```

- [ ] **Step 3: Confirm no accidental staged files remain**

Run:

```bash
git diff --cached --name-status
```

Expected: PASS with no output.

- [ ] **Step 4: Report the next implementation target**

Final response should state:

```text
HANDOFF status is closed. Relay selection completion is verified or delegated back to its existing completion plan. Entity Handles and NIP Inventory Refresh Automation now each have focused design and implementation plan documents. The next implementation target is Entity Handles unless the user chooses to run NIP automation in parallel.
```

Expected: no claim that Entity Handles or NIP automation code is implemented.
