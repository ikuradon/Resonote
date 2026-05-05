# pnpm outdated 更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-05-05 時点の `pnpm outdated` snapshot に出た direct dependency を、承認済み spec の target resolution まで更新する。

**Architecture:** 更新は audit-only preflight の後、TypeScript/type、Svelte/Vite/build、test tooling、lint/format、runtime deps、Cloudflare/Codecov の batch に分ける。`package.json` は既存 caret range policy を維持し、完了判定は `pnpm-lock.yaml` と `pnpm list --depth 0` の direct dependency resolution で行う。

**Tech Stack:** pnpm 10.33.2, Node 24, SvelteKit, Vite, Vitest, Playwright, Wrangler, Hono, Zod, Auftakt workspace packages.

---

## File Structure

**Plan/spec files**

- Read: `docs/superpowers/specs/2026-05-05-pnpm-outdated-update-design.md` - 承認済み dependency update spec。
- Read: `package.json` - root direct dependency、scripts、engines、packageManager、pnpm overrides。
- Read: `pnpm-lock.yaml` - target resolution の実体。
- Read: `pnpm-workspace.yaml` - workspace package 範囲。
- Read: `.github/workflows/ci.yml` - Node/pnpm/Playwright cache と CI gate。
- Read: `playwright.config.ts` - e2e browser project が Chromium のみであることを確認する。

**Files modified by the update**

- Modify: `package.json` - direct dependency ranges。既存 caret range policy を維持し、`--save-exact` は使わない。
- Modify: `pnpm-lock.yaml` - direct/transitive dependency resolution。
- Modify only if required by verified breaking change: source/test/config files touched by dependency migration. Any such edit must be minimal and documented in `logs/pnpm-update-2026-05-05/source-fixes.md`.

**Execution log files**

- Create: `logs/pnpm-update-2026-05-05/preflight.md` - Node/pnpm/packageManager/baseline 結果。
- Create: `logs/pnpm-update-2026-05-05/pnpm-outdated-2026-05-05.json` - frozen outdated snapshot。
- Create: `logs/pnpm-update-2026-05-05/wanted-current-audit.md` - Batch 1 audit-only 結果。
- Create: `logs/pnpm-update-2026-05-05/changelog-review.md` - package ごとの changelog/release note 確認結果。
- Create: `logs/pnpm-update-2026-05-05/install-*.log` - batch ごとの install / peer / engine warning log。
- Create: `logs/pnpm-update-2026-05-05/verification.md` - batch ごとの verification 結果。
- Create: `logs/pnpm-update-2026-05-05/final-resolution.md` - final `pnpm list --depth 0`, `pnpm outdated`, scope-out result。
- Create only if needed: `logs/pnpm-update-2026-05-05/source-fixes.md` - dependency breaking change 追従で source/test/config を触った場合の根拠。

---

## Task 1: Preflight / Target Snapshot

**Files:**

- Create: `logs/pnpm-update-2026-05-05/preflight.md`
- Create: `logs/pnpm-update-2026-05-05/pnpm-outdated-2026-05-05.json`
- Create: `logs/pnpm-update-2026-05-05/pnpm-list-depth-0-before.txt`
- Create: `logs/pnpm-update-2026-05-05/install-preflight.log`

- [ ] **Step 1: Verify the worktree is clean**

Run:

```bash
git status --short
```

Expected: no output. If there is output, stop and ask the user before continuing.

- [ ] **Step 2: Create the execution log directory**

Run:

```bash
mkdir -p logs/pnpm-update-2026-05-05
```

Expected: command exits 0.

- [ ] **Step 3: Record Node, packageManager, pnpm, and pnpm config**

Run:

````bash
{
  echo '# Preflight';
  echo;
  echo '## Versions';
  echo;
  echo '```text';
  echo "node=$(node --version)";
  echo "packageManager=$(node -p 'require(\"./package.json\").packageManager ?? \"no packageManager field\"')";
  echo "pnpm=$(pnpm --version)";
  echo "save-exact=$(pnpm config get save-exact)";
  echo "save-prefix=$(pnpm config get save-prefix)";
  echo '```';
} > logs/pnpm-update-2026-05-05/preflight.md
````

Expected: `logs/pnpm-update-2026-05-05/preflight.md` exists and contains `packageManager=pnpm@10.33.2` and `pnpm=10.33.2`.

- [ ] **Step 4: Stop if local pnpm does not match the repo-pinned packageManager**

Run:

```bash
node -e "const pkg=require('./package.json'); const expected=(pkg.packageManager ?? '').replace(/^pnpm@/, ''); const actual=process.argv[1]; if (expected && actual !== expected) { console.error(`pnpm version mismatch: expected ${expected}, actual ${actual}`); process.exit(1); }" "$(pnpm --version)"
```

