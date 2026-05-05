# pnpm outdated Update Design

## 背景

`pnpm outdated --format table` の結果、root `package.json` と `pnpm-lock.yaml` の wanted/current に差分がある依存と、target resolution まで未更新の direct dependency が複数ある。今回の目的は、2026-05-05 時点の `pnpm outdated` snapshot に出た direct dependency を target resolution へ更新すること。ただし、SvelteKit/Vite/TypeScript/Wrangler/esbuild など build・typecheck・runtime に影響しやすい依存が含まれるため、changelog 確認と検証を省略しない。

この作業は依存更新であり、依存更新と無関係な refactor ではない。更新は `package.json` と `pnpm-lock.yaml` の変更を中心に行い、breaking change への追従が必要な場合だけ最小限の source/test 修正を行う。

## Goals

- 2026-05-05 時点の `pnpm outdated` に表示された direct dependency を、本 spec の target resolution まで更新する。
- 各 dependency について、現在版から target resolution までの changelog/release notes を確認する。
- 作業開始時に target resolution、Node/pnpm version、baseline gate を記録する。
- 更新はリスク別バッチに分け、各バッチ後に検証する。
- 失敗時に原因 package を切り分けられる進め方にする。
- 最終的に project の主要 gate と frozen lockfile install を通す。

## Non-Goals

- 依存更新と無関係な refactor は行わない。
- deprecated API 置換が大規模になる場合、無理に同一バッチで完了しない。
- 今回の直接更新対象は、2026-05-05 時点の `pnpm outdated` に表示された direct dependency に限定する。
- transitive dependency は pnpm resolution の結果として変わる場合のみ許容し、追加の direct dependency 更新は行わない。
- package manager、workspace 構成自体は変更しない。
- Node engine 更新は行わない。現在の repo は `package.json` と GitHub Actions が Node 24 前提のため、`vite@8` と `wrangler@4.87.0` の engine 要件を満たす前提で進める。

## Preflight / Target resolution 固定

依存更新前に以下を実行し、作業ログへ記録する。

```bash
node --version
pnpm --version
pnpm config get save-exact
pnpm config get save-prefix
pnpm outdated --format json
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:packages
pnpm run build
```

作業ログは `logs/` に保存する。少なくとも以下を残す。

```bash
mkdir -p logs
pnpm outdated --format json > logs/pnpm-outdated-2026-05-05.json
node --version > logs/node-version.txt
pnpm --version > logs/pnpm-version.txt
pnpm list --depth 0 > logs/pnpm-list-depth-0.txt
```

`pnpm outdated --format json` の結果を作業開始時の snapshot とし、今回の target resolution は本 spec の表に固定する。更新コマンドでは `package@latest` ではなく `package@<target version>` を指定する。

例:

```bash
pnpm add -w -D typescript@6.0.3 vite@8.0.10
pnpm add -w hono@4.12.17 zod@4.4.3
```

root `package.json` の direct dependency を更新する場合は `-w` を使う。特定 workspace package の dependency を更新する場合は `-w` ではなく `--filter <workspace-package>` を使う。

作業中に npm の `latest` がさらに進んだ場合、その差分は今回 scope 外として記録し、別更新として扱う。

Node gate は明示的に確認する。Vite 8 は Node.js `20.19+` または `22.12+` を要求し、Wrangler 4.87.0 は Node.js `<22` を hard fail する。Resonote は `package.json` で `node >=24.0.0`、GitHub Actions で Node 24 を使っているため、現状では Node engine 更新は不要。ただし local 実行環境が Node 24 でない場合は作業開始前に止める。

## Manifest version policy

本 spec の `Target resolution` は、少なくとも `pnpm-lock.yaml` の direct dependency resolution が一致することを意味する。`package.json` の version range は repo の既存 policy に従い、既存の caret range を維持する。exact pinning はこの作業の scope に含めない。

