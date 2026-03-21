## 関連 Issue

closes #

## 概要

<!-- 変更内容を簡潔に説明してください -->

## 変更内容

<!-- 主な変更点を箇条書きで -->

-

## 配置判断

<!-- 新規コードをどこへ置いたか、なぜそこに置いたか -->

- [ ] `src/lib/*` に新しい runtime ownership を追加していない
- [ ] `README.md` の「新機能の配置ガイド」に沿って配置した
- [ ] 構造変更がある場合、import graph を確認した
- [ ] UI / bundle 影響がある場合、bundle profile を確認した

## テスト

<!-- 動作確認した内容 -->

- [ ] `pnpm format:check` 通過
- [ ] `pnpm lint` 通過
- [ ] `pnpm check` 通過
- [ ] `pnpm test` 通過
- [ ] `pnpm check:structure` 通過
- [ ] `pnpm graph:imports:summary` 確認
- [ ] `pnpm perf:bundle:summary` 確認 (UI / bundle 変更時)
- [ ] `pnpm test:e2e` 通過

## スクリーンショット

<!-- UI変更がある場合のみ -->