Expected: exit 0. If it fails, run `corepack prepare pnpm@10.33.2 --activate`, then rerun this step. If Corepack is unavailable, stop and ask the user.

- [ ] **Step 5: Record the target outdated snapshot**

Run:

```bash
pnpm outdated --format json > logs/pnpm-update-2026-05-05/pnpm-outdated-2026-05-05.json || test -s logs/pnpm-update-2026-05-05/pnpm-outdated-2026-05-05.json
```

Expected: file exists and contains package entries for the target update set. `pnpm outdated` may exit non-zero when outdated packages exist; the file is the success artifact.

- [ ] **Step 6: Record top-level direct dependency resolution before updates**

Run:

```bash
pnpm list --depth 0 > logs/pnpm-update-2026-05-05/pnpm-list-depth-0-before.txt
```

Expected: file exists and includes root dependencies such as `vite`, `typescript`, `hono`, and `wrangler`.

- [ ] **Step 7: Verify frozen install baseline**

Run:

```bash
pnpm install --frozen-lockfile 2>&1 | tee logs/pnpm-update-2026-05-05/install-preflight.log
```

Expected: exit 0. If it fails, stop because the baseline is invalid before dependency updates.

- [ ] **Step 8: Run baseline checks**

Run:

```bash
pnpm run check
pnpm run test:packages
pnpm run build
```

Expected: all commands exit 0. If any command fails, stop and record the failure in `logs/pnpm-update-2026-05-05/preflight.md` under `## Baseline failure`.

- [ ] **Step 9: Commit preflight logs**

Run:

```bash
git add logs/pnpm-update-2026-05-05/preflight.md logs/pnpm-update-2026-05-05/pnpm-outdated-2026-05-05.json logs/pnpm-update-2026-05-05/pnpm-list-depth-0-before.txt logs/pnpm-update-2026-05-05/install-preflight.log
git commit -m "chore(deps): record dependency update preflight"
```

Expected: commit succeeds.

---

## Task 2: Wanted/current Audit And Changelog Review

**Files:**

- Create: `logs/pnpm-update-2026-05-05/wanted-current-audit.md`
- Create: `logs/pnpm-update-2026-05-05/changelog-review.md`

- [ ] **Step 1: Write the wanted/current audit file**

Run:

```bash
cat > logs/pnpm-update-2026-05-05/wanted-current-audit.md <<'AUDIT'
# Wanted/current Audit

This audit is read-only. No dependency update is performed in this task.

| Package | Current | Wanted | Target resolution | package.json range | Boundary | Update batch |
| --- | --- | --- | --- | --- | --- | --- |
| `@codecov/vite-plugin` | `1.9.1` | `2.0.1` | `2.0.1` | `^2.0.1` | major boundary; lockfile behind manifest | Batch 7 Cloudflare / CI analytics |
| `eslint-plugin-simple-import-sort` | `12.1.1` | `13.0.0` | `13.0.0` | `^13.0.0` | major boundary; lockfile behind manifest | Batch 5 Lint / format tooling |
| `nano-staged` | `0.9.0` | `1.0.2` | `1.0.2` | `^1.0.2` | major boundary; lockfile behind manifest | Batch 5 Lint / format tooling |
| `typescript` | `5.9.3` | `6.0.3` | `6.0.3` | `^6.0.3` | major boundary; lockfile behind manifest | Batch 2 TypeScript / type tooling |
| `vite` | `8.0.3` | `8.0.5` | `8.0.10` | `^8.0.5` | patch target beyond wanted | Batch 3 Svelte / Vite / build stack |
| `hono` | `4.12.9` | `4.12.14` | `4.12.17` | `^4.12.14` | patch target beyond wanted | Batch 6 Runtime deps |
| `typescript-eslint` | `8.57.2` | `8.59.1` | `8.59.2` | `^8.59.1` | patch target beyond wanted | Batch 2 TypeScript / type tooling |
| `@sveltejs/kit` | `2.55.0` | `2.58.0` | `2.59.1` | `^2.58.0` | minor target beyond wanted | Batch 3 Svelte / Vite / build stack |
AUDIT
```

Expected: file exists and states that Task 2 performs no dependency update.

- [ ] **Step 2: Initialize the changelog review log**

Run:

````bash
cat > logs/pnpm-update-2026-05-05/changelog-review.md <<'LOG'
# Changelog Review

Each package entry must be completed before its update batch is committed. If release notes are sparse, use GitHub compare, npm diff, package README, or npm package metadata and record the source.

## Required package entries

