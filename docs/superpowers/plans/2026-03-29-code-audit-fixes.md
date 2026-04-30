# Code Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-03-29 コード監査で検出された Issue 1-7 を修正する (Issue 8 除外、Issue 9 は別 plan)

**Architecture:** 各 Issue は独立。domain/shared 層の pure function 修正 → テスト → view-model/UI 修正の順で進行。

**Tech Stack:** TypeScript, Svelte 5, vitest, rx-nostr, NIP-09/NIP-22/NIP-51

**Spec:** `docs/superpowers/specs/2026-03-29-code-audit-fixes-design.md`

---

## Task 1: Issue 1 — NIP-09 削除検証の条件反転

**Files:**

- Modify: `src/features/comments/domain/deletion-rules.ts`
- Modify: `src/features/comments/domain/deletion-rules.test.ts`

- [ ] **Step 1: テスト期待値を反転 — 未観測 deletion を reject する**

`src/features/comments/domain/deletion-rules.test.ts` の2箇所を修正:

```ts
// テスト "should accept deletion when original event is unknown" を反転
it('should reject deletion when original event is unknown', () => {
  const pubkeys = new Map<string, string>();
  const event = { pubkey: 'pk1', tags: [['e', 'ev1']] };
  expect(verifyDeletionTargets(event, pubkeys)).toEqual([]);
});
```

```ts
// テスト "accepts deletion when original pubkey is unknown (not in eventPubkeys map)" を反転
it('rejects deletion when original pubkey is unknown (not in eventPubkeys map)', () => {
  const pubkeys = new Map([['other-event', 'someone-else']]);
  const event = { pubkey: 'pk-unknown', tags: [['e', 'ev-not-in-map']] };
  expect(verifyDeletionTargets(event, pubkeys)).toEqual([]);
});
```

mixed verification テストの ev3 (未観測) も reject されるよう修正:

```ts
it('should handle multiple e-tags with mixed verification', () => {
  const pubkeys = new Map([
    ['ev1', 'pk1'],
    ['ev2', 'pk2']
  ]);
  const event = {
    pubkey: 'pk1',
    tags: [
      ['e', 'ev1'],
      ['e', 'ev2'],
      ['e', 'ev3']
    ]
  };
  const result = verifyDeletionTargets(event, pubkeys);
  expect(result).toContain('ev1');
  expect(result).not.toContain('ev2');
  expect(result).not.toContain('ev3'); // unknown -> reject
});
```

- [ ] **Step 2: テストが FAIL することを確認**

Run: `pnpm test -- --run src/features/comments/domain/deletion-rules.test.ts`
Expected: 3 件 FAIL (反転したテスト)

- [ ] **Step 3: deletion-rules.ts の条件を修正**

`src/features/comments/domain/deletion-rules.ts` を修正:

```ts
export function verifyDeletionTargets(
  event: { pubkey: string; tags: string[][] },
  eventPubkeys: Map<string, string>
): string[] {
  const targets = extractDeletionTargets(event);
  return targets.filter((id) => {
    const originalPubkey = eventPubkeys.get(id);
    // Only accept if original event is known AND author matches
    return originalPubkey !== undefined && originalPubkey === event.pubkey;
  });
}
```

- [ ] **Step 4: テストが PASS することを確認**

Run: `pnpm test -- --run src/features/comments/domain/deletion-rules.test.ts`
Expected: ALL PASS

- [ ] **Step 5: commit**

```
git add src/features/comments/domain/deletion-rules.ts src/features/comments/domain/deletion-rules.test.ts
git commit -m "fix: reject NIP-09 deletion for unobserved events (Issue 1)"
```

---

## Task 2: Issue 1 — pending deletion の実装

**Files:**

- Modify: `src/features/comments/ui/comment-view-model.svelte.ts`

- [ ] **Step 1: pending deletion の state と照合ロジックを追加**

import に `extractDeletionTargets` を追加:

```ts
import { extractDeletionTargets } from '$shared/nostr/events.js';
```

state 宣言セクション (既存の `const eventPubkeys = ...` の後) に:

```ts
const pendingDeletions = new Map<string, { pubkey: string; tags: string[][] }>();
```

