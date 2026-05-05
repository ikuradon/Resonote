# LISTEN RSS Feed Integration Design

## Goal

LISTEN URLs should work as podcast RSS inputs in Resonote. Users can paste a LISTEN podcast URL, LISTEN RSS URL, or LISTEN episode URL and land in the existing podcast playback/comment flow.

This is an RSS-first integration. LISTEN is not introduced as a new content platform in the first implementation.

## Supported Inputs

The implementation supports these public LISTEN URL forms:

- `https://listen.style/p/{podcastSlug}`
- `https://listen.style/p/{podcastSlug}/{episodeSlug}`
- `https://listen.style/p/{podcastSlug}/{episodeSlug}?t={seconds}`
- `https://rss.listen.style/p/{podcastSlug}/rss`

Podcast page URLs and RSS URLs resolve to the podcast feed page:

```text
/podcast/feed/{base64url("https://rss.listen.style/p/{podcastSlug}/rss")}
```

Episode URLs resolve through the RSS feed before navigation. The episode slug alone is not enough to build a podcast episode `ContentId`, because Resonote's podcast episode identity is feed URL plus RSS item guid.

## Architecture

### URL Normalization

`PodcastProvider` remains the public provider for LISTEN RSS content.

Add a small LISTEN URL parser near the existing feed URL parsing:

- `parseListenUrl(url): { feedUrl: string; episodeUrl?: string; initialTimeSec?: number } | null`
- `buildListenFeedUrl(podcastSlug): string`
- `normalizeListenEpisodeUrl(url): string`

For `https://listen.style/p/{podcastSlug}`, `PodcastProvider.parseUrl()` returns a normal `podcast:feed` `ContentId` with the canonical RSS URL encoded.

For `https://rss.listen.style/p/{podcastSlug}/rss`, existing feed URL matching should continue to return a normal `podcast:feed` `ContentId`.

For `https://listen.style/p/{podcastSlug}/{episodeSlug}`, `PodcastProvider.parseUrl()` must not pretend to know the episode guid. It should still expose the canonical feed URL as the stable fallback target, while the navigation layer starts episode resolution from the original URL.

### Episode Resolution

Add an application-level resolver for LISTEN episode URLs:

```ts
resolveListenEpisodeUrl(url): Promise<
  | { kind: 'episode'; path: string; initialTimeSec?: number }
  | { kind: 'feed-fallback'; path: string; warning: 'listen_episode_not_found' }
  | { kind: 'error'; path: string; warning: 'listen_feed_unavailable' }
>
```

The resolver:

1. Parses `podcastSlug`, `episodeSlug`, and optional `t`.
2. Builds `feedUrl = https://rss.listen.style/p/{podcastSlug}/rss`.
3. Calls the existing podcast feed resolve flow for that feed URL.
4. Finds the RSS item whose `link` matches `https://listen.style/p/{podcastSlug}/{episodeSlug}` after normalization.
5. Builds `buildEpisodeContentId(feedUrl, item.guid || item.enclosureUrl)`.
6. Returns `/podcast/episode/{contentId.id}`, preserving `?t={seconds}` when present.

If the feed resolves but the item is not found, the resolver returns feed fallback:

```text
/podcast/feed/{base64url(feedUrl)}?warning=listen_episode_not_found
```

If the feed cannot be fetched or parsed, the resolver also returns the feed path with a warning. Existing podcast feed UI can then show the normal feed error state.

### API Shape

The existing `/api/podcast/resolve` RSS parser currently returns episode fields needed by the feed UI. It should also return each item's source page link.

Add `link?: string` to parsed episodes:

```ts
interface ParsedEpisode {
  title: string;
  guid: string;
  link?: string;
  enclosureUrl: string;
  pubDate: string;
  duration: number;
  description: string;
}
```

`parseRss()` should read item `<link>` and include it in `episodes`. This is useful beyond LISTEN and does not change existing consumers.