`pnpm add -w package@<target version>` によって `package.json` の range が変わる場合は、`pnpm config get save-prefix` の結果に従う。`--save-exact` は使わない。完了判定は `package.json` が exact version になっていることではなく、`package.json` の range が target resolution を許容し、`pnpm-lock.yaml` と `pnpm list --depth 0` が target resolution に一致することを基準にする。

## Upstream references

この spec で前提にした upstream 情報は以下。

- TypeScript 6.0 release notes: deprecated syntax/options と `tsc file.ts` behavior を確認する。
- Vite 8 announcement / migration guide / changelog: Rolldown 統合、Node engine、migration guidance を確認する。
- Cloudflare Workers SDK releases: `wrangler@4.87.0` の Node engine hard fail を確認する。
- Codecov Vite quick start: `@codecov/vite-plugin` が Vite build plugin であり、`CODECOV_TOKEN` と telemetry option を持つことを確認する。
- Playwright release notes: browser binary、cache、CLI/API 変更を確認する。
- Hono / Zod / esbuild release notes: runtime validation、security fix、0.x minor behavior change を確認する。

## 現在の更新対象

2026-05-05 時点の `pnpm outdated --format table` で確認した対象は次の通り。`Target resolution` は今回固定する direct dependency resolution であり、作業中に npm の `latest` が動いても変更しない。

| Package                            | Current  | Wanted    | Target resolution | 区分    | Risk | Batch |
| ---------------------------------- | -------- | --------- | ----------------- | ------- | ---- | ----- |
| `@codecov/vite-plugin`             | `1.9.1`  | `2.0.1`   | `2.0.1`           | dev     | high | 7     |
| `eslint-plugin-simple-import-sort` | `12.1.1` | `13.0.0`  | `13.0.0`          | dev     | med  | 5     |
| `nano-staged`                      | `0.9.0`  | `1.0.2`   | `1.0.2`           | dev     | med  | 5     |
| `typescript`                       | `5.9.3`  | `6.0.3`   | `6.0.3`           | dev     | high | 2     |
| `vite`                             | `8.0.3`  | `8.0.5`   | `8.0.10`          | dev     | high | 3     |
| `@konemono/nostr-login`            | `1.15.2` | `1.15.2`  | `1.15.7`          | runtime | high | 6     |
| `@tailwindcss/vite`                | `4.2.2`  | `4.2.2`   | `4.2.4`           | dev     | med  | 3     |
| `@vitest/coverage-v8`              | `4.1.2`  | `4.1.2`   | `4.1.5`           | dev     | med  | 4     |
| `hono`                             | `4.12.9` | `4.12.14` | `4.12.17`         | runtime | high | 6     |
| `prettier`                         | `3.8.1`  | `3.8.1`   | `3.8.3`           | dev     | low  | 5     |
| `svelte`                           | `5.55.0` | `5.55.0`  | `5.55.5`          | dev     | high | 3     |
| `svelte-check`                     | `4.4.5`  | `4.4.5`   | `4.4.8`           | dev     | med  | 2     |
| `tailwindcss`                      | `4.2.2`  | `4.2.2`   | `4.2.4`           | dev     | med  | 3     |
| `typescript-eslint`                | `8.57.2` | `8.59.1`  | `8.59.2`          | dev     | high | 2     |
| `vitest`                           | `4.1.2`  | `4.1.2`   | `4.1.5`           | dev     | med  | 4     |
| `@playwright/test`                 | `1.58.2` | `1.58.2`  | `1.59.1`          | dev     | med  | 4     |
| `@scure/base`                      | `2.0.0`  | `2.0.0`   | `2.2.0`           | runtime | high | 6     |
| `@sveltejs/kit`                    | `2.55.0` | `2.58.0`  | `2.59.1`          | dev     | high | 3     |
| `@sveltejs/vite-plugin-svelte`     | `7.0.0`  | `7.0.0`   | `7.1.0`           | dev     | high | 3     |
| `@types/node`                      | `25.5.0` | `25.5.0`  | `25.6.0`          | dev     | low  | 2     |
| `eslint`                           | `10.1.0` | `10.1.0`  | `10.3.0`          | dev     | med  | 5     |
| `eslint-plugin-svelte`             | `3.16.0` | `3.16.0`  | `3.17.1`          | dev     | med  | 5     |
| `globals`                          | `17.4.0` | `17.4.0`  | `17.6.0`          | dev     | low  | 5     |
| `wrangler`                         | `4.78.0` | `4.78.0`  | `4.87.0`          | dev     | high | 7     |
| `zod`                              | `4.3.6`  | `4.3.6`   | `4.4.3`           | runtime | high | 6     |
| `@types/chrome`                    | `0.1.38` | `0.1.38`  | `0.1.40`          | dev     | low  | 2     |
| `esbuild`                          | `0.27.4` | `0.27.4`  | `0.28.0`          | dev     | high | 3     |