domain operations セクションに `applyPendingDeletion` helper を追加:

```ts
function applyPendingDeletion(eventId: string, eventPubkey: string): void {
  const pending = pendingDeletions.get(eventId);
  if (!pending) return;
  pendingDeletions.delete(eventId);
  if (pending.pubkey === eventPubkey) {
    const next = new Set(deletedIds);
    next.add(eventId);
    deletedIds = next;
    if (deletedIds.size !== prevDeletedSize) {
      prevDeletedSize = deletedIds.size;
      rebuildReactionIndex();
    }
    log.debug('Pending deletion applied', { id: shortHex(eventId) });
  }
}
```

`handleDeletionPacket` の `const verified = ...` の後に pending 保存を追加:

```ts
// Store unverified targets as pending (original event not yet observed)
const allTargets = extractDeletionTargets(event);
for (const id of allTargets) {
  if (!eventPubkeys.has(id) && !pendingDeletions.has(id)) {
    pendingDeletions.set(id, { pubkey: event.pubkey, tags: event.tags });
  }
}
```

`handleCommentPacket` の `eventPubkeys.set` 直後に呼び出し追加:

```ts
eventPubkeys.set(event.id, event.pubkey);
applyPendingDeletion(event.id, event.pubkey);
```

同様に `handleReactionPacket` と `handleContentReactionPacket` の `eventPubkeys.set` 直後にも追加。

- [ ] **Step 2: 全テスト PASS を確認**

Run: `pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 3: commit**

```
git add src/features/comments/ui/comment-view-model.svelte.ts
git commit -m "feat: add pending deletion reconciliation for NIP-09 compliance (Issue 1)"
```

---

## Task 3: Issue 7 — relay list の created_at 比較

**Files:**

- Modify: `src/shared/nostr/relays-config.ts`
- Modify: `src/shared/nostr/relays-config.test.ts`
- Modify: `src/shared/browser/relays.svelte.ts`

- [ ] **Step 1: relays-config.test.ts に複数 packet テストを追加**

```ts
it('uses event with highest created_at when multiple packets arrive', async () => {
  subscribeFn = (observer) => {
    observer.next?.({
      event: {
        created_at: 1000,
        tags: [['r', 'wss://old-relay.example.com']]
      }
    });
    observer.next?.({
      event: {
        created_at: 2000,
        tags: [['r', 'wss://new-relay.example.com']]
      }
    });
    queueMicrotask(() => observer.complete?.());
    return { unsubscribe: vi.fn() };
  };

  const { applyUserRelays } = await import('./relays-config.js');
  const result = await applyUserRelays('deadbeef'.repeat(8));
  expect(result).toEqual(['wss://new-relay.example.com']);
  expect(mockSetDefaultRelays).toHaveBeenCalledWith(['wss://new-relay.example.com']);
});

it('ignores older event arriving after newer one', async () => {
  subscribeFn = (observer) => {
    observer.next?.({
      event: {
        created_at: 2000,
        tags: [['r', 'wss://new-relay.example.com']]
      }
    });
    observer.next?.({
      event: {
        created_at: 1000,
        tags: [['r', 'wss://old-relay.example.com']]
      }
    });
    queueMicrotask(() => observer.complete?.());
    return { unsubscribe: vi.fn() };
  };

  const { applyUserRelays } = await import('./relays-config.js');
  const result = await applyUserRelays('deadbeef'.repeat(8));
  expect(result).toEqual(['wss://new-relay.example.com']);
});
```

- [ ] **Step 2: テストが FAIL することを確認**

Run: `pnpm test -- --run src/shared/nostr/relays-config.test.ts`
Expected: "ignores older event" テストが FAIL

- [ ] **Step 3: relays-config.ts に created_at 比較を追加**

`let relayTags` 宣言の後に `let latestCreatedAt = 0;` を追加。
subscribe の next callback を修正:

```ts
next: (packet) => {
  if (packet.event.created_at > latestCreatedAt) {
    latestCreatedAt = packet.event.created_at;
    relayTags = packet.event.tags;
  }
},
```

- [ ] **Step 4: テストが PASS することを確認**

Run: `pnpm test -- --run src/shared/nostr/relays-config.test.ts`
Expected: ALL PASS

- [ ] **Step 5: relays.svelte.ts の fetchRelayList にも同じ修正**

kind:10002 セクション — `let found` の後に `let latestCreatedAt = 0;` を追加:

```ts
next: (packet) => {
  const entries = parseRelayTags(packet.event.tags);
  if (entries.length > 0 && packet.event.created_at > latestCreatedAt) {
    latestCreatedAt = packet.event.created_at;
    found = entries;
  }
},
```

kind:3 セクション — 同様に `let latestCreatedAt = 0;` を追加:

```ts
next: (packet) => {
  try {
    if (packet.event.created_at <= latestCreatedAt) return;
    const content = JSON.parse(packet.event.content) as Record<
      string,
      { read?: boolean; write?: boolean }
    >;
    const entries: RelayEntry[] = Object.entries(content).map(([url, flags]) => ({
      url,
      read: flags.read ?? true,
      write: flags.write ?? true
    }));
    if (entries.length > 0) {
      latestCreatedAt = packet.event.created_at;
      found = entries;
    }
  } catch {
    // Ignore parse failures from malformed kind:3 content.
  }
},
```

- [ ] **Step 6: 全テスト PASS を確認**

Run: `pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 7: commit**

