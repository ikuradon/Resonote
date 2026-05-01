# Auftakt Monorepo Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resonote を pnpm workspace 化し、`packages/auftakt` と `packages/auftakt-resonote` を公開可能な package 境界で追加できる基盤を作る

**Architecture:** 既存 SvelteKit app はルート直下に残したまま、workspace に `packages/auftakt` と `packages/auftakt-resonote` を追加する。`auftakt` 側は最小の公開 export とテスト実行基盤だけを先に整え、アプリ側の import/alias/test 設定を workspace package 対応に寄せる。

**Tech Stack:** pnpm workspace, TypeScript, SvelteKit, Vite, Vitest

---

## Scope Split

この spec は複数の独立サブシステムを含むため、まずは基盤だけを対象にする。次段で別 plan を切る。

- 本 plan の対象:
  - pnpm workspace 化
  - `packages/auftakt` / `packages/auftakt-resonote` の scaffold
  - TypeScript/Vite/Vitest から workspace package を参照できる状態
  - `auftakt` root export の smoke test
- 本 plan の対象外:
  - runtime/store/sync 実装
  - built-in 実装
  - Resonote preset 実装
  - `rx-nostr` 置換

## File Map

### Create

| File                                             | Responsibility                               |
| ------------------------------------------------ | -------------------------------------------- |
| `pnpm-workspace.yaml`                            | workspace package 定義                       |
| `packages/auftakt/package.json`                  | `auftakt` package metadata / exports         |
| `packages/auftakt/tsconfig.json`                 | `auftakt` package 用 TS 設定                 |
| `packages/auftakt/src/index.ts`                  | `auftakt` 公開 export                        |
| `packages/auftakt/src/core/runtime.ts`           | `createRuntime` の最小 stub                  |
| `packages/auftakt/src/core/signers/index.ts`     | signer export の最小 stub                    |
| `packages/auftakt/src/core/models/session.ts`    | `Session.open` の最小 stub                   |
| `packages/auftakt/src/core/models/user.ts`       | `User.fromPubkey` の最小 stub                |
| `packages/auftakt/src/core/models/event.ts`      | `Event.fromId` / `Event.compose` の最小 stub |
| `packages/auftakt/src/core/handles/timeline.ts`  | `Timeline.fromFilter` の最小 stub            |
| `packages/auftakt/src/core/models/nostr-link.ts` | `NostrLink.from` の最小 stub                 |
| `packages/auftakt/src/index.test.ts`             | root export smoke test                       |
| `packages/auftakt-resonote/package.json`         | Resonote preset package metadata             |
| `packages/auftakt-resonote/tsconfig.json`        | Resonote preset package 用 TS 設定           |
| `packages/auftakt-resonote/src/index.ts`         | preset package の最小 export                 |

### Modify

| File               | Responsibility                                            |
| ------------------ | --------------------------------------------------------- |
| `package.json`     | workspace scripts と local dependency 定義                |
| `tsconfig.json`    | workspace package を含めた型解決の土台                    |
| `vite.config.ts`   | package test 実行と coverage 対象を root toolchain へ接続 |
| `svelte.config.js` | 既存 alias を維持しつつ workspace package 方針を明確化    |

---

### Task 1: pnpm workspace を作成する

**Files:**

- Create: `pnpm-workspace.yaml`
- Modify: `package.json`

- [ ] **Step 1: workspace 定義の failing check を書く**

`package.json` の `scripts` に workspace 存在確認を追加する。

```json
{
  "scripts": {
    "check:workspace": "test -f pnpm-workspace.yaml"
  }
}
```

- [ ] **Step 2: check を実行して失敗を確認する**

Run: `pnpm run check:workspace`  
Expected: FAIL with `test -f pnpm-workspace.yaml`

- [ ] **Step 3: workspace 設定と root scripts を追加する**

```yaml
# pnpm-workspace.yaml
packages:
  - packages/*
```

```json
{
  "private": true,
  "scripts": {
    "check:workspace": "test -f pnpm-workspace.yaml",
    "test:packages": "vitest run packages/**/*.test.ts"
  }
}
```

- [ ] **Step 4: check を実行して通ることを確認する**

Run: `pnpm run check:workspace`  
Expected: PASS with no output

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json
git commit -m "chore: add pnpm workspace bootstrap"
```

---

### Task 2: `packages/auftakt` の最小 package 境界を作る

**Files:**

- Create: `packages/auftakt/package.json`
- Create: `packages/auftakt/tsconfig.json`
- Create: `packages/auftakt/src/index.ts`
- Create: `packages/auftakt/src/core/runtime.ts`
- Create: `packages/auftakt/src/core/signers/index.ts`
- Create: `packages/auftakt/src/core/models/session.ts`
- Create: `packages/auftakt/src/core/models/user.ts`
- Create: `packages/auftakt/src/core/models/event.ts`
- Create: `packages/auftakt/src/core/handles/timeline.ts`
- Create: `packages/auftakt/src/core/models/nostr-link.ts`
- Create: `packages/auftakt/src/index.test.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: root export smoke test を先に書く**

