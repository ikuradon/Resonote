# Changelog Review

Each package entry must be completed before its update batch is committed. If release notes are sparse, use GitHub compare, npm diff, package README, or npm package metadata and record the source.
This file is scoped to all update targets reviewed across subsequent batches, not only the 8 wanted/current audit entries.

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
```

## Task 3 Entries

### typescript

- Update: `5.9.3` -> `6.0.3`
- Sources:
  - release notes: https://devblogs.microsoft.com/typescript/
  - changelog: https://github.com/microsoft/TypeScript/releases
  - npm: https://www.npmjs.com/package/typescript
- Version range reviewed: `5.9.3...6.0.3`
- Breaking changes: TypeScript 6 系へのメジャー更新のため破壊的変更の可能性あり（実プロジェクト検証で確認）
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: 旧/非推奨オプション影響の可能性あり（grep と check/lint/test で検証）
- TypeScript 6 grep classification:
  - 検索対象除外: `logs/**`, `docs/**`, `.git/**`, `node_modules/**`, `.svelte-kit/**`
  - `tsc .*\\.(ts|tsx)` マッチ: なし
  - legacy/removed candidate マッチ: `src/service-worker.ts` の `/// <reference no-default-lib=\"true\"/>` のみ（意図的な lib 参照制御コメント）
  - 判定: TypeScript 6 移行阻害となる設定/CLI 利用は検出なし
- Project impact: none
- Verification commands: `pnpm run check`, `pnpm run lint`, `pnpm run test:packages`
- Notes: 既存 tsconfig/script を grep で確認し、更新後の実行検証を通過させる。

### typescript-eslint

- Update: `8.57.2` -> `8.59.2`
- Sources:
  - release notes: https://github.com/typescript-eslint/typescript-eslint/releases
  - changelog: https://github.com/typescript-eslint/typescript-eslint/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/typescript-eslint
- Version range reviewed: `8.57.2...8.59.2`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run lint`, `pnpm run check`
- Notes: TypeScript 6 系との組み合わせで lint/check を実行して整合性確認。

### svelte-check

- Update: `4.4.5` -> `4.4.8`
- Sources:
  - release notes: https://github.com/sveltejs/language-tools/releases
  - changelog: https://github.com/sveltejs/language-tools/blob/master/packages/svelte-check/CHANGELOG.md
  - npm: https://www.npmjs.com/package/svelte-check
- Version range reviewed: `4.4.5...4.4.8`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run check`
- Notes: Svelte 型検査コマンドの通過をもって回帰なしを確認。

### @types/node

- Update: `25.5.0` -> `25.6.0`
- Sources:
  - release notes: https://github.com/DefinitelyTyped/DefinitelyTyped/commits/master/types/node
  - changelog: https://www.npmjs.com/package/@types/node?activeTab=versions
  - npm: https://www.npmjs.com/package/@types/node
- Version range reviewed: `25.5.0...25.6.0`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run check`, `pnpm run test:packages`
- Notes: Node 型定義更新による型エラー増減を検証コマンドで確認。

### @types/chrome

- Update: `0.1.38` -> `0.1.40`
- Sources:
  - release notes: https://github.com/DefinitelyTyped/DefinitelyTyped/commits/master/types/chrome
  - changelog: https://www.npmjs.com/package/@types/chrome?activeTab=versions
  - npm: https://www.npmjs.com/package/@types/chrome
- Version range reviewed: `0.1.38...0.1.40`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run check`, `pnpm run test:packages`
- Notes: extension 側型定義更新のため check/test で回帰確認。

## Task 4 Entries

### vite

- Update: `8.0.3` -> `8.0.10`
- Sources:
  - release notes: https://github.com/vitejs/vite/releases
  - changelog: https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md
  - npm: https://www.npmjs.com/package/vite
- Version range reviewed: `8.0.3...8.0.10`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: Node エンジン要件は本repoの実行環境で `pnpm run check` / `pnpm run build` 成功、engine 警告はログ上で未検出
- Config/default behavior changes: Vite 8 (rolldown) 由来の `PLUGIN_TIMINGS` / chunk size warning は発生したが build は成功し、既存設定で動作継続
- Project impact: none（ただし Vite 8 migration は未解決リスクとして監視継続）
- Verification commands: `pnpm run check`, `pnpm run build`
- Notes: 未解決 migration risk は「一部 plugin が Vite 8 peer を未宣言」の点（`@codecov/vite-plugin`）で、現時点は警告のみ・実動作は通過。

### @sveltejs/kit

- Update: `2.55.0` -> `2.59.1`
- Sources:
  - release notes: https://github.com/sveltejs/kit/releases
  - changelog: https://github.com/sveltejs/kit/blob/main/packages/kit/CHANGELOG.md
  - npm: https://www.npmjs.com/package/@sveltejs/kit
- Version range reviewed: `2.55.0...2.59.1`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: Node engine 警告は install/verify ログ上で未検出、Kit 更新後も check/build が通過
- Config/default behavior changes: plugin hook 実行は継続（`svelte-kit sync` / adapter-cloudflare 出力を確認）
- Project impact: none
- Verification commands: `pnpm run check`, `pnpm run build`
- Notes: SvelteKit runtime/build 周辺変更を batch で検証。

### @sveltejs/vite-plugin-svelte

- Update: `7.0.0` -> `7.1.0`
- Sources:
  - release notes: https://github.com/sveltejs/vite-plugin-svelte/releases
  - changelog: https://github.com/sveltejs/vite-plugin-svelte/blob/main/packages/vite-plugin-svelte/CHANGELOG.md
  - npm: https://www.npmjs.com/package/@sveltejs/vite-plugin-svelte
- Version range reviewed: `7.0.0...7.1.0`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: Node engine 警告は未検出
- Config/default behavior changes: Vite 8 上で plugin hook が動作し build 完了（`vite-plugin-sveltekit-guard` timing warning は性能観点のみ）
- Project impact: none
- Verification commands: `pnpm run check`, `pnpm run build`
- Notes: Vite 8 系との組み合わせで build/check 通過を確認。

### svelte

- Update: `5.55.0` -> `5.55.5`
- Sources:
  - release notes: https://github.com/sveltejs/svelte/releases
  - changelog: https://github.com/sveltejs/svelte/blob/main/packages/svelte/CHANGELOG.md
  - npm: https://www.npmjs.com/package/svelte
- Version range reviewed: `5.55.0...5.55.5`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: Node engine 警告は未検出
- Config/default behavior changes: Svelte 5.55.5 への更新後も `svelte-check` 0 error/0 warning
- Project impact: none
- Verification commands: `pnpm run check`, `pnpm run build`
- Notes: patch 更新のため check/build を主検証とする。

### @tailwindcss/vite

- Update: `4.2.2` -> `4.2.4`
- Sources:
  - release notes: https://github.com/tailwindlabs/tailwindcss/releases
  - changelog: https://github.com/tailwindlabs/tailwindcss/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/@tailwindcss/vite
- Version range reviewed: `4.2.2...4.2.4`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: Node engine 警告は未検出
- Config/default behavior changes: build フック動作は維持（生成物更新と build 成功を確認）
- Project impact: none
- Verification commands: `pnpm run build`
- Notes: Vite plugin の patch 更新として build 出力回帰を確認。

### tailwindcss

- Update: `4.2.2` -> `4.2.4`
- Sources:
  - release notes: https://github.com/tailwindlabs/tailwindcss/releases
  - changelog: https://github.com/tailwindlabs/tailwindcss/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/tailwindcss
- Version range reviewed: `4.2.2...4.2.4`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: Node engine 警告は未検出
- Config/default behavior changes: Tailwind 4.2.4 適用後も CSS アセット生成は正常（build 成功）
- Project impact: none
- Verification commands: `pnpm run build`
- Notes: CSS 生成回帰は build 成功で確認。

### esbuild

- Update: `0.27.4` -> `0.28.0`
- Sources:
  - release notes: https://github.com/evanw/esbuild/releases
  - changelog: https://github.com/evanw/esbuild/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/esbuild
- Version range reviewed: `0.27.4...0.28.0`
- Breaking changes: 0.x 系は minor でも破壊的変更を含みうるためリスクあり（0.27 -> 0.28）
- Peer dependency changes: none found
- Engine changes: Node engine 警告は未検出
- Config/default behavior changes: `build:e2e-helpers` / `build:ext:chrome` で esbuild 0.28.0 実行成功
- Project impact: none（0.x minor risk を踏まえ verify 実施済み）
- Verification commands: `pnpm run check`, `pnpm run build`
- Notes: `pnpm why esbuild` で 0.27.3（wrangler 経由）と 0.28.0（direct/Vite 経由）の共存を確認。今回の対象 build は 0.28.0 で成功。

## Task 5 Entries

### vitest

- Update: `4.1.2` -> `4.1.5`
- Sources:
  - release notes: https://github.com/vitest-dev/vitest/releases
  - changelog: https://github.com/vitest-dev/vitest/blob/main/packages/vitest/CHANGELOG.md
  - npm: https://www.npmjs.com/package/vitest
- Version range reviewed: `4.1.2...4.1.5`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run test:packages`, `pnpm run test:auftakt:app-regression`, `pnpm run test:auftakt:e2e`
- Notes: patch 更新のため既存 test suite で回帰確認。

### @vitest/coverage-v8

- Update: `4.1.2` -> `4.1.5`
- Sources:
  - release notes: https://github.com/vitest-dev/vitest/releases
  - changelog: https://github.com/vitest-dev/vitest/blob/main/packages/coverage-v8/CHANGELOG.md
  - npm: https://www.npmjs.com/package/@vitest/coverage-v8
- Version range reviewed: `4.1.2...4.1.5`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run test:packages`, `pnpm run test:auftakt:app-regression`, `pnpm run test:auftakt:e2e`
- Notes: vitest 本体と同一系列 patch のため batch 検証で確認。

### @playwright/test

- Update: `1.58.2` -> `1.59.1`
- Sources:
  - release notes: https://github.com/microsoft/playwright/releases
  - changelog: https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md
  - npm: https://www.npmjs.com/package/@playwright/test
- Version range reviewed: `1.58.2...1.59.1`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm exec playwright --version`, `pnpm exec playwright install --with-deps chromium`, `pnpm run test:auftakt:e2e`
- Notes: Chromium install と e2e 実行でツールチェーン整合性を確認。

## Task 6 Entries

### eslint

- Update: `10.1.0` -> `10.3.0`
- Sources:
  - release notes: https://github.com/eslint/eslint/releases
  - changelog: https://github.com/eslint/eslint/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/eslint
- Version range reviewed: `10.1.0...10.3.0`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run lint`, `pnpm run format:check`, `pnpm run check`
- Notes: `@eslint/js` は compatibility-only であり、この batch の更新対象外。

### eslint-plugin-svelte

- Update: `3.16.0` -> `3.17.1`
- Sources:
  - release notes: https://github.com/sveltejs/eslint-plugin-svelte/releases
  - changelog: https://github.com/sveltejs/eslint-plugin-svelte/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/eslint-plugin-svelte
- Version range reviewed: `3.16.0...3.17.1`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run lint`, `pnpm run check`
- Notes: Svelte lint ルールの差分は既存 lint/check で回帰確認。

### eslint-plugin-simple-import-sort

- Update: `12.1.1` -> `13.0.0`
- Sources:
  - release notes: https://github.com/lydell/eslint-plugin-simple-import-sort/releases
  - changelog: https://github.com/lydell/eslint-plugin-simple-import-sort/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/eslint-plugin-simple-import-sort
- Version range reviewed: `12.1.1...13.0.0`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run lint`, `pnpm run check`
- Notes: 既に target range 設定済みのため lockfile 整合と lint 実行で確認。

### prettier

- Update: `3.8.1` -> `3.8.3`
- Sources:
  - release notes: https://github.com/prettier/prettier/releases
  - changelog: https://github.com/prettier/prettier/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/prettier
- Version range reviewed: `3.8.1...3.8.3`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run format:check`, `pnpm run check`
- Notes: format check で回帰確認。

### globals

- Update: `17.4.0` -> `17.6.0`
- Sources:
  - release notes: https://github.com/sindresorhus/globals/releases
  - changelog: https://github.com/sindresorhus/globals/blob/main/changelog.md
  - npm: https://www.npmjs.com/package/globals
- Version range reviewed: `17.4.0...17.6.0`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run lint`, `pnpm run check`
- Notes: ESLint 環境グローバル定義差分は lint/check で確認。

### nano-staged

- Update: `0.9.0` -> `1.0.2`
- Sources:
  - release notes: https://github.com/usmanyunusov/nano-staged/releases
  - changelog: https://github.com/usmanyunusov/nano-staged/blob/main/CHANGELOG.md
  - npm: https://www.npmjs.com/package/nano-staged
- Version range reviewed: `0.9.0...1.0.2`
- Breaking changes: none found
- Peer dependency changes: none found
- Engine changes: none found
- Config/default behavior changes: none found
- Project impact: none
- Verification commands: `pnpm run lint`, `pnpm run format:check`, `pnpm run check`
- Notes: 既に target range 設定済みのため pre-commit toolchain の install/lint/check で確認。