```
git add src/shared/nostr/relays-config.ts src/shared/nostr/relays-config.test.ts src/shared/browser/relays.svelte.ts
git commit -m "fix: use created_at instead of arrival order for relay list selection (Issue 7)"
```

---

## Task 4: Issue 2 — 引用 e-tag を q-tag に分離

**Files:**

- Modify: `src/shared/nostr/content-parser.ts`
- Modify: `src/shared/nostr/content-parser.test.ts`
- Modify: `src/shared/nostr/events.ts`
- Modify: `src/shared/nostr/events.test.ts`

- [ ] **Step 1: content-parser.test.ts の eTags -> qTags に変更**

```ts
it('extracts eventId from nostr:nevent1... to qTags', () => {
  const { qTags } = extractContentTags(`nostr:${VALID_NEVENT}`);
  expect(qTags).toHaveLength(1);
  expect(qTags[0]).toBe(EVENT_HEX);
});

it('extracts eventId from nostr:note1... to qTags', () => {
  const { qTags } = extractContentTags(`nostr:${VALID_NOTE}`);
  expect(qTags).toHaveLength(1);
  expect(qTags[0]).toBe(EVENT_HEX);
});

it('returns empty arrays for plain text', () => {
  const { pTags, qTags, tTags } = extractContentTags('no links here');
  expect(pTags).toHaveLength(0);
  expect(qTags).toHaveLength(0);
  expect(tTags).toHaveLength(0);
});
```

- [ ] **Step 2: テストが FAIL することを確認**

Run: `pnpm test -- --run src/shared/nostr/content-parser.test.ts`
Expected: FAIL (qTags プロパティが存在しない)

- [ ] **Step 3: content-parser.ts の extractContentTags を修正**

`eSet` -> `qSet`、`eTags` -> `qTags` に全面置換:

```ts
export function extractContentTags(content: string): {
  pTags: string[];
  qTags: string[];
  tTags: string[];
} {
  const pSet = new Set<string>();
  const qSet = new Set<string>();
  const tSet = new Set<string>();

  // ... regex matching - nevent/note cases:
  case 'nevent':
    qSet.add(decoded.eventId);
    break;
  case 'note':
    qSet.add(decoded.eventId);
    break;

  // ... return:
  return {
    pTags: [...pSet],
    qTags: [...qSet],
    tTags: [...tSet]
  };
}
```

- [ ] **Step 4: content-parser テストが PASS することを確認**

Run: `pnpm test -- --run src/shared/nostr/content-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: events.ts の appendContentTags を修正**

`eTags` -> `qTags`、`['e', ...]` -> `['q', ...]`:

```ts
const { pTags, qTags, tTags } = extractContentTags(content);

// ... p-tag block unchanged ...

const existingQ = new Set(tags.filter((tag) => tag[0] === 'q').map((tag) => tag[1]));
for (const eventId of qTags) {
  if (!existingQ.has(eventId)) {
    tags.push(['q', eventId]);
  }
}

