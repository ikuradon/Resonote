# Release Readiness: Pre-v0.1.0 Quality & Security Improvements

**Date**: 2026-03-28
**Status**: Approved
**Scope**: 7 independent PRs addressing quality, security, and test coverage

## Overview

リリース前監査で発見された問題を7つの独立した PR で修正する。
各 PR は個別の GitHub issue に紐づく。

## P1-1: Silent Error Logging

**Issue**: `.catch(() => {})` パターンが13箇所以上。エラーが握りつぶされ、障害時のデバッグが困難。

**Branch**: `fix/silent-error-logging`

**修正方針**:

- `.catch(() => {})` を `.catch((e) => logger.error('...', e))` に置換
- `createLogger(moduleName)` (`src/shared/utils/logger.ts`) を使用
- prod 環境では `warn` 以上のみ出力 (既存の `MIN_LEVEL` 設定)
- トースト通知は追加しない (バックグラウンド処理が大半)

**対象ファイル**:

- `src/app/bootstrap/init-app.ts`
- `src/features/content-resolution/application/resolve-feed.ts`
- `src/features/content-resolution/application/resolve-content.ts`
- `src/features/comments/ui/quote-view-model.svelte.ts`
- `src/extension/background.ts`
- `src/extension/content-scripts/resonote-bridge.ts`
- `src/shared/nostr/client.ts`
- `src/shared/browser/profile.svelte.ts`
- その他 `.catch(() => {})` が見つかる全箇所

**テスト**: 既存テストがパスすることを確認。ログ出力自体のテストは追加しない。

---

## P1-2: NIP-22/NIP-25 Relay Hints

**Issue**: #157 (既存)

**Branch**: `feat/relay-hints`

**現状**:

- `buildComment`: `['e', id, '', pubkey]` — relay hint 空文字
- `buildComment`: `['p', pubkey]` — relay hint なし
- `buildReaction`: `['e', id]`, `['p', pubkey]` — relay hint なし

**修正方針**:

- `buildComment` / `buildReaction` に `relayHint?: string` パラメータを追加
- e-tag: `['e', id, relayHint ?? '', pubkey]`
- p-tag: `['p', pubkey, relayHint ?? '']`
- relay hint の取得元: イベント取得時の relay URL (`rx-nostr` の `packet.from`)
- 呼び出し元 (comment-view-model, reaction 処理) で取得元 relay を保持して渡す

**テスト**: `events.test.ts` に relay hint ありなしのテストケースを追加。

---

## P1-3: svelte-check Warnings

**Issue**: 新規作成

**Branch**: `fix/svelte-check-warnings`

**QuoteCard.svelte:13** — `state_referenced_locally` on `eventId`:

```typescript
// Before
const vm = createQuoteViewModel(eventId);
// After
const vm = $derived(createQuoteViewModel(eventId));
```

**UserAvatar.svelte:16** — `state_referenced_locally` on `prevPicture`:

```typescript
// Before
let prevPicture = $state(picture);
$effect(() => {
  if (picture !== prevPicture) {
    prevPicture = picture;
    imgError = false;
  }
});

// After: $effect で picture を直接追跡、変更時に imgError リセット
let imgError = $state(false);
$effect(() => {
  picture;
  imgError = false;
});
```

**テスト**: 既存 E2E / unit テストでリグレッション確認。新規テスト不要。

---

## P2-1: RSS/Podcast XSS Sanitization

**Issue**: 新規作成

**Branch**: `fix/podcast-xss-sanitize`

**現状の問題**:

- `title` フィールドが `extractTagContent` の生出力のまま使用 (HTML タグ混入の可能性)
- `imageUrl` / `enclosureUrl` に URL スキーム検証なし

**修正方針**:

| フィールド     | 対策                                                                |
| -------------- | ------------------------------------------------------------------- |
| `title`        | `stripHtmlTags()` 関数を追加 (タグ除去 + entity デコード)           |
| `description`  | 変更なし (`htmlToMarkdown` → `renderMarkdown` で既にサニタイズ済み) |
| `imageUrl`     | `sanitizeImageUrl()` を適用 (http/https のみ許可)                   |
| `enclosureUrl` | `sanitizeImageUrl()` を適用                                         |

**`stripHtmlTags` 関数** (`src/shared/utils/html.ts` に追加):

- HTML タグを除去
- HTML エンティティをデコード
- `htmlToMarkdown` と違い Markdown 変換は行わない (title は plain text)

**テスト**: `podcast.test.ts` に XSS ペイロード入り RSS のテストケースを追加。

---

## P2-2: API Rate Limiting

**Issue**: 新規作成

**Branch**: `feat/api-rate-limit`

**設計**:

- `src/server/api/middleware/rate-limit.ts` に Hono ミドルウェアを新規作成
- IP ベース in-memory カウンター (`Map<string, { count: number; resetAt: number }>`)
- デフォルト: 60秒 window / 30リクエスト上限
- IP 取得: `cf-connecting-ip` → fallback `x-forwarded-for`
- 制限超過: `429 Too Many Requests` + `Retry-After` ヘッダー
- `app.ts` で `base.use(rateLimitMiddleware())` として全 `/api/*` に適用
- `/api/system/pubkey` も含む (全エンドポイント統一、30req/min で実用上問題なし)

**クライアント影響**: 既存の `!res.ok` ハンドリングで処理される (特別な 429 対応は不要)

**制約**: Workers は stateless のためインスタンス間共有なし (ベストエフォート)

**別 issue**: Cloudflare ネイティブ Rate Limiting 移行を future improvement として作成

**テスト**: `rate-limit.test.ts` で window 内連続リクエストの 429 レスポンスを検証。

---

## P2-3: CHANGELOG.md

**Issue**: 新規作成

**Branch**: `docs/changelog`

**形式**: [Keep a Changelog](https://keepachangelog.com/)

**内容**: v0.1.0 の主要変更を git log から抽出して記載。

**運用ルール**: PR マージ時に `[Unreleased]` を更新。タグ切り時にバージョン番号付与。

---

## P3-7: Test Coverage Improvements

**Issue**: 新規作成

**Branch**: `test/coverage-improvements`

**分析結果** (0% カバレッジ 32 ファイル):

- Re-export / facade: 24 ファイル → テスト不要
- Type-only: 5 ファイル → テスト不要
- Testable logic: 1 ファイル → テスト追加

**修正**:

1. `comment-profile-preload.svelte.ts` のユニットテストを追加
   - pubkey 抽出、dedup、fetchProfiles 呼び出しの検証
2. vitest 設定で re-export / facade / type-only ファイルを coverage 除外
   - `coveragePathIgnorePatterns` に該当パスを追加

---

## PR 一覧

| #    | Branch                       | Issue | 依存 |
| ---- | ---------------------------- | ----- | ---- |
| P1-1 | `fix/silent-error-logging`   | 新規  | なし |
| P1-2 | `feat/relay-hints`           | #157  | なし |
| P1-3 | `fix/svelte-check-warnings`  | 新規  | なし |
| P2-1 | `fix/podcast-xss-sanitize`   | 新規  | なし |
| P2-2 | `feat/api-rate-limit`        | 新規  | なし |
| P2-3 | `docs/changelog`             | 新規  | なし |
| P3-7 | `test/coverage-improvements` | 新規  | なし |

全 PR は独立。並行作業可能。