- `typescript` 5.9.3 -> 6.0.3
- `typescript-eslint` 8.57.2 -> 8.59.2
- `svelte-check` 4.4.5 -> 4.4.8
- `@types/node` 25.5.0 -> 25.6.0
- `@types/chrome` 0.1.38 -> 0.1.40
- `vite` 8.0.3 -> 8.0.10
- `@sveltejs/kit` 2.55.0 -> 2.59.1
- `@sveltejs/vite-plugin-svelte` 7.0.0 -> 7.1.0
- `svelte` 5.55.0 -> 5.55.5
- `@tailwindcss/vite` 4.2.2 -> 4.2.4
- `tailwindcss` 4.2.2 -> 4.2.4
- `esbuild` 0.27.4 -> 0.28.0
- `vitest` 4.1.2 -> 4.1.5
- `@vitest/coverage-v8` 4.1.2 -> 4.1.5
- `@playwright/test` 1.58.2 -> 1.59.1
- `eslint` 10.1.0 -> 10.3.0
- `eslint-plugin-svelte` 3.16.0 -> 3.17.1
- `eslint-plugin-simple-import-sort` 12.1.1 -> 13.0.0
- `prettier` 3.8.1 -> 3.8.3
- `globals` 17.4.0 -> 17.6.0
- `nano-staged` 0.9.0 -> 1.0.2
- `hono` 4.12.9 -> 4.12.17
- `zod` 4.3.6 -> 4.4.3
- `@konemono/nostr-login` 1.15.2 -> 1.15.7
- `@scure/base` 2.0.0 -> 2.2.0
- `wrangler` 4.78.0 -> 4.87.0
- `@codecov/vite-plugin` 1.9.1 -> 2.0.1

## Entry format

Use this exact entry format for each package before running its update command:

```md
### package-name

- Update: `current` -> `target`
- Sources:
  - release notes: URL or command output file path
  - changelog: URL or command output file path
  - npm: URL or command output file path
- Version range reviewed: `current...target`
- Breaking changes: write `none found` or list the exact change
- Peer dependency changes: write `none found` or list the exact change
- Engine changes: write `none found` or list the exact change
- Config/default behavior changes: write `none found` or list the exact change
- Project impact: write `none`, `source fix required`, or `test fix required`
- Verification commands: list the commands run for this package or batch
- Notes: short project-specific conclusion
````

LOG

````

Expected: file exists with the required package list and entry format.

- [ ] **Step 3: Collect runtime npm diff artifacts**

Run:

```bash
npm diff --diff-name-only --diff='@scure/base@2.0.0' --diff='@scure/base@2.2.0' > logs/pnpm-update-2026-05-05/npm-diff-name-only-scure-base.txt
npm diff --diff='@scure/base@2.0.0' --diff='@scure/base@2.2.0' > logs/pnpm-update-2026-05-05/npm-diff-scure-base.txt
npm diff --diff-name-only --diff='@konemono/nostr-login@1.15.2' --diff='@konemono/nostr-login@1.15.7' > logs/pnpm-update-2026-05-05/npm-diff-name-only-nostr-login.txt
npm diff --diff='@konemono/nostr-login@1.15.2' --diff='@konemono/nostr-login@1.15.7' > logs/pnpm-update-2026-05-05/npm-diff-nostr-login.txt
````

Expected: all four files exist. If npm registry access fails, rerun with approved network access and record the failure plus retry in `logs/pnpm-update-2026-05-05/changelog-review.md`.

- [ ] **Step 4: Commit audit and changelog scaffolding**

Run:

```bash
git add logs/pnpm-update-2026-05-05/wanted-current-audit.md logs/pnpm-update-2026-05-05/changelog-review.md logs/pnpm-update-2026-05-05/npm-diff-name-only-scure-base.txt logs/pnpm-update-2026-05-05/npm-diff-scure-base.txt logs/pnpm-update-2026-05-05/npm-diff-name-only-nostr-login.txt logs/pnpm-update-2026-05-05/npm-diff-nostr-login.txt
git commit -m "chore(deps): audit update targets and changelogs"
```

Expected: commit succeeds.

---

## Task 3: TypeScript / Type Tooling Batch

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `logs/pnpm-update-2026-05-05/changelog-review.md`
- Create: `logs/pnpm-update-2026-05-05/install-typescript.log`
- Create: `logs/pnpm-update-2026-05-05/typescript-grep.txt`
- Modify: source/test/config files only if TypeScript 6 verification proves a required migration.

- [ ] **Step 1: Complete changelog entries for this batch**

Update `logs/pnpm-update-2026-05-05/changelog-review.md` with completed entries for:

```text
typescript 5.9.3 -> 6.0.3
typescript-eslint 8.57.2 -> 8.59.2
svelte-check 4.4.5 -> 4.4.8
@types/node 25.5.0 -> 25.6.0
@types/chrome 0.1.38 -> 0.1.40
```

