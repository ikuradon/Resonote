# SoundCloud Sets（プレイリスト）埋め込み対応

## 概要

SoundCloud の Sets（プレイリスト）URL をコンテンツとして認識し、埋め込み再生できるようにする。Widget API の Sets 固有機能（トラック一覧、ナビゲーション等）は含まない。

## 変更箇所

### 1. ContentProvider (`src/shared/content/soundcloud.ts`)

- `parseUrl()` で `/sets/` パスを認識し `{ platform: 'soundcloud', type: 'set', id: '{user}/sets/{name}' }` を返す
- 現在 `/sets/` を除外しているロジックを反転
- `toNostrTag()` で `soundcloud:set:{user}/sets/{name}` を返す
- `contentKind()` で `soundcloud:set` を返す

### 2. SoundCloudEmbed.svelte

- `contentId.type === 'set'` のとき iframe 高さを拡大（トラック: 166px → Sets: 450px）
- oEmbed 解決の流れは既存と同じ（サーバー側は `set` タイプ対応済み）

### 3. サーバー側

- `src/server/api/oembed.ts` の PLATFORMS 設定は既に `validTypes: new Set(['track', 'set'])` を含んでいるため変更なし

## テスト

- `soundcloud.ts` の既存テストに Sets URL のパースケースを追加
- E2E は既存の SoundCloud テストパターンに Sets URL を追加

## 非スコープ

- Widget API の Sets 固有メソッド（`getSounds`, `getCurrentSound`, `skip`）
- トラック変更検出
- Sets 内の特定トラックへのコメントスコープ