// ... t-tag block unchanged ...
```

- [ ] **Step 6: events.test.ts に q-tag 回帰テストを追加**

```ts
import { nip19 } from 'nostr-tools';
const EVENT_HEX = 'aaaa'.repeat(16);
const VALID_NOTE = nip19.noteEncode(EVENT_HEX);
```

```ts
it('adds q-tag (not e-tag) for nostr:note1 references in content', () => {
  const content = `see nostr:${VALID_NOTE}`;
  const result = buildComment(content, contentId, provider);
  const qTags = result.tags.filter((t) => t[0] === 'q');
  const contentETags = result.tags.filter((t) => t[0] === 'e');
  expect(qTags).toHaveLength(1);
  expect(qTags[0][1]).toBe(EVENT_HEX);
  expect(contentETags).toHaveLength(0);
});
```

- [ ] **Step 7: 全テスト PASS を確認**

Run: `pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 8: commit**

```
git add src/shared/nostr/content-parser.ts src/shared/nostr/content-parser.test.ts src/shared/nostr/events.ts src/shared/nostr/events.test.ts
git commit -m "fix: use q-tag instead of e-tag for content quotes to prevent replyTo pollution (Issue 2)"
```

---

## Task 5: Issue 5 — ncontent prefix のドキュメント化

**Files:**

- Modify: `src/features/nip19-resolver/application/resolve-nip19-navigation.ts`
- Modify: `src/shared/nostr/helpers.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: VALID_PREFIXES を standard / custom に分離**

```ts
/** Standard NIP-19 bech32 prefixes */
const STANDARD_NIP19_PREFIXES = ['npub1', 'nprofile1', 'nevent1', 'note1'];
/** Resonote-specific bech32 prefixes (not part of NIP-19 standard) */
const CUSTOM_PREFIXES = ['ncontent1'];
const VALID_PREFIXES = [...STANDARD_NIP19_PREFIXES, ...CUSTOM_PREFIXES];
```

- [ ] **Step 2: helpers.ts に JSDoc 追記**

`encodeContentLink`:

```ts
/**
 * Encode a ContentId + relay list into a bech32 `ncontent1...` string.
 *
 * **Resonote-specific extension** - not part of the NIP-19 standard.
 * Other Nostr clients cannot decode this format.
 *
 * TLV structure:
 * - Type 0: content identifier string (`platform:type:id`)
 * - Type 1: relay URL (repeatable)
 */
```

`decodeContentLink`:

```ts
/**
 * Decode a bech32 `ncontent1...` string into a ContentId + relay list.
 *
 * **Resonote-specific extension** - not part of the NIP-19 standard.
 * Returns null if the input is invalid or uses a different prefix.
 */
```

- [ ] **Step 3: CLAUDE.md に ncontent 仕様を追記**

`### Nostr Layer` セクション末尾に:

```markdown
### ncontent (Resonote-specific)

`ncontent1...` は Resonote 独自の bech32 エンコーディング。NIP-19 標準外。

- TLV 構造: Type 0 = ContentId 文字列 (`platform:type:id`)、Type 1 = relay URL (複数可)
- Encode: `src/shared/nostr/helpers.ts` の `encodeContentLink()`
- Decode: `src/shared/nostr/helpers.ts` の `decodeContentLink()`
- 用途: share URL 生成 (`sharing/domain/share-link.ts`)、content-parser での本文パース、route resolver
- 他クライアントでは decode 不可。Resonote 内部専用
```

- [ ] **Step 4: lint, check, test PASS を確認**

Run: `pnpm check && pnpm lint && pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 5: commit**

```
git add src/features/nip19-resolver/application/resolve-nip19-navigation.ts src/shared/nostr/helpers.ts CLAUDE.md
git commit -m "docs: document ncontent as Resonote-specific bech32 extension (Issue 5)"
```

---

## Task 6: Issue 6 — CSP ドキュメント化

**Files:**

- Modify: `src/hooks.server.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: hooks.server.ts の CSP ヘッダーにコメント追加**

CSP ヘッダー設定箇所の直前に:

```ts
// Content-Security-Policy rationale:
// - 'unsafe-eval' in script-src: Required by @konemono/nostr-login which uses
//   dynamic code evaluation internally. Remove when the library eliminates this usage.
// - 'unsafe-inline' in script-src: Required for Svelte event handlers and inline scripts.
// - 'unsafe-inline' in style-src: Required for Svelte scoped styles and Tailwind CSS v4.
```

- [ ] **Step 2: CLAUDE.md Gotchas に追記**

```markdown
- CSP `script-src` に `'unsafe-eval'` が必要 -- `@konemono/nostr-login` が内部で動的コード評価を使用するため。ライブラリが改善したら除去し、`pnpm build && wrangler pages dev` + cloudflared tunnel で CSP 動作を確認する
- CSP `style-src` の `'unsafe-inline'` は SvelteKit + Tailwind CSS v4 で実質必須
```

- [ ] **Step 3: lint PASS を確認**

Run: `pnpm lint && pnpm check`
Expected: ALL PASS

- [ ] **Step 4: commit**

```
git add src/hooks.server.ts CLAUDE.md
git commit -m "docs: document CSP unsafe-eval/unsafe-inline rationale (Issue 6)"
```

---

## Task 7: Issue 4 — bookmarks の読み取り拡張

**Files:**

- Modify: `src/features/bookmarks/domain/bookmark-model.ts`
- Modify: `src/features/bookmarks/domain/bookmark-model.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: bookmark-model.test.ts に r-tag テストを追加**

```ts
it('parses r-tag entries as url type', () => {
  const tags = [['r', 'https://example.com/article']];
  const entries = parseBookmarkTags(tags);
  expect(entries).toEqual([{ type: 'url', value: 'https://example.com/article', hint: undefined }]);
});

it('parses mixed i, e, and r tags', () => {
  const tags = [
    ['i', 'spotify:track:abc', 'https://open.spotify.com/track/abc'],
    ['e', 'deadbeef'.repeat(8), 'wss://relay.example.com'],
    ['r', 'https://example.com/article']
  ];
  const entries = parseBookmarkTags(tags);
  expect(entries).toHaveLength(3);
  expect(entries[0].type).toBe('content');
  expect(entries[1].type).toBe('event');
  expect(entries[2].type).toBe('url');
});
```

- [ ] **Step 2: テストが FAIL することを確認**

Run: `pnpm test -- --run src/features/bookmarks/domain/bookmark-model.test.ts`
Expected: FAIL (r-tag が parse されない / url type が存在しない)

- [ ] **Step 3: bookmark-model.ts に r-tag parse を追加**

`BookmarkEntry` の type を拡張:

```ts
export interface BookmarkEntry {
  type: 'content' | 'event' | 'url';
  value: string;
  hint?: string;
}
```

`parseBookmarkTags` に `r` 分岐を追加:

```ts
} else if (tag[0] === 'r' && tag[1]) {
  entries.push({ type: 'url', value: tag[1], hint: tag[2] });
}
```

- [ ] **Step 4: テストが PASS することを確認**

Run: `pnpm test -- --run src/features/bookmarks/domain/bookmark-model.test.ts`
Expected: ALL PASS

- [ ] **Step 5: CLAUDE.md に bookmark の i-tag 仕様を追記**

`### ContentProvider Pattern` セクション末尾に:

```markdown
### Bookmarks

kind:10003 で外部コンテンツを `i` タグ (NIP-73 拡張) でブックマーク。NIP-51 標準外だが、他クライアントは不明タグを無視するので互換性に害はない。読み取り側は `i`/`e`/`r` タグを parse する。
```

- [ ] **Step 6: 全テスト PASS を確認**

