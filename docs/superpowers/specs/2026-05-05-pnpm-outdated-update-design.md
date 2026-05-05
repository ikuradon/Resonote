# pnpm outdated Update Design

## 背景

`pnpm outdated --format table` の結果、root `package.json` と `pnpm-lock.yaml` の wanted/current に差分がある依存と、latest が newer な依存が複数ある。今回の目的は、`pnpm outdated` に表示された依存をすべて latest へ更新すること。ただし、SvelteKit/Vite/TypeScript/Wrangler/esbuild など build・typecheck・runtime に影響しやすい依存が含まれるため、changelog 確認と検証を省略しない。

この作業は実装変更そのものではなく、依存更新を安全に進めるための計画である。更新は lockfile と manifest の変更を中心に行い、breaking change への追従が必要な場合だけ最小限の source/test 修正を行う。

## Goals

- `pnpm outdated` に表示された依存を latest まで更新する。
- 各 dependency について、現在版から latest までの changelog/release notes を確認する。
- 更新はリスク別バッチに分け、各バッチ後に検証する。
- 失敗時に原因 package を切り分けられる進め方にする。
- 最終的に project の主要 gate を通す。

## Non-Goals

- 依存更新と無関係な refactor は行わない。
- deprecated API 置換が大規模になる場合、無理に同一バッチで完了しない。
- major version が出ていない依存まで lockfile 外で探索して追加更新しない。
- package manager、Node engine、workspace 構成自体は変更しない。

## 現在の更新対象

2026-05-05 時点の `pnpm outdated --format table` で確認した対象は次の通り。

| Package                            | Current                   | Latest    | 区分    |
| ---------------------------------- | ------------------------- | --------- | ------- |
| `@codecov/vite-plugin`             | `1.9.1` wanted `2.0.1`    | `2.0.1`   | dev     |
| `eslint-plugin-simple-import-sort` | `12.1.1` wanted `13.0.0`  | `13.0.0`  | dev     |
| `nano-staged`                      | `0.9.0` wanted `1.0.2`    | `1.0.2`   | dev     |
| `typescript`                       | `5.9.3` wanted `6.0.3`    | `6.0.3`   | dev     |
| `vite`                             | `8.0.3` wanted `8.0.5`    | `8.0.10`  | dev     |
| `@konemono/nostr-login`            | `1.15.2`                  | `1.15.7`  | runtime |
| `@tailwindcss/vite`                | `4.2.2`                   | `4.2.4`   | dev     |
| `@vitest/coverage-v8`              | `4.1.2`                   | `4.1.5`   | dev     |
| `hono`                             | `4.12.9` wanted `4.12.14` | `4.12.17` | runtime |
| `prettier`                         | `3.8.1`                   | `3.8.3`   | dev     |
| `svelte`                           | `5.55.0`                  | `5.55.5`  | dev     |
| `svelte-check`                     | `4.4.5`                   | `4.4.8`   | dev     |
| `tailwindcss`                      | `4.2.2`                   | `4.2.4`   | dev     |
| `typescript-eslint`                | `8.57.2` wanted `8.59.1`  | `8.59.2`  | dev     |
| `vitest`                           | `4.1.2`                   | `4.1.5`   | dev     |
| `@playwright/test`                 | `1.58.2`                  | `1.59.1`  | dev     |
| `@scure/base`                      | `2.0.0`                   | `2.2.0`   | runtime |
| `@sveltejs/kit`                    | `2.55.0` wanted `2.58.0`  | `2.59.1`  | dev     |
| `@sveltejs/vite-plugin-svelte`     | `7.0.0`                   | `7.1.0`   | dev     |
| `@types/node`                      | `25.5.0`                  | `25.6.0`  | dev     |
| `eslint`                           | `10.1.0`                  | `10.3.0`  | dev     |
| `eslint-plugin-svelte`             | `3.16.0`                  | `3.17.1`  | dev     |
| `globals`                          | `17.4.0`                  | `17.6.0`  | dev     |
| `wrangler`                         | `4.78.0`                  | `4.87.0`  | dev     |
| `zod`                              | `4.3.6`                   | `4.4.3`   | runtime |
| `@types/chrome`                    | `0.1.38`                  | `0.1.40`  | dev     |
| `esbuild`                          | `0.27.4`                  | `0.28.0`  | dev     |

## 更新バッチ

### 1. Lockfile / wanted 同期

まず `package.json` の wanted と lockfile current がずれている依存を同期する。ここでは `package.json` の範囲変更よりも `pnpm-lock.yaml` の解決状態を最新化することを主目的にする。

対象例:

- `@codecov/vite-plugin`
- `eslint-plugin-simple-import-sort`
- `nano-staged`
- `typescript`
- `vite`
- `hono`
- `typescript-eslint`
- `@sveltejs/kit`

この段階で失敗した場合、既に manifest が要求している範囲に lockfile が追いついていないだけなのか、transitive dependency の変化が原因なのかを分ける。

