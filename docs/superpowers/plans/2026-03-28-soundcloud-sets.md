# SoundCloud Sets 埋め込み対応 実装計画

> **エージェント向け:** 必須サブスキル: superpowers:subagent-driven-development（推奨）または superpowers:executing-plans を使ってタスクごとに実装すること。

**ゴール:** SoundCloud Sets（プレイリスト）URL を認識し、埋め込み再生できるようにする

**アーキテクチャ:** ContentProvider の `parseUrl()` で `/sets/` を認識、SoundCloudEmbed で高さ調整。サーバー側は変更なし。

**技術スタック:** SvelteKit, ContentProvider パターン

---

## Task 1: ContentProvider で Sets URL を認識

**ファイル:**

- 変更: `src/shared/content/soundcloud.ts`
- テスト: `src/shared/content/soundcloud.test.ts`

- [ ] **Step 1: テストを追加**

`src/shared/content/soundcloud.test.ts` に以下を追加:

```typescript
it('should parse a sets URL', () => {
  const result = provider.parseUrl('https://soundcloud.com/artist-name/sets/playlist-name');
  expect(result).toEqual({
    platform: 'soundcloud',
    type: 'set',
    id: 'artist-name/sets/playlist-name'
  });
});

it('should parse a sets URL with www', () => {
  const result = provider.parseUrl('https://www.soundcloud.com/artist-name/sets/playlist-name');
  expect(result).toEqual({
    platform: 'soundcloud',
    type: 'set',
    id: 'artist-name/sets/playlist-name'
  });
});

it('should parse a sets URL with trailing slash', () => {
  const result = provider.parseUrl('https://soundcloud.com/artist-name/sets/playlist-name/');
  expect(result).toEqual({
    platform: 'soundcloud',
    type: 'set',
    id: 'artist-name/sets/playlist-name'
  });
});

it('should parse a sets URL with query params', () => {
  const result = provider.parseUrl('https://soundcloud.com/artist-name/sets/playlist-name?si=abc');
  expect(result).toEqual({
    platform: 'soundcloud',
    type: 'set',
    id: 'artist-name/sets/playlist-name'
  });
});
```

既存テスト `'should return null for a sets URL'` を更新:

```typescript
// Before: expect(provider.parseUrl('https://soundcloud.com/artist-name/sets')).toBeNull();
// This URL has no playlist name after /sets/, so it should still return null
it('should return null for /sets/ without playlist name', () => {
  expect(provider.parseUrl('https://soundcloud.com/artist-name/sets')).toBeNull();
});
```

`toNostrTag` と `contentKind` のテストも追加:

```typescript
it('should generate correct NIP-73 tag for sets', () => {
  const tag = provider.toNostrTag({
    platform: 'soundcloud',
    type: 'set',
    id: 'artist-name/sets/playlist-name'
  });
  expect(tag).toEqual([
    'soundcloud:set:artist-name/sets/playlist-name',
    'https://soundcloud.com/artist-name/sets/playlist-name'
  ]);
});

it('should return correct contentKind for set', () => {
  expect(provider.contentKind({ platform: 'soundcloud', type: 'set', id: 'a/sets/b' })).toBe(
    'soundcloud:set'
  );
});

it('should return correct contentKind for track', () => {
  expect(provider.contentKind({ platform: 'soundcloud', type: 'track', id: 'a/b' })).toBe(
    'soundcloud:track'
  );
});
```

- [ ] **Step 2: テスト実行 → 失敗を確認**

```bash
pnpm vitest run src/shared/content/soundcloud.test.ts
```

期待: 新規テストが FAIL

- [ ] **Step 3: soundcloud.ts を修正**

`src/shared/content/soundcloud.ts`:

正規表現を追加して Sets URL をマッチ:

```typescript
const SOUNDCLOUD_RE =
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

const SOUNDCLOUD_SETS_RE =
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/sets\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;
```

`parseUrl()` を修正:

```typescript
parseUrl(url: string): ContentId | null {
  // Sets URL をトラック URL より先にチェック（/sets/ がトラック正規表現にもマッチするため）
  const setsMatch = url.match(SOUNDCLOUD_SETS_RE);
  if (setsMatch) {
    return { platform: this.platform, type: 'set', id: `${setsMatch[1]}/sets/${setsMatch[2]}` };
  }

  const match = url.match(SOUNDCLOUD_RE);
  if (match) {
    if (match[2] === 'sets') return null; // /sets without playlist name
    return { platform: this.platform, type: 'track', id: `${match[1]}/${match[2]}` };
  }
  return null;
}
```

`contentKind()` を修正（`contentId` を使う）:

```typescript
contentKind(contentId: ContentId): string {
  return `soundcloud:${contentId.type}`;
}
```

`toNostrTag()` は既に `contentId.type` を使っているので変更不要。

- [ ] **Step 4: テスト実行 → パスを確認**

```bash
pnpm vitest run src/shared/content/soundcloud.test.ts
```

- [ ] **Step 5: コミット**

```bash
git add src/shared/content/soundcloud.ts src/shared/content/soundcloud.test.ts
git commit -m "feat: support SoundCloud Sets URL parsing in ContentProvider"
```

---

## Task 2: SoundCloudEmbed で Sets の高さ調整

**ファイル:**

- 変更: `src/lib/components/SoundCloudEmbed.svelte`

- [ ] **Step 1: iframe の height を contentId.type に応じて変更**

`src/lib/components/SoundCloudEmbed.svelte` の iframe と EmbedLoading を修正:

```svelte
{#if embedSrc}
  <iframe
    bind:this={iframeEl}
    src={embedSrc}
    width="100%"
    height={contentId.type === 'set' ? '450' : '166'}
    scrolling="no"
    frameborder="no"
    allow="autoplay"
    title={t('embed.player_title', { platform: 'SoundCloud' })}
  ></iframe>
{/if}
```

EmbedLoading の `minHeight` も同様:

```svelte
<EmbedLoading color="bg-orange-500" minHeight={contentId.type === 'set' ? 'min-h-[450px]' : 'min-h-[166px]'}>
```

- [ ] **Step 2: ビルド確認**

```bash
pnpm check
```

- [ ] **Step 3: コミット**

```bash
git add src/lib/components/SoundCloudEmbed.svelte
git commit -m "feat: adjust SoundCloud embed height for Sets playlists"
```

---

## Task 3: 検証 + Issue クローズ

- [ ] **Step 1: 全チェック実行**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 2: コミット（修正があれば）**

- [ ] **Step 3: Issue #158 をクローズ**

```bash
gh issue close 158
```