Expected: each entry has concrete sources and a project impact conclusion. No entry contains `TBD`, `TODO`, or `unknown`.

- [ ] **Step 2: Run TypeScript 6 grep checks before updating**

Run:

```bash
{
  echo '# tsc file argument scan';
  rg "tsc .*\\.(ts|tsx)" package.json .github scripts packages || true;
  echo;
  echo '# deprecated option / import assertion scan';
  rg "importsNotUsedAsValues|preserveValueImports|suppressImplicitAnyIndexErrors|keyofStringsOnly|moduleResolution.*node|target.*es5|no-default-lib|outFile|asserts? \\{\\s*type" . || true;
} > logs/pnpm-update-2026-05-05/typescript-grep.txt
```

Expected: file exists. If matches appear, classify each match in `logs/pnpm-update-2026-05-05/changelog-review.md` before updating.

- [ ] **Step 3: Update TypeScript/type tooling to target resolution**

Run:

```bash
pnpm add -w -D typescript@6.0.3 typescript-eslint@8.59.2 svelte-check@4.4.8 @types/node@25.6.0 @types/chrome@0.1.40
```

Expected: `package.json` ranges allow the target resolution and `pnpm-lock.yaml` resolves the five packages to target resolution.

- [ ] **Step 4: Save install and peer/engine warning log**

Run:

```bash
pnpm install 2>&1 | tee logs/pnpm-update-2026-05-05/install-typescript.log
pnpm list --depth 0 | tee logs/pnpm-update-2026-05-05/pnpm-list-depth-0-typescript.txt
```

Expected: install exits 0. For pnpm 10.33.2, do not run `pnpm peers check`; inspect `install-typescript.log` for peer and engine warnings.

- [ ] **Step 5: Verify TypeScript/type tooling batch**

Run:

```bash
pnpm run check
pnpm run lint
pnpm run test:packages
```

Expected: all commands exit 0. If a failure is caused by TypeScript 6, make the smallest source/test/config fix and document it in `logs/pnpm-update-2026-05-05/source-fixes.md`.

- [ ] **Step 6: Commit TypeScript/type tooling batch**

Run:

```bash
git add package.json pnpm-lock.yaml logs/pnpm-update-2026-05-05/changelog-review.md logs/pnpm-update-2026-05-05/typescript-grep.txt logs/pnpm-update-2026-05-05/install-typescript.log logs/pnpm-update-2026-05-05/pnpm-list-depth-0-typescript.txt
git add logs/pnpm-update-2026-05-05/source-fixes.md 2>/dev/null || true
git add -u
git commit -m "chore(deps): update TypeScript tooling"
```

Expected: commit succeeds.

---

## Task 4: Svelte / Vite / Build Stack Batch

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `logs/pnpm-update-2026-05-05/changelog-review.md`
- Create: `logs/pnpm-update-2026-05-05/install-build-stack.log`
- Create: `logs/pnpm-update-2026-05-05/pnpm-why-esbuild.txt`
- Modify: build config/source files only if Vite/SvelteKit/esbuild verification proves a required migration.

- [ ] **Step 1: Complete changelog entries for this batch**

Update `logs/pnpm-update-2026-05-05/changelog-review.md` with completed entries for:

```text
vite 8.0.3 -> 8.0.10
@sveltejs/kit 2.55.0 -> 2.59.1
@sveltejs/vite-plugin-svelte 7.0.0 -> 7.1.0
svelte 5.55.0 -> 5.55.5
@tailwindcss/vite 4.2.2 -> 4.2.4
tailwindcss 4.2.2 -> 4.2.4
esbuild 0.27.4 -> 0.28.0
```

Expected: entries mention Vite 8 unresolved migration risk, Node engine impact, plugin hook/build behavior, and esbuild 0.x minor risk.

- [ ] **Step 2: Record esbuild usage before updating**

Run:

```bash
pnpm why esbuild > logs/pnpm-update-2026-05-05/pnpm-why-esbuild.txt
```

Expected: file exists and shows both direct and transitive esbuild usage if present.

- [ ] **Step 3: Update build stack to target resolution**

Run:

```bash
pnpm add -w -D vite@8.0.10 @sveltejs/kit@2.59.1 @sveltejs/vite-plugin-svelte@7.1.0 svelte@5.55.5 @tailwindcss/vite@4.2.4 tailwindcss@4.2.4 esbuild@0.28.0
```

Expected: command exits 0 and lockfile resolves all seven packages to target resolution.

- [ ] **Step 4: Save install and top-level resolution log**

Run:

```bash
pnpm install 2>&1 | tee logs/pnpm-update-2026-05-05/install-build-stack.log
pnpm list --depth 0 | tee logs/pnpm-update-2026-05-05/pnpm-list-depth-0-build-stack.txt
```

