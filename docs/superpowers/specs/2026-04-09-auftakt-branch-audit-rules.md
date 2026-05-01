# Auftakt Branch Audit Rules

- `feat/auftakt-foundation` と `feat/auftakt-migration` は、どちらも正常挙動ではない前提で扱う
- branch 単位の revive、cherry-pick、実装の正当化材料としての再利用は行わない
- 現行の正は [specs.md](/root/src/github.com/ikuradon/Resonote/docs/auftakt/specs.md) とし、過去ブランチは監査対象としてのみ参照する
- 各ファイルは `採用 / 参考再実装 / 破棄` のいずれかに分類する
- `採用` はテストまたは小さく独立した純ロジックに限定する
- `参考再実装` はアルゴリズムや分割方針のみ参考にし、コードは現行 package 構成で新規実装する
- `破棄` は現行仕様と矛盾する、または異常挙動の原因になりやすいものを指す
- 監査結果は `foundation` と `migration` を別管理し、最後に共通の回収順序へ統合する