Run: `pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 7: commit**

```
git add src/features/bookmarks/domain/bookmark-model.ts src/features/bookmarks/domain/bookmark-model.test.ts CLAUDE.md
git commit -m "feat: add r-tag parsing to bookmarks and document i-tag as Resonote extension (Issue 4)"
```

---

## Task 8: Issue 3 — mute list の NIP-04 fallback 読み取り

**Files:**

- Modify: `src/shared/browser/mute.svelte.ts`

- [ ] **Step 1: NIP-04 decrypt 関数と暗号方式 state を追加**

既存の `decryptTags` (NIP-44) の後に NIP-04 版を追加:

```ts
async function decryptTagsNip04(pubkey: string, ciphertext: string): Promise<string[][]> {
  const nip04 = window.nostr?.nip04;
  if (!nip04) throw new Error('NIP-04 decryption not available');
  const plaintext = await nip04.decrypt(pubkey, ciphertext);
  return JSON.parse(plaintext);
}
```

暗号方式 state と保全用タグ:

```ts
export type EncryptionScheme = 'nip44' | 'nip04' | 'new';
let encryptionScheme = $state<EncryptionScheme>('new');
let preservedPrivateTags = $state<string[][]>([]);
```

capability 判定:

```ts
export function hasNip04Support(): boolean {
  return typeof window !== 'undefined' && !!window.nostr?.nip04;
}

export function hasEncryptionSupport(): boolean {
  return hasNip44Support() || hasNip04Support();
}
```

`getMuteList` に `encryptionScheme` getter を追加:

```ts
get encryptionScheme() { return encryptionScheme; }
```

- [ ] **Step 2: loadMuteList の decrypt を NIP-44 -> NIP-04 fallback に変更**

既存の `if (latest.content && hasNip44Support())` ブロック全体を以下に置換:

```ts
if (latest.content) {
  let decryptedTags: string[][] | null = null;

  if (hasNip44Support()) {
    try {
      decryptedTags = await decryptTags(pubkey, latest.content);
      if (gen !== generation) return;
      encryptionScheme = 'nip44';
    } catch {
      log.debug('NIP-44 decrypt failed, trying NIP-04 fallback');
    }
  }

  if (decryptedTags === null && hasNip04Support()) {
    try {
      decryptedTags = await decryptTagsNip04(pubkey, latest.content);
      if (gen !== generation) return;
      encryptionScheme = 'nip04';
    } catch {
      log.warn('Both NIP-44 and NIP-04 decrypt failed');
    }
  }

  if (decryptedTags) {
    const otherTags: string[][] = [];
    for (const tag of decryptedTags) {
      if (tag[0] === 'p' && tag[1]) newPubkeys.add(tag[1]);
      else if (tag[0] === 'word' && tag[1]) newWords.push(tag[1].toLowerCase());
      else otherTags.push(tag);
    }
    preservedPrivateTags = otherTags;
  }
} else {
  encryptionScheme = 'new';
}
```

- [ ] **Step 3: publishMuteList に暗号方式パラメータと preserved tags を追加**

```ts
async function publishMuteList(useScheme?: EncryptionScheme): Promise<void> {
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const scheme = useScheme ?? encryptionScheme;

  const allTags: string[][] = [
    ...[...mutedPubkeys].map((pk) => ['p', pk]),
    ...mutedWords.map((w) => ['word', w]),
    ...preservedPrivateTags
  ];

  let encrypted: string;
  if (scheme === 'nip04') {
    if (!hasNip04Support()) throw new Error('NIP-04 not available');
    const nip04 = window.nostr!.nip04!;
    encrypted = await nip04.encrypt(myPubkey, JSON.stringify(allTags));
  } else {
    if (!hasNip44Support()) throw new Error('NIP-44 not available');
    encrypted = await encryptTags(myPubkey, allTags);
  }

  const { publishMuteList: publish } = await import('$features/mute/application/mute-actions.js');
  await publish(encrypted);

  if (useScheme) encryptionScheme = useScheme;
  log.info('Mute list published', { scheme, pubkeys: mutedPubkeys.size, words: mutedWords.length });
}
```

public API に `useScheme` パラメータを追加 (`muteUser`, `unmuteUser`, `muteWord`, `unmuteWord` の4関数):

```ts
export async function muteUser(pubkey: string, useScheme?: EncryptionScheme): Promise<void> {
  // ... existing logic ...
  await publishMuteList(useScheme);
}
// 同様に他3関数
```

`clearMuteList` に リセットを追加:

```ts
export function clearMuteList(): void {
  log.info('Clearing mute list');
  ++generation;
  mutedPubkeys = new Set();
  mutedWords = [];
  preservedPrivateTags = [];
  encryptionScheme = 'new';
  loading = false;
}
```

- [ ] **Step 4: テスト PASS を確認**

Run: `pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 5: commit**