Expected: install exits 0. Inspect `install-build-stack.log` for Vite/Svelte peer warnings.

- [ ] **Step 5: Verify build stack batch**

Run:

```bash
pnpm run check
pnpm run build
pnpm run build:e2e-helpers
pnpm run build:ext:chrome
```

Expected: all commands exit 0. If `build:ext:chrome` updates ignored build output under `dist-extension/`, do not stage generated output.

- [ ] **Step 6: Commit build stack batch**

Run:

```bash
git add package.json pnpm-lock.yaml logs/pnpm-update-2026-05-05/changelog-review.md logs/pnpm-update-2026-05-05/pnpm-why-esbuild.txt logs/pnpm-update-2026-05-05/install-build-stack.log logs/pnpm-update-2026-05-05/pnpm-list-depth-0-build-stack.txt
git add logs/pnpm-update-2026-05-05/source-fixes.md 2>/dev/null || true
git add -u
git commit -m "chore(deps): update Svelte and Vite build stack"
```

Expected: commit succeeds.

---

## Task 5: Test / E2E Tooling Batch

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `logs/pnpm-update-2026-05-05/changelog-review.md`
- Create: `logs/pnpm-update-2026-05-05/install-test-tooling.log`
- Create: `logs/pnpm-update-2026-05-05/playwright-version.txt`
- Create: `logs/pnpm-update-2026-05-05/playwright-install-chromium.log`

- [ ] **Step 1: Complete changelog entries for this batch**

Update `logs/pnpm-update-2026-05-05/changelog-review.md` with completed entries for:

```text
vitest 4.1.2 -> 4.1.5
@vitest/coverage-v8 4.1.2 -> 4.1.5
@playwright/test 1.58.2 -> 1.59.1
```

Expected: Playwright entry mentions Chromium-only project from `playwright.config.ts`.

- [ ] **Step 2: Update test tooling to target resolution**

Run:

```bash
pnpm add -w -D vitest@4.1.5 @vitest/coverage-v8@4.1.5 @playwright/test@1.59.1
```

Expected: command exits 0 and lockfile resolves all three packages to target resolution.

- [ ] **Step 3: Save install and top-level resolution log**

Run:

```bash
pnpm install 2>&1 | tee logs/pnpm-update-2026-05-05/install-test-tooling.log
pnpm list --depth 0 | tee logs/pnpm-update-2026-05-05/pnpm-list-depth-0-test-tooling.txt
```

Expected: install exits 0.

- [ ] **Step 4: Install Chromium browser binary for updated Playwright**

Run:

```bash
pnpm exec playwright --version | tee logs/pnpm-update-2026-05-05/playwright-version.txt
pnpm exec playwright install --with-deps chromium 2>&1 | tee logs/pnpm-update-2026-05-05/playwright-install-chromium.log
```

Expected: Playwright version is `1.59.1`. If OS-level dependency installation is blocked locally, record the failure and continue only if CI is expected to install Chromium via `.github/workflows/ci.yml`.

- [ ] **Step 5: Verify test tooling batch**

Run:

```bash
pnpm run test:packages
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
```

Expected: all commands exit 0. If e2e fails due to browser install or local platform constraints, record the exact failure in `logs/pnpm-update-2026-05-05/verification.md`.

- [ ] **Step 6: Commit test tooling batch**

Run:

```bash
git add package.json pnpm-lock.yaml logs/pnpm-update-2026-05-05/changelog-review.md logs/pnpm-update-2026-05-05/install-test-tooling.log logs/pnpm-update-2026-05-05/pnpm-list-depth-0-test-tooling.txt logs/pnpm-update-2026-05-05/playwright-version.txt logs/pnpm-update-2026-05-05/playwright-install-chromium.log
git add logs/pnpm-update-2026-05-05/verification.md 2>/dev/null || true
git add -u
git commit -m "chore(deps): update test tooling"
```

Expected: commit succeeds.

---

## Task 6: Lint / Format Tooling Batch

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `logs/pnpm-update-2026-05-05/changelog-review.md`
- Create: `logs/pnpm-update-2026-05-05/install-lint-format.log`
- Modify: lint/format config files only if dependency release notes require config migration.

- [ ] **Step 1: Complete changelog entries for this batch**

Update `logs/pnpm-update-2026-05-05/changelog-review.md` with completed entries for:

```text
eslint 10.1.0 -> 10.3.0
eslint-plugin-svelte 3.16.0 -> 3.17.1
eslint-plugin-simple-import-sort 12.1.1 -> 13.0.0
prettier 3.8.1 -> 3.8.3
globals 17.4.0 -> 17.6.0
nano-staged 0.9.0 -> 1.0.2
```