### 2. Svelte / Vite / build 系

SPA build と Svelte compiler に影響する依存をまとめる。

対象:

- `@sveltejs/kit`
- `@sveltejs/vite-plugin-svelte`
- `svelte`
- `vite`
- `@tailwindcss/vite`
- `tailwindcss`
- `esbuild`

このバッチは `pnpm run check` と `pnpm run build` を必須検証にする。`esbuild` は `build:e2e-helpers` と extension build にも影響するため、必要なら `pnpm run build:e2e-helpers` と `pnpm run build:ext:chrome` も追加する。

### 3. Test / E2E tooling 系

テストランナーと browser automation の更新をまとめる。

対象:

- `vitest`
- `@vitest/coverage-v8`
- `@playwright/test`

このバッチは `pnpm run test:packages` と代表的な app regression test を確認する。Playwright の release notes に browser binary や API の互換性変更がある場合は、`pnpm exec playwright install` の要否を確認してから e2e を実行する。

### 4. Lint / format / type tooling 系

静的解析、format、型検査の更新をまとめる。

対象:

- `eslint`
- `@eslint/js`
- `eslint-plugin-svelte`
- `eslint-plugin-simple-import-sort`
- `prettier`
- `svelte-check`
- `typescript`
- `typescript-eslint`
- `globals`
- `@types/node`
- `@types/chrome`
- `nano-staged`

このバッチは `pnpm run lint`, `pnpm run format:check`, `pnpm run check` を必須検証にする。TypeScript 6 は high-risk とし、release notes で compiler option、module resolution、DOM lib、strictness 変更を確認する。

### 5. Runtime deps

実行時挙動に影響する依存をまとめる。

対象:

- `hono`
- `zod`
- `@konemono/nostr-login`
- `@scure/base`

このバッチは API validation、Nostr auth、crypto/base encoding、observable flow に影響しうる。`pnpm run test:packages` と app regression subset を実行する。`hono` / `zod` の組み合わせは server API validation の型と runtime error shape を重点確認する。

### 6. Cloudflare / deploy tooling

Cloudflare Pages / Workers 周辺をまとめる。

対象:

- `wrangler`
- `@codecov/vite-plugin`

このバッチは `pnpm run build` を必須検証にする。`wrangler` の changelog で Pages dev、config、Node compatibility、deployment behavior の変更を確認する。preview/e2e が必要な場合は `pnpm run preview:e2e` と `pnpm run test:e2e` を組み合わせる。

## Changelog 確認方針

各 dependency について、現在版から latest までの範囲で以下を確認する。

- breaking changes
- migration notes
- peer dependency 変更
- Node / pnpm / browser support 変更
- config file syntax 変更
- default behavior 変更
- known regressions or deprecations

確認結果は実装計画または作業ログに package ごとに残す。特に以下は high-risk として個別メモを必須にする。

- `typescript`
- `vite`
- `@sveltejs/kit`
- `@sveltejs/vite-plugin-svelte`
- `svelte`
- `wrangler`
- `esbuild`
- `eslint`
- `zod`
- `hono`
- `@scure/base`
- `@konemono/nostr-login`

## 検証ゲート

各バッチ後の基本ゲート:

```bash
pnpm install
pnpm run check
```

対象別ゲート:

```bash
pnpm run lint
pnpm run format:check
pnpm run test:packages
pnpm run build
pnpm run check:auftakt-migration -- --proof
```

必要に応じて追加するゲート:

```bash
pnpm run test
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
pnpm run test:e2e
pnpm run build:e2e-helpers
pnpm run build:ext:chrome
```

最終完了ゲート:

```bash
pnpm run check:auftakt-migration -- --proof
pnpm run test:packages
pnpm run check
pnpm run build
```

UI/runtime/build に影響するバッチでは、最終前に e2e も実行する。時間や外部依存で e2e が実行できない場合は、未実行理由と代替検証を明記する。

## 失敗時の切り分け

- バッチ後に失敗したら、そのバッチを dependency 単位に分解する。
- source 修正が必要な場合は、該当 dependency の changelog に対応する最小修正に限定する。
- lint/format の差分は自動修正できる範囲に限定し、無関係な整形 churn を避ける。
- test fixture や snapshot の更新が必要な場合、依存更新による期待値変化であることを説明できる場合だけ更新する。
- 追従修正が大きくなる場合は、保留理由、影響範囲、再開条件を記録してユーザー判断に戻す。

## 完了条件

- `pnpm outdated --format table` を再実行し、今回対象の direct dependency が残っていないことを確認する。
- 各 dependency の changelog 確認結果が残っている。
- `package.json` と `pnpm-lock.yaml` が latest 更新を反映している。
- 必要な source/test 修正が最小限で入っている。
- 最終完了ゲートが通っている、または未実行ゲートについて明確な理由と代替検証が記録されている。
