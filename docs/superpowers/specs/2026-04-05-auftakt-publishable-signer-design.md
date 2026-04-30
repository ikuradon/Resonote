# auftakt Publishable + Signer 補完パススルー設計

**日付**: 2026-04-05
**ステータス**: 承認済み
**スコープ**: auftakt の send/cast が pre-signed event を再署名せずに送信できるようにする + rx-nostr 依存除去

## 背景

### 現状の問題

1. `session.send()` / `session.cast()` は `Draft` (`{ kind, content, tags }`) のみ受け付け、内部で必ず `signer.signEvent()` を通す
2. `#publish()` が `created_at: 1` をプレースホルダーとして渡し、NIP-07 拡張が上書きする前提 — 拡張が上書きしない場合 1970 年のイベントになる
3. `gateway.castSigned` と `publishSignedEvent` は rx-nostr に依存しており、auftakt 移行の障害

### 目標

- `session.send()` / `session.cast()` が Draft と署名済み NostrEvent の両方を受け付ける
- signer が rx-nostr と同じ「足りない要素を補完、完成済みならパススルー」スタイルに
- `castSigned` / `publishSignedEvent` から rx-nostr 依存を除去

## 設計

### 1. 型定義 (`types.ts`)

```typescript
type Draft = { kind: number; content: string; tags: string[][] };
type Publishable = Draft | NostrEvent;

// Nostr イベントとして全フィールドが揃っているかチェック (rx-nostr の ensureEventFields と同等)
function ensureEventFields(event: Record<string, unknown>): boolean {
  if (typeof event.id !== 'string') return false;
  if (typeof event.sig !== 'string') return false;
  if (typeof event.kind !== 'number') return false;
  if (typeof event.pubkey !== 'string') return false;
  if (typeof event.content !== 'string') return false;
  if (typeof event.created_at !== 'number') return false;
  if (!Array.isArray(event.tags)) return false;
  for (const tag of event.tags) {
    if (!Array.isArray(tag)) return false;
    for (const elem of tag) {
      if (typeof elem === 'object') return false; // rx-nostr 準拠
    }
  }
  return true;
}
```

### 2. Signer 変更

rx-nostr と同じ戦略: **足りないフィールドを補完 → 完全なイベントならパススルー**。

#### nip07Signer

```typescript
async signEvent(params) {
  const extension = getNostrExtension();
  const event = {
    ...params,
    pubkey: params.pubkey ?? await extension.getPublicKey(),
    tags: [...(params.tags ?? []), ...fixedTags],
    created_at: params.created_at ?? Math.floor(Date.now() / 1000),
  };

  if (ensureEventFields(event)) {
    return event;  // 署名済み → パススルー
  }

  return await extension.signEvent(event);
}
```

変更点:

- `pubkey` 補完を追加 (rx-nostr と同じ)
- `created_at` の条件を `typeof === 'number'` から `?? (nullish)` に変更
- `ensureEventFields` ガードを追加

#### seckeySigner

```typescript
signEvent(params) {
  if (ensureEventFields(params)) {
    return Promise.resolve(params);  // 署名済み → パススルー
  }

  const event = finalizeEvent(
    {
      kind: Number(params.kind ?? 1),
      content: String(params.content ?? ''),
      tags: Array.isArray(params.tags) ? (params.tags as string[][]) : [],
      created_at: Number(params.created_at ?? Math.floor(Date.now() / 1000))
    },
    secretKey
  );
  return Promise.resolve(event as unknown as Record<string, unknown>);
}
```

変更点:

- `ensureEventFields` ガードを先頭に追加

#### noopSigner

変更なし。入力をそのまま返すので既にパススルー動作。

### 3. Session `#publish()` 変更

```typescript
// 変更前
signed = await this.signer.signEvent({
  ...draft,
  pubkey: this.pubkey,
  created_at: 1
});

// 変更後
signed = await this.signer.signEvent(input);
```

- `created_at: 1` プレースホルダーを削除 — signer が補完
- `pubkey` セットを削除 — signer が補完
- `send()` / `cast()` の引数型を `Draft` → `Publishable` に変更

### 4. `castSigned` rx-nostr 除去 (`client.ts`)

```typescript
export async function castSigned(
  params: Publishable,
  options?: { successThreshold?: number }
): Promise<void> {
  const { getSession } = await import('$shared/nostr/auftakt-runtime.svelte.js');
  const session = getSession();
  if (!session) {
    throw new Error('No active session');
  }
  const result = await session.send(params, {
    completion: { mode: 'ratio', threshold: options?.successThreshold ?? 0.5 }
  });
  if (result.status === 'failed') {
    throw new Error(result.failureReason ?? 'Publish failed');
  }
}
```

### 5. `publishSignedEvent` rx-nostr 除去 (`publish-signed.ts`)

```typescript
export async function publishSignedEvent(event: PublishableEvent): Promise<void> {
  const { getSession } = await import('$shared/nostr/auftakt-runtime.svelte.js');
  const session = getSession();
  if (!session) {
    throw new Error('No active session');
  }
  await session.send(event as NostrEvent);
}
```

### 6. `docs/auftakt/spec.md` 更新箇所

- §3.4 Publish API: `send(draft)` → `send(input: Publishable)` に更新
- §3.6 Signer: 補完ルール・ensureEventFields パススルーの仕様を追記
- §9.8 Publish フロー: signer が補完・パススルーを担う旨を追記
- §14.2 Lifecycle: フロー説明の更新

## 設計原則

- **signer 責務**: フィールド補完 (`pubkey`, `created_at`, `tags`) + 完全イベントのパススルー + 署名
- **`#publish()` 責務**: relay set 決定、optimistic write、pending publish 記録、relay 送信。署名の詳細を知らない
- **pubkey チェックなし**: Nostr の broadcast セマンティクス (任意の署名済みイベントを relay に送れる)。relay が署名検証する
- **`created_at: 1` 廃止**: signer が未設定時に現在時刻を補完 (rx-nostr と同じ)

## 変更対象ファイル

| ファイル                                | 変更内容                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `auftakt/core/types.ts`                 | `Draft`, `Publishable` 型、`ensureEventFields()` 追加                      |
| `auftakt/core/signers/nip07-signer.ts`  | pubkey 補完 + ensureEventFields パススルー                                 |
| `auftakt/core/signers/seckey-signer.ts` | ensureEventFields パススルー追加                                           |
| `auftakt/core/signers/noop-signer.ts`   | 変更なし                                                                   |
| `auftakt/core/models/session.ts`        | send/cast → Publishable 引数、#publish() から created_at/pubkey セット削除 |
| `nostr/client.ts`                       | castSigned: rx-nostr 除去、auftakt 一本化                                  |
| `nostr/publish-signed.ts`               | publishSignedEvent: rx-nostr 除去、auftakt 一本化                          |
| `nostr/gateway.ts`                      | re-export 型更新                                                           |
| `docs/auftakt/spec.md`                  | §3.4, §3.6, §9.8, §14.2 更新                                               |
| テストファイル                          | 各 signer テストに pre-signed パススルーケース追加                         |

## テスト計画

- [ ] nip07Signer: Draft → 補完+署名、NostrEvent → パススルー
- [ ] seckeySigner: Draft → finalizeEvent、NostrEvent → パススルー
- [ ] noopSigner: 既存テストで十分（パススルー動作確認済み）
- [ ] session.send(): Draft → 署名して publish、NostrEvent → そのまま publish
- [ ] session.cast(): 同上 (fire-and-forget)
- [ ] castSigned: auftakt 経由で publish
- [ ] publishSignedEvent: auftakt 経由で publish
- [ ] session なし時のエラー