`@eslint/js` は direct dependency だが、2026-05-05 の `pnpm outdated` 結果には出ていない。直接更新対象には含めず、`eslint` 更新時の config/peer compatibility 確認対象として扱う。

## 更新バッチ

### 0. Preflight / baseline

作業開始前に clean working tree、Node/pnpm version、target snapshot、baseline gate を確認する。baseline gate が失敗する場合、依存更新前から壊れているため、更新作業に入らず失敗内容を記録してユーザー判断に戻す。

### 1. Wanted/current audit

この段階では依存更新を実行しない。`pnpm outdated` の wanted/current 差分を確認し、該当 package を後続の専門 batch に割り当てる。

Audit 対象:

- `@codecov/vite-plugin`
- `eslint-plugin-simple-import-sort`
- `nano-staged`
- `typescript`
- `vite`
- `hono`
- `typescript-eslint`
- `@sveltejs/kit`

wanted/current 差分がある package については、`current`、`wanted`、`target resolution`、`package.json` の range、lockfile が古いだけか major/minor boundary を跨ぐか、実際に更新する batch を作業ログに記録する。実際の version 更新は Batch 2 以降で target resolution まで一度に行う。

### 2. TypeScript / type tooling

TypeScript と型検査に影響する依存をまとめる。

対象:

- `typescript`
- `typescript-eslint`
- `svelte-check`
- `@types/node`
- `@types/chrome`

TypeScript 6 は high-risk とし、deprecated option、`import ... asserts` から import attributes への移行、`tsc file.ts` 実行時の扱い、compiler option、module resolution、DOM lib、strictness 変更を確認する。更新前に以下を grep し、該当があれば今回直すか別 issue に切るかを作業ログに残す。`ignoreDeprecations: "6.0"` で握りつぶすだけの対応は避ける。

```bash
rg "tsc .*\\.(ts|tsx)" package.json .github scripts packages
rg "importsNotUsedAsValues|preserveValueImports|suppressImplicitAnyIndexErrors|keyofStringsOnly|moduleResolution.*node|target.*es5|no-default-lib|outFile|asserts? \\{\\s*type" .
```

検証は `pnpm run check`, `pnpm run lint`, `pnpm run test:packages` を必須にする。

### 3. Svelte / Vite / build stack

SPA build、Svelte compiler、Vite plugin、direct build script に影響する依存をまとめる。

対象:

- `vite`
- `@sveltejs/kit`
- `@sveltejs/vite-plugin-svelte`
- `svelte`
- `@tailwindcss/vite`
- `tailwindcss`
- `esbuild`

この repo は既に `vite@8.0.3` を使っているため、本 batch の直接更新範囲は `8.0.3` -> `8.0.10` とする。ただし Vite 8 migration に起因する未解消の差分が残っている可能性があるため、Rolldown/Oxc、production build、chunking、CSS minification、plugin hooks、`rollupOptions` / `esbuild` config の確認は維持する。失敗時は Vite/SvelteKit/Svelte/esbuild を個別に切り分ける。

`esbuild` は Vite 内部用途と direct script 用途を混同しやすい。更新前に以下を確認する。

```bash
pnpm why esbuild
```