```ts
// packages/auftakt/src/index.test.ts
import { describe, expect, it } from 'vitest';

import {
  Event,
  NostrLink,
  Session,
  Timeline,
  User,
  createRuntime,
  nip07Signer,
  noopSigner,
  seckeySigner
} from './index.js';

describe('auftakt root exports', () => {
  it('exports the minimum public surface', () => {
    expect(typeof createRuntime).toBe('function');
    expect(typeof nip07Signer).toBe('function');
    expect(typeof seckeySigner).toBe('function');
    expect(typeof noopSigner).toBe('function');
    expect(typeof Session.open).toBe('function');
    expect(typeof User.fromPubkey).toBe('function');
    expect(typeof Event.fromId).toBe('function');
    expect(typeof Event.compose).toBe('function');
    expect(typeof Timeline.fromFilter).toBe('function');
    expect(typeof NostrLink.from).toBe('function');
  });
});
```

- [ ] **Step 2: test を実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts`  
Expected: FAIL with module not found for `./index.js`

- [ ] **Step 3: package metadata と最小実装を追加する**

```json
// packages/auftakt/package.json
{
  "name": "@ikuradon/auftakt",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

```json
// packages/auftakt/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

```ts
// packages/auftakt/src/core/runtime.ts
export function createRuntime(config: Record<string, unknown> = {}) {
  return { config };
}
```

```ts
// packages/auftakt/src/core/signers/index.ts
export function nip07Signer() {
  return { type: 'nip07' as const };
}

export function seckeySigner(secretKey = '') {
  return { type: 'seckey' as const, secretKey };
}

export function noopSigner() {
  return { type: 'noop' as const };
}
```

```ts
// packages/auftakt/src/core/models/session.ts
export class Session {
  static async open(input: Record<string, unknown> = {}) {
    return new Session(input);
  }

  constructor(readonly input: Record<string, unknown>) {}
}
```

```ts
// packages/auftakt/src/core/models/user.ts
export class User {
  static fromPubkey(pubkey: string) {
    return new User(pubkey);
  }

  constructor(readonly pubkey: string) {}
}
```

```ts
// packages/auftakt/src/core/models/event.ts
export class Event {
  static fromId(id: string) {
    return { id };
  }

  static compose<TInput>(input: TInput) {
    return input;
  }
}
```

```ts
// packages/auftakt/src/core/handles/timeline.ts
export class Timeline {
  static fromFilter(filter: Record<string, unknown>) {
    return { filter };
  }
}
```

```ts
// packages/auftakt/src/core/models/nostr-link.ts
export class NostrLink {
  static from(value: string) {
    return { value };
  }
}
```

```ts
// packages/auftakt/src/index.ts
export { createRuntime } from './core/runtime.js';
export { nip07Signer, noopSigner, seckeySigner } from './core/signers/index.js';
export { Session } from './core/models/session.js';
export { User } from './core/models/user.js';
export { Event } from './core/models/event.js';
export { Timeline } from './core/handles/timeline.js';
export { NostrLink } from './core/models/nostr-link.js';
```

```ts
// vite.config.ts
test: {
  include: ['src/**/*.test.ts', 'packages/**/*.test.ts'],
  reporters: ['default', 'junit'],
  outputFile: { junit: 'test-results/junit.xml' },
```

- [ ] **Step 4: smoke test を実行して通ることを確認する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt
git commit -m "feat: scaffold auftakt package surface"
```

---

### Task 3: `packages/auftakt-resonote` の最小 preset package を作る

**Files:**

- Create: `packages/auftakt-resonote/package.json`
- Create: `packages/auftakt-resonote/tsconfig.json`
- Create: `packages/auftakt-resonote/src/index.ts`

- [ ] **Step 1: package import の failing test を書く**

```ts
// packages/auftakt-resonote/src/index.test.ts
import { describe, expect, it } from 'vitest';

import { createResonotePreset } from './index.js';

describe('auftakt-resonote root exports', () => {
  it('exports the preset factory', () => {
    expect(typeof createResonotePreset).toBe('function');
  });
});
```

- [ ] **Step 2: test を実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts`  
Expected: FAIL with module not found for `./index.js`

- [ ] **Step 3: package metadata と最小 preset export を追加する**

```json
// packages/auftakt-resonote/package.json
{
  "name": "@ikuradon/auftakt-resonote",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@ikuradon/auftakt": "workspace:*"
  },
  "exports": {
    ".": "./src/index.ts"
  }
}
```

```json
// packages/auftakt-resonote/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

```ts
// packages/auftakt-resonote/src/index.ts
export function createResonotePreset() {
  return {
    name: 'resonote'
  };
}
```

- [ ] **Step 4: test を実行して通ることを確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt-resonote
git commit -m "feat: scaffold auftakt resonote preset package"
```

---

### Task 4: root toolchain を workspace package 対応にする

**Files:**

- Modify: `tsconfig.json`
- Modify: `svelte.config.js`

- [ ] **Step 1: package tests が走らないことを確認する failing case を作る**

既存 root toolchain が workspace package を十分に意識していない前提を、TypeScript 解決と alias 方針の面から確認する。

Run: `pnpm exec tsc -p tsconfig.json --noEmit`  
Expected: PASS だが `packages/**/*.ts` は `include` 対象外のため、workspace package を root TS 設定が明示的に抱えていない

- [ ] **Step 2: TS と alias 方針を package 前提で明記する**

```json
// tsconfig.json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "rewriteRelativeImportExtensions": true,
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  },
  "include": ["src/**/*.ts", "src/**/*.js", "packages/**/*.ts"]
}
```

```js
// svelte.config.js
kit: {
  alias: {
    $shared: 'src/shared',
    $features: 'src/features',
    $appcore: 'src/app',
    $extension: 'src/extension',
    $server: 'src/server'
  }
}
// workspace package は package 名 import を使い、Svelte alias へ混ぜない
```

- [ ] **Step 3: coverage 対象を package 対応に広げる**

```ts
// vite.config.ts
test: {
  coverage: {
    include: [
      'src/lib/**/*.ts',
      'src/features/**/*.ts',
      'src/app/**/*.ts',
      'src/shared/**/*.ts',
      'src/server/**/*.ts',
      'packages/**/*.ts'
    ];
  }
}
```

- [ ] **Step 4: root TS と package test 実行が両方通ることを確認する**

Run: `pnpm exec tsc -p tsconfig.json --noEmit && pnpm exec vitest run packages/auftakt/src/index.test.ts packages/auftakt-resonote/src/index.test.ts`  
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json vite.config.ts svelte.config.js
git commit -m "chore: wire workspace packages into root toolchain"
```

