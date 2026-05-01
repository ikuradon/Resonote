# Audio Player Overhaul: Video Detection + Visualizer

## Summary

MediaEmbed を改修し、動画 Podcast 対応、フィード画像フォールバック、3種類のビジュアライゼーション（オフ/バー/MilkDrop）を追加する。

## Scope

### 1. 動画判定 + フォールバック

- enclosure を `<video>` 要素で読み込む（`<audio>` から変更）
- `loadedmetadata` イベントで `videoWidth > 0` を判定
- **映像あり**: `<video>` をそのまま表示（コントロール付き）
- **映像なし**: 画像の優先順位で表示:
  1. メディアファイル埋め込みジャケット（ID3 APIC — 既に `audio-metadata.ts` で取得済み）
  2. フィード画像（RSS `<itunes:image>`）
  3. Resonote ロゴ（`/icon-192.png`）を暗めに表示
- enclosure の MIME type (`type` 属性) を RSS パーサで取得し、メタデータとして渡す（将来の最適化用）

### 2. ビジュアライゼーション: バーグラフ

- Web Audio API `AnalyserNode` で周波数データ取得
- Canvas にバーアニメーション描画（フィード画像/ロゴの上にオーバーレイ）
- 再生中のみ描画、一時停止で停止

### 3. ビジュアライゼーション: MilkDrop

- [Butterchurn](https://github.com/jberg/butterchurn) ライブラリ使用
- WebGL Canvas にプリセットベースのサイケデリックビジュアライゼーション
- プリセットはランダム選択（butterchurn-presets から）
- 動的 import で遅延読み込み（バンドルサイズ対策）

### 4. FPS 自動判定

- デフォルト ON
- `requestAnimationFrame` で直近10フレームの平均 FPS を計測
- FPS が 20 以下に落ちたら自動 OFF（Canvas 描画停止）
- `prefers-reduced-motion: reduce` は即 OFF
- ユーザーが設定画面で明示的に ON にした場合は FPS 自動 OFF を無効化

### 5. 設定画面

- 設定ページに「ビジュアライゼーション」セクション追加
- 選択肢: `オフ` / `バー` / `MilkDrop`
- デフォルト: `バー`
- `localStorage` に保存
- 設定画面以外にもプレイヤー上にトグルボタン配置

## Architecture

### New Files

| File                                                | Responsibility                                           |
| --------------------------------------------------- | -------------------------------------------------------- |
| `src/shared/browser/visualizer.svelte.ts`           | ビジュアライザ状態管理（種類選択、FPS 監視、auto-off）   |
| `src/lib/components/VisualizerBar.svelte`           | バーグラフ Canvas コンポーネント                         |
| `src/lib/components/VisualizerMilkdrop.svelte`      | MilkDrop WebGL コンポーネント（butterchurn 動的 import） |
| `src/web/routes/settings/VisualizerSettings.svelte` | 設定 UI                                                  |

### Modified Files

| File                                                                                       | Change                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `src/lib/components/AudioEmbed.svelte` → `MediaEmbed.svelte`                               | rename + `<audio>` → `<video>`, 動画判定, ビジュアライザ統合 |
| `src/lib/components/audio-embed-view-model.svelte.ts` → `media-embed-view-model.svelte.ts` | rename + `<video>` バインド, `hasVideo` 判定                 |
| `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`                                | AudioEmbed → MediaEmbed import 変更                          |
| `functions/api/podcast/resolve.ts`                                                         | enclosure `type` 属性取得                                    |
| `src/features/content-resolution/domain/resolution-result.ts`                              | `EpisodeMetadata.mimeType` 追加                              |
| `src/web/routes/settings/+page.svelte`                                                     | VisualizerSettings セクション追加                            |
| `src/shared/i18n/*.json`                                                                   | ビジュアライザ設定 i18n キー                                 |

### Dependencies

- `butterchurn`: MilkDrop エミュレータ（動的 import）
- `butterchurn-presets`: プリセットパック（動的 import）

## Data Flow

```
RSS enclosure → type attr → mimeType in metadata
MediaEmbed:
  <video> loadedmetadata → videoWidth > 0?
    Yes → show <video>
    No  → show artwork (ID3 APIC > feedImage > Resonote logo) + visualizer overlay

Web Audio API:
  <video> element → MediaElementSource → AnalyserNode → visualizer
```

## Visualizer State

```typescript
type VisualizerMode = 'off' | 'bar' | 'milkdrop';

interface VisualizerState {
  mode: VisualizerMode; // user preference (localStorage)
  effectiveMode: VisualizerMode; // actual mode after FPS check
  userExplicit: boolean; // user explicitly chose mode in settings
  fps: number; // current measured FPS
}
```

- `effectiveMode` = `mode` unless FPS < 20 and `!userExplicit`
- `prefers-reduced-motion: reduce` → `effectiveMode = 'off'` regardless

## Testing

### Unit Tests

- `visualizer.svelte.ts`: モード切替、FPS 閾値、prefers-reduced-motion、localStorage 保存/復元
- `media-embed-view-model`: hasVideo 判定

### E2E Tests

- 設定画面でビジュアライザモード変更
- MediaEmbed でフィード画像/ロゴ表示

## i18n

- `visualizer.title`: ビジュアライゼーション
- `visualizer.off`: オフ
- `visualizer.bar`: バー
- `visualizer.milkdrop`: MilkDrop
- `visualizer.description`: 再生中のビジュアルエフェクト