このバッチは `pnpm run check`, `pnpm run build`, `pnpm run build:e2e-helpers`, `pnpm run build:ext:chrome` を検証対象にする。

### 4. Test / E2E tooling

テストランナーと browser automation の更新をまとめる。

対象:

- `vitest`
- `@vitest/coverage-v8`
- `@playwright/test`

Vitest と coverage provider は同一 batch に維持する。Playwright は browser binary / cache の影響を受けるため、以下を確認する。

```bash
pnpm exec playwright --version
pnpm exec playwright install --with-deps
pnpm run test:e2e
```

CI で browser cache を使っている場合、cache key に `@playwright/test` version が含まれているか確認する。Playwright config が Chromium だけを使う場合は、CI 時間と cache size を抑えるため `pnpm exec playwright install --with-deps chromium` に置き換えてよい。local で `install --with-deps` が権限や platform の都合で実行できない場合は、理由と代替検証を記録する。

### 5. Lint / format tooling

静的解析、format、pre-commit tooling の更新をまとめる。

対象:

- `eslint`
- `eslint-plugin-svelte`
- `eslint-plugin-simple-import-sort`
- `prettier`
- `globals`
- `nano-staged`

`@eslint/js` は direct update 対象ではないが、`eslint` 更新時の config compatibility として確認する。このバッチは `pnpm run lint`, `pnpm run format:check`, `pnpm run check` を必須検証にする。自動修正を使う場合は、依存更新に必要な差分だけに限定し、無関係な整形 churn を避ける。

### 6. Runtime deps

実行時挙動に影響する依存をまとめる。

対象:

- `hono`
- `zod`
- `@konemono/nostr-login`
- `@scure/base`

重点確認:

- `hono`: route matching、middleware order、error response shape、validation failure response、Cloudflare Workers runtime での request/response behavior、`hono/jsx` 利用有無。
- `zod`: optional field、default/catch、preprocess/transform、API error object shape。
- `@scure/base`: hex/base64/base32/bech32 など project で使う encoding の golden vector、invalid input、whitespace / padding / casing の扱い。
- `@konemono/nostr-login`: login、logout、reconnect、relay selection、extension/browser login flow、CSP 上の `'unsafe-eval'` 必要性。

Release notes が薄い runtime dependency では、必ず npm diff または GitHub compare を確認する。

```bash
npm diff @scure/base@2.0.0 @scure/base@2.2.0
npm diff @konemono/nostr-login@1.15.2 @konemono/nostr-login@1.15.7
```

確認対象は exported API、import path、ESM/CJS packaging、browser bundle、crypto / encoding behavior、transitive dependency changes とする。

このバッチは `pnpm run test:packages` と `pnpm run test:auftakt:app-regression` を検証対象にする。server API validation に触れる source 修正が出た場合は、対象 route の unit test または integration test を追加・更新する。

### 7. Cloudflare / CI analytics

Cloudflare Pages / Workers tooling と Vite build analytics を扱う。`wrangler` は Node engine と preview/deploy behavior への影響が大きいため、可能なら `@codecov/vite-plugin` と分けて単独 batch にする。

対象:

- `wrangler`
- `@codecov/vite-plugin`

`wrangler` は Node.js `<22` を hard fail する。Resonote は Node 24 前提のため target と矛盾しないが、local/CI の `node --version`、`pnpm run dev:full`、`pnpm run preview:e2e`、Cloudflare Pages preview behavior を重点確認する。

`@codecov/vite-plugin` は Wrangler ではなく Vite build plugin / CI analytics として扱う。`vite.config.ts` の plugin 配列、`CODECOV_TOKEN` がない local build、token がある CI build、telemetry option の project policy を確認する。local では token なしで `pnpm run build` が通ることを必須にする。

## Changelog 確認方針

各 dependency について、現在版から target resolution までの範囲で以下を確認する。

- breaking changes
- migration notes
- peer dependency 変更
- engine 変更
- Node / pnpm / browser support 変更
- config file syntax 変更
- default behavior 変更
- known regressions or deprecations