Expected: ESLint entry mentions `@eslint/js` is compatibility-only and not an update target.

- [ ] **Step 2: Update lint/format tooling to target resolution**

Run:

```bash
pnpm add -w -D eslint@10.3.0 eslint-plugin-svelte@3.17.1 eslint-plugin-simple-import-sort@13.0.0 prettier@3.8.3 globals@17.6.0 nano-staged@1.0.2
```

Expected: command exits 0 and lockfile resolves all six packages to target resolution.

- [ ] **Step 3: Save install and top-level resolution log**

Run:

```bash
pnpm install 2>&1 | tee logs/pnpm-update-2026-05-05/install-lint-format.log
pnpm list --depth 0 | tee logs/pnpm-update-2026-05-05/pnpm-list-depth-0-lint-format.txt
```

Expected: install exits 0. Inspect install log for ESLint/plugin peer warnings.

- [ ] **Step 4: Verify lint/format batch**

Run:

```bash
pnpm run lint
pnpm run format:check
pnpm run check
```

Expected: all commands exit 0. If `lint` or `format:check` fails only because of dependency-driven formatting/lint rule changes, run the minimal formatter/linter fix and stage only files touched by that tool.

- [ ] **Step 5: Commit lint/format tooling batch**

Run:

```bash
git add package.json pnpm-lock.yaml logs/pnpm-update-2026-05-05/changelog-review.md logs/pnpm-update-2026-05-05/install-lint-format.log logs/pnpm-update-2026-05-05/pnpm-list-depth-0-lint-format.txt
git add -u
git commit -m "chore(deps): update lint and format tooling"
```

Expected: commit succeeds.

---

## Task 7: Runtime Dependencies Batch

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `logs/pnpm-update-2026-05-05/changelog-review.md`
- Create: `logs/pnpm-update-2026-05-05/install-runtime.log`
- Existing diff artifacts from Task 2: `logs/pnpm-update-2026-05-05/npm-diff-*.txt`
- Modify: server/runtime/source/test files only if Hono/Zod/scure/nostr-login migration requires it.

- [ ] **Step 1: Complete changelog entries for this batch**

Update `logs/pnpm-update-2026-05-05/changelog-review.md` with completed entries for:

```text
hono 4.12.9 -> 4.12.17
zod 4.3.6 -> 4.4.3
@konemono/nostr-login 1.15.2 -> 1.15.7
@scure/base 2.0.0 -> 2.2.0
```

Expected: entries cover route/middleware/error shape, Zod optional/default/catch/preprocess/transform behavior, Nostr login flow, and encoding golden-vector risk.

- [ ] **Step 2: Check whether the app uses hono/jsx**

Run:

```bash
rg -n "hono/jsx|from 'hono/jsx'|from \"hono/jsx\"" src packages scripts .github || true
```

Expected: if no output, record `hono/jsx not used` in the Hono changelog entry. If output exists, add a Hono-specific source/test verification note before updating.

- [ ] **Step 3: Update runtime dependencies to target resolution**

Run:

```bash
pnpm add -w hono@4.12.17 zod@4.4.3 @konemono/nostr-login@1.15.7 @scure/base@2.2.0
```

Expected: command exits 0 and lockfile resolves all four packages to target resolution.

- [ ] **Step 4: Save install and top-level resolution log**

Run:

```bash
pnpm install 2>&1 | tee logs/pnpm-update-2026-05-05/install-runtime.log
pnpm list --depth 0 | tee logs/pnpm-update-2026-05-05/pnpm-list-depth-0-runtime.txt
```

Expected: install exits 0. Inspect log for engine and peer warnings.

- [ ] **Step 5: Verify runtime dependency batch**

Run:

```bash
pnpm run test:packages
pnpm run test:auftakt:app-regression
pnpm run check
```

Expected: all commands exit 0. If failures point to Hono/Zod response shape or validation behavior, add or update the narrowest relevant test before changing production code.

- [ ] **Step 6: Commit runtime dependency batch**

Run:

```bash
git add package.json pnpm-lock.yaml logs/pnpm-update-2026-05-05/changelog-review.md logs/pnpm-update-2026-05-05/install-runtime.log logs/pnpm-update-2026-05-05/pnpm-list-depth-0-runtime.txt logs/pnpm-update-2026-05-05/npm-diff-name-only-scure-base.txt logs/pnpm-update-2026-05-05/npm-diff-scure-base.txt logs/pnpm-update-2026-05-05/npm-diff-name-only-nostr-login.txt logs/pnpm-update-2026-05-05/npm-diff-nostr-login.txt
git add logs/pnpm-update-2026-05-05/source-fixes.md 2>/dev/null || true
git add -u
git commit -m "chore(deps): update runtime dependencies"
```

