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