### UI Flow

The input/navigation layer should detect LISTEN episode URLs before normal provider navigation completes. A LISTEN episode URL starts async resolution and then navigates to the resolved path.

Feed fallback warnings should be displayed on the feed page. Use a lightweight existing notification style where possible:

- Prefer toast if there is already a route-safe toast utility in the content-resolution flow.
- Otherwise show an inline warning above the feed list.

Warning text:

```text
指定された LISTEN エピソードは RSS 内で見つかりませんでした。一覧から選択してください。
```

The warning query parameter should be removed or ignored after display if the existing route pattern already has a safe way to do that. If not, leaving it in the URL is acceptable for the first implementation.

## Data Flow

Podcast URL:

```text
listen.style/p/listennews
  -> PodcastProvider.parseUrl()
  -> podcast feed ContentId using https://rss.listen.style/p/listennews/rss
  -> existing PodcastEpisodeList
```

LISTEN RSS URL:

```text
rss.listen.style/p/listennews/rss
  -> PodcastProvider.parseUrl()
  -> existing podcast feed flow
```

LISTEN episode URL:

```text
listen.style/p/listennews/hfqabwoa?t=90
  -> detect LISTEN episode URL
  -> resolve https://rss.listen.style/p/listennews/rss
  -> match item.link to episode URL
  -> /podcast/episode/{feedBase64}:{guidBase64}?t=90
  -> existing AudioEmbed + comment flow
```

Fallback:

```text
listen.style/p/listennews/missing
  -> resolve feed
  -> item not found
  -> /podcast/feed/{feedBase64}?warning=listen_episode_not_found
  -> feed list with warning
```

## Nostr Identity

No LISTEN-specific Nostr identity is introduced.

The feed remains:

```text
podcast:feed:https://rss.listen.style/p/{podcastSlug}/rss
```

Episodes remain:

```text
podcast:item:guid:{rssItemGuid}
```

The i-tag hint remains the feed URL for episode comments, matching the existing `PodcastProvider`.

This keeps LISTEN comments interoperable with the existing podcast/comment subscription design.

## Error Handling

- Invalid LISTEN URL: fall through to existing provider parsing.
- RSS fetch failure: navigate to feed path and let the existing podcast feed UI show its error state.
- RSS parse failure: same as RSS fetch failure.
- RSS item missing: navigate to feed path and show `listen_episode_not_found` warning.
- RSS item has no guid: use the existing fallback `guid || enclosureUrl` when building the episode `ContentId`.
- `?t=` is preserved only when it parses to a positive number.

## Tests

Add targeted tests for:

- `PodcastProvider.parseUrl()` accepts LISTEN podcast page URLs.
- `PodcastProvider.parseUrl()` accepts LISTEN RSS URLs.
- LISTEN episode URL parsing extracts podcast slug, episode slug, canonical feed URL, normalized episode URL, and optional `t`.
- RSS parsing includes item `<link>` in returned episodes.
- LISTEN episode resolver redirects to the podcast episode path when `item.link` matches.
- LISTEN episode resolver falls back to the feed path with `warning=listen_episode_not_found` when no item matches.
- `?t=` is preserved on successful episode redirect.

Existing podcast feed and audio tests should continue to pass unchanged.

## Out of Scope

- LISTEN oEmbed iframe rendering.
- LISTEN-specific `ContentProvider` with `platform: 'listen'`.
- Parent-to-iframe playback control.
- LISTEN transcript or chapter UI beyond data already present in RSS.
- Automatic matching by episode title when RSS item links are missing.

## Implementation Notes

Keep the first implementation narrow. The important user-visible behavior is that LISTEN URLs enter the existing podcast RSS flow and episode URLs land on the corresponding Resonote podcast episode page when RSS contains a matching item link.

If a later iteration needs LISTEN branding or oEmbed display, it can add a separate LISTEN provider without changing the RSS identity chosen here.