---

### Task 5: app から workspace package を参照する smoke path を作る

**Files:**

- Modify: `package.json`
- Create: `src/shared/nostr/auftakt-package-smoke.test.ts`

- [ ] **Step 1: root dependency 未解決の failing test を書く**

```ts
// src/shared/nostr/auftakt-package-smoke.test.ts
import { describe, expect, it } from 'vitest';

import { createRuntime } from '@ikuradon/auftakt';
import { createResonotePreset } from '@ikuradon/auftakt-resonote';

describe('workspace package smoke import', () => {
  it('imports workspace packages from the app test environment', () => {
    expect(typeof createRuntime).toBe('function');
    expect(createResonotePreset()).toEqual({ name: 'resonote' });
  });
});
```

- [ ] **Step 2: test を実行して失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-package-smoke.test.ts`  
Expected: FAIL with cannot resolve `@ikuradon/auftakt`

- [ ] **Step 3: root package.json に workspace devDependency を追加する**

```json
{
  "devDependencies": {
    "@ikuradon/auftakt": "workspace:*",
    "@ikuradon/auftakt-resonote": "workspace:*"
  }
}
```

- [ ] **Step 4: smoke test を実行して通ることを確認する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-package-smoke.test.ts`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add package.json src/shared/nostr/auftakt-package-smoke.test.ts
git commit -m "test: verify app can import auftakt workspace packages"
```

---

## Self-Review

### Spec coverage

- package 境界の確立: Task 1-3 で対応
- app は root に残す: Task 4-5 で対応
- `packages/auftakt` を公開可能な package として成立: Task 2 で対応
- `packages/auftakt-resonote` を preset package として分離: Task 3 で対応
- toolchain を workspace package 対応にする: Task 4-5 で対応

### Placeholder scan

- `TODO` / `TBD` なし
- 各 task に具体的 file path / command / code block あり
- 後続 plan が必要な箇所は scope split に限定し、本 plan 内へ未定義参照を残していない

### Type consistency

- package 名は `@ikuradon/auftakt` / `@ikuradon/auftakt-resonote` で統一
- root export 名は `createRuntime`, `nip07Signer`, `seckeySigner`, `noopSigner`, `Session`, `User`, `Event`, `Timeline`, `NostrLink` で統一
- preset factory 名は `createResonotePreset` で統一