```
git add src/shared/browser/mute.svelte.ts
git commit -m "feat: add NIP-04 fallback for mute list decryption and tag preservation (Issue 3)"
```

---

## Task 9: Issue 3 — mute list 書き込み時の暗号方式確認ダイアログ

**Files:**

- Modify: `src/features/mute/ui/mute-settings-view-model.svelte.ts`
- Modify: i18n message dictionaries

- [ ] **Step 1: import を更新**

```ts
import {
  getMuteList,
  hasNip44Support,
  hasEncryptionSupport,
  muteWord,
  unmuteUser,
  unmuteWord,
  type EncryptionScheme
} from '$shared/browser/mute.js';
```

`canEdit` を更新:

```ts
let encryptionAvailable = $derived(hasEncryptionSupport());
let canEdit = $derived(auth.canWrite && encryptionAvailable);
```

- [ ] **Step 2: 暗号方式確認ロジックを追加**

```ts
let pendingNip04Action: ((scheme?: EncryptionScheme) => Promise<void>) | null = null;

function executeWithSchemeCheck(action: (scheme?: EncryptionScheme) => Promise<void>): void {
  const list = getMuteList();
  if (list.encryptionScheme === 'nip04' && hasNip44Support()) {
    pendingNip04Action = action;
    confirmAction = {
      title: t('confirm.encryption_scheme'),
      message: t('confirm.encryption_scheme.detail'),
      variant: 'default' as ConfirmVariant,
      action: async () => {
        pendingNip04Action = null;
        await action('nip44');
      }
    };
  } else {
    void action();
  }
}
```

`cancelConfirmAction` を修正:

```ts
function cancelConfirmAction(): void {
  const pending = pendingNip04Action;
  pendingNip04Action = null;
  confirmAction = null;
  if (pending) void pending('nip04');
}
```

既存の `requestAddMuteWord`, `requestUnmuteUser`, `requestUnmuteWord` を修正:

```ts
function requestAddMuteWord(): void {
  const word = newMuteWord.trim();
  if (!word) return;
  executeWithSchemeCheck(async (scheme) => {
    await muteWord(word, scheme);
    newMuteWord = '';
  });
}

function requestUnmuteUser(pubkey: string): void {
  executeWithSchemeCheck(async (scheme) => {
    await unmuteUser(pubkey, scheme);
  });
}

function requestUnmuteWord(word: string): void {
  executeWithSchemeCheck(async (scheme) => {
    await unmuteWord(word, scheme);
  });
}
```

- [ ] **Step 3: i18n メッセージを追加**

ja / en のメッセージ辞書に追加:

```
confirm.encryption_scheme: 'NIP-44に変換しますか？' / 'Convert to NIP-44?'
confirm.encryption_scheme.detail: 'この mute list は NIP-04 で暗号化されています。変換すると NIP-04 のみ対応のクライアントでは読めなくなります。キャンセルで NIP-04 のまま保存します。' / 'This mute list uses NIP-04 encryption. Converting to NIP-44 makes it unreadable by NIP-04-only clients. Cancel to keep NIP-04.'
```

- [ ] **Step 4: lint, check, test PASS を確認**

Run: `pnpm check && pnpm lint && pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 5: commit**

```
git add src/features/mute/ui/mute-settings-view-model.svelte.ts src/shared/i18n/
git commit -m "feat: add encryption scheme confirmation dialog for NIP-04 mute lists (Issue 3)"
```

---

## Task 10: 全体検証

- [ ] **Step 1: 全検証セット実行**

```
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Expected: ALL PASS

- [ ] **Step 2: spec 照合**

各 Issue の完了条件を確認:

- Issue 1: 未観測 deletion reject + pending 再照合
- Issue 2: q-tag 分離 + replyTo 非干渉
- Issue 3: NIP-04 fallback + 暗号方式ダイアログ + tag 保全
- Issue 4: r-tag parse + ドキュメント
- Issue 5: prefix 分離 + JSDoc + CLAUDE.md
- Issue 6: CSP コメント + CLAUDE.md
- Issue 7: created_at 比較