Expected: commit succeeds.

---

## Task 8: Cloudflare / CI Analytics Batch

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `logs/pnpm-update-2026-05-05/changelog-review.md`
- Create: `logs/pnpm-update-2026-05-05/install-cloudflare-codecov.log`
- Create: `logs/pnpm-update-2026-05-05/wrangler-version.txt`
- Modify: `vite.config.ts` only if Codecov plugin migration requires it.
- Modify: Cloudflare config only if Wrangler migration requires it.

- [ ] **Step 1: Complete changelog entries for this batch**

Update `logs/pnpm-update-2026-05-05/changelog-review.md` with completed entries for:

```text
wrangler 4.78.0 -> 4.87.0
@codecov/vite-plugin 1.9.1 -> 2.0.1
```

Expected: Wrangler entry includes Node `<22` hard fail and Pages dev/preview behavior. Codecov entry includes `CODECOV_TOKEN` absent local build, token-present CI build, Vite plugin behavior, and telemetry policy.

- [ ] **Step 2: Update Cloudflare/Codecov tooling to target resolution**

Run:

```bash
pnpm add -w -D wrangler@4.87.0 @codecov/vite-plugin@2.0.1
```

Expected: command exits 0 and lockfile resolves both packages to target resolution.

- [ ] **Step 3: Save install and top-level resolution log**

Run:

```bash
pnpm install 2>&1 | tee logs/pnpm-update-2026-05-05/install-cloudflare-codecov.log
pnpm list --depth 0 | tee logs/pnpm-update-2026-05-05/pnpm-list-depth-0-cloudflare-codecov.txt
pnpm exec wrangler --version | tee logs/pnpm-update-2026-05-05/wrangler-version.txt
```

Expected: install exits 0 and Wrangler reports `4.87.0`.

- [ ] **Step 4: Verify Cloudflare/Codecov batch**

Run:

```bash
pnpm run build
pnpm run test:auftakt:e2e
```

Expected: both commands exit 0. `pnpm run build` must pass without `CODECOV_TOKEN` in local environment.

- [ ] **Step 5: Commit Cloudflare/Codecov batch**

Run:

```bash
git add package.json pnpm-lock.yaml logs/pnpm-update-2026-05-05/changelog-review.md logs/pnpm-update-2026-05-05/install-cloudflare-codecov.log logs/pnpm-update-2026-05-05/pnpm-list-depth-0-cloudflare-codecov.txt logs/pnpm-update-2026-05-05/wrangler-version.txt
git add logs/pnpm-update-2026-05-05/source-fixes.md 2>/dev/null || true
git add -u
git commit -m "chore(deps): update Cloudflare and Codecov tooling"
```

Expected: commit succeeds.

---

## Task 9: Final Resolution And Full Verification

**Files:**

- Create: `logs/pnpm-update-2026-05-05/final-resolution.md`
- Create: `logs/pnpm-update-2026-05-05/pnpm-list-depth-0-final.txt`
- Create: `logs/pnpm-update-2026-05-05/pnpm-outdated-final.txt`
- Modify: `logs/pnpm-update-2026-05-05/verification.md`

- [ ] **Step 1: Record final top-level dependency resolution**

Run:

```bash
pnpm list --depth 0 | tee logs/pnpm-update-2026-05-05/pnpm-list-depth-0-final.txt
```

Expected: output includes target resolutions for all direct targets, including `typescript 6.0.3`, `vite 8.0.10`, `@sveltejs/kit 2.59.1`, `hono 4.12.17`, `zod 4.4.3`, `wrangler 4.87.0`, and `esbuild 0.28.0`.

- [ ] **Step 2: Record final outdated output without requiring it to be empty**

Run:

```bash
pnpm outdated --format table > logs/pnpm-update-2026-05-05/pnpm-outdated-final.txt || true
```

Expected: command completes. If packages are shown because npm `latest` moved after the target snapshot, record them as scope-out in the next step.

- [ ] **Step 3: Write final resolution summary**

Run:

```bash
cat > logs/pnpm-update-2026-05-05/final-resolution.md <<'SUMMARY'
# Final Resolution Summary

Completion is based on the approved target resolution table, not on `pnpm outdated` being empty.

## Target resolution check

- `@codecov/vite-plugin`: target `2.0.1`
- `eslint-plugin-simple-import-sort`: target `13.0.0`
- `nano-staged`: target `1.0.2`
- `typescript`: target `6.0.3`
- `vite`: target `8.0.10`
- `@konemono/nostr-login`: target `1.15.7`
- `@tailwindcss/vite`: target `4.2.4`
- `@vitest/coverage-v8`: target `4.1.5`
- `hono`: target `4.12.17`
- `prettier`: target `3.8.3`
- `svelte`: target `5.55.5`
- `svelte-check`: target `4.4.8`
- `tailwindcss`: target `4.2.4`
- `typescript-eslint`: target `8.59.2`
- `vitest`: target `4.1.5`
- `@playwright/test`: target `1.59.1`
- `@scure/base`: target `2.2.0`
- `@sveltejs/kit`: target `2.59.1`
- `@sveltejs/vite-plugin-svelte`: target `7.1.0`
- `@types/node`: target `25.6.0`
- `eslint`: target `10.3.0`
- `eslint-plugin-svelte`: target `3.17.1`
- `globals`: target `17.6.0`
- `wrangler`: target `4.87.0`
- `zod`: target `4.4.3`
- `@types/chrome`: target `0.1.40`
- `esbuild`: target `0.28.0`

## Scope-out rule

If `logs/pnpm-update-2026-05-05/pnpm-outdated-final.txt` contains packages newer than the target resolution above, those newer versions are outside this update scope.
SUMMARY
```

Expected: file exists with the target resolution checklist.

- [ ] **Step 4: Run final frozen install**

Run:

```bash
pnpm install --frozen-lockfile 2>&1 | tee logs/pnpm-update-2026-05-05/install-final-frozen.log
```

Expected: exit 0. This proves `package.json` and `pnpm-lock.yaml` are synchronized.

- [ ] **Step 5: Run final gates**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
pnpm run lint
pnpm run format:check
pnpm run test:packages
pnpm run check
pnpm run build
pnpm run test:auftakt:e2e
```

Expected: all commands exit 0. If e2e cannot run locally for environment reasons, record the exact reason and the strongest alternate verification in `logs/pnpm-update-2026-05-05/verification.md`.

- [ ] **Step 6: Commit final verification logs**

Run:

```bash
git add logs/pnpm-update-2026-05-05/final-resolution.md logs/pnpm-update-2026-05-05/pnpm-list-depth-0-final.txt logs/pnpm-update-2026-05-05/pnpm-outdated-final.txt logs/pnpm-update-2026-05-05/install-final-frozen.log
git add logs/pnpm-update-2026-05-05/verification.md 2>/dev/null || true
git add -u
git commit -m "chore(deps): record final dependency verification"
```

Expected: commit succeeds.

---

## Task 10: Final Worktree Check

**Files:**

- Read: `package.json`
- Read: `pnpm-lock.yaml`
- Read: `logs/pnpm-update-2026-05-05/final-resolution.md`

- [ ] **Step 1: Confirm no accidental generated artifacts are staged or untracked**

Run:

```bash
git status --short
```

Expected: no output. If ignored build output was created under `.svelte-kit/`, `build/`, `.wrangler/`, or `dist-extension/`, it should not appear in `git status`.

- [ ] **Step 2: Summarize commits for PR or handoff**

Run:

```bash
git log --oneline --max-count=12
```

Expected: output includes the dependency update batch commits from this plan.

- [ ] **Step 3: Prepare final user-facing summary**

Write a concise summary with:

```text
- Updated dependency batches completed
- Target resolution basis: logs/pnpm-update-2026-05-05/final-resolution.md
- Changelog review log: logs/pnpm-update-2026-05-05/changelog-review.md
- Final gates run: check:auftakt-migration -- --proof, lint, format:check, test:packages, check, build, test:auftakt:e2e
- Any skipped gate and exact reason, if applicable
```

Expected: summary contains no unsupported claim such as “all tests passed” unless the command output was observed.

---

## Plan Self-Review

Spec coverage:

- Target resolution 固定: Task 1, Task 9。
- packageManager / pnpm version drift 防止: Task 1。
- Batch 1 audit-only: Task 2。
- Changelog / release note 確認: Task 2 and each update batch first step。
- TypeScript 6 grep / deprecated option 確認: Task 3。
- Vite 8.0.3 -> 8.0.10 と build stack 検証: Task 4。
- Playwright Chromium install / e2e 検証: Task 5。
- lint / format tooling と final lint / format gate: Task 6 and Task 9。
- Runtime npm diff / Hono JSX / Zod / scure / nostr-login 確認: Task 7。
- Wrangler / Codecov local build and e2e 検証: Task 8。
- `pnpm outdated` が空であることを完了条件にしない: Task 9。
- frozen lockfile final gate: Task 9。

Placeholder scan result:

- No task contains `TBD`, `TODO`, `batch-N`, or a required command left unspecified.

Type/command consistency:

- All root dependency update commands use `pnpm add -w`.
- All package targets match `docs/superpowers/specs/2026-05-05-pnpm-outdated-update-design.md`.
- `pnpm peers check` is not used as a pnpm 10 gate; pnpm 10 uses install logs and `pnpm list --depth 0`.