確認結果は作業ログに package ごとに残す。GitHub releases が薄い package では、GitHub compare、npm diff、package README の changelog を代替ソースにする。

Changelog review log template:

```md
### package-name

- Update: `x.y.z` -> `a.b.c`
- Sources:
  - release notes:
  - changelog:
  - npm:
- Version range reviewed: `x.y.z...a.b.c`
- Breaking changes: none / yes
- Peer dependency changes: none / yes
- Engine changes: none / yes
- Config/default behavior changes: none / yes
- Project impact: none / source fix required / test fix required
- Verification:
  - commands:
  - result:
- Notes:
```

High-risk package は個別メモを必須にする。

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
- `@codecov/vite-plugin`

## Peer / engine warning 確認

作業前に pnpm version を確認する。

```bash
pnpm --version
```

pnpm 11 以上の場合は、lockfile から peer dependency の未解決・非互換を確認する。

```bash
pnpm peers check
```

pnpm 10 以下、または `pnpm peers check` が使えない場合は、install output と top-level 解決状態を保存する。

```bash
pnpm install 2>&1 | tee logs/pnpm-install.log
pnpm list --depth 0
```

`pnpm explain peer-requirements` は、使用中の pnpm version で command が存在することを確認できた場合のみ補助的に使う。peer warning と engine warning は作業ログに残す。特に以下の組み合わせは peer/config compatibility を確認する。

- `vite` / `@sveltejs/vite-plugin-svelte` / `@sveltejs/kit`
- `typescript` / `typescript-eslint` / `svelte-check`
- `vitest` / `@vitest/coverage-v8`
- `eslint` / `@eslint/js` / plugin 群
- `tailwindcss` / `@tailwindcss/vite`

## 検証ゲート

各バッチ後の基本ゲート:

```bash
pnpm install
pnpm peers check # pnpm 11+ only; pnpm 10 では install log を保存
pnpm list --depth 0
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
pnpm exec playwright --version
pnpm exec playwright install --with-deps
pnpm exec playwright install --with-deps chromium
pnpm why esbuild
```

最終完了ゲート:

```bash
pnpm install --frozen-lockfile
pnpm run check:auftakt-migration -- --proof
pnpm run lint
pnpm run format:check
pnpm run test:packages
pnpm run check
pnpm run build
pnpm run test:auftakt:e2e
```

UI/runtime/build に影響するバッチでは、最終前に e2e も実行する。時間や外部依存で e2e が実行できない場合は、未実行理由と代替検証を明記する。

## 失敗時の切り分け

- バッチ後に失敗したら、そのバッチを dependency 単位に分解する。
- `wrangler`, `typescript`, `vite`, `@sveltejs/kit`, `esbuild` は失敗原因が混ざりやすいため、必要なら単独 batch に切り出す。
- source 修正が必要な場合は、該当 dependency の changelog に対応する最小修正に限定する。
- lint/format の差分は自動修正できる範囲に限定し、無関係な整形 churn を避ける。
- test fixture や snapshot の更新が必要な場合、依存更新による期待値変化であることを説明できる場合だけ更新する。
- 追従修正が大きくなる場合は、保留理由、影響範囲、再開条件を記録してユーザー判断に戻す。

## 完了条件

- `pnpm outdated --format table` が空であることは完了条件にしない。
- 完了判定は、本 spec の target resolution table と `pnpm list --depth 0` / `pnpm-lock.yaml` の direct dependency resolution が一致することを基準にする。
- 作業中に npm の `latest` が進んで `pnpm outdated` に再表示された package は、今回 scope 外として記録する。
- 各 dependency の changelog 確認結果が残っている。
- pnpm version に応じた peer check 結果または install log と、`pnpm list --depth 0` の確認結果が残っている。
- `package.json` と `pnpm-lock.yaml` が target resolution への更新を反映している。
- 必要な source/test 修正が最小限で入っている。
- `pnpm install --frozen-lockfile` と最終完了ゲートが通っている、または未実行ゲートについて明確な理由と代替検証が記録されている。
