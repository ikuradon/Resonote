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

- `parseListenUrl(url): ParsedListenUrl | null`
- `buildListenFeedUrl(podcastSlug): string`
- `normalizeListenEpisodeUrl(url): string | null`

```ts
interface ParsedListenUrl {
  feedUrl: string;
  episodeUrl?: string; // normalized canonical LISTEN episode URL used for RSS item link matching
  initialTimeSec?: number;
  initialTimeParam?: string;
}
```

For `https://listen.style/p/{podcastSlug}`, `PodcastProvider.parseUrl()` returns a normal `podcast:feed` `ContentId` with the canonical RSS URL encoded.

For `https://rss.listen.style/p/{podcastSlug}/rss`, existing feed URL matching should continue to return a normal `podcast:feed` `ContentId`.

For `https://listen.style/p/{podcastSlug}/{episodeSlug}`, `PodcastProvider.parseUrl()` must not pretend to know the episode guid. It should still expose the canonical feed URL as the stable fallback target, while the navigation layer starts episode resolution from the original URL.

The input/navigation layer must intercept LISTEN episode URLs before normal provider parsing or navigation starts:

```ts
if (isListenEpisodeUrl(inputUrl)) {
  const result = await resolveListenEpisodeUrl(inputUrl);
  goto(result.path);
  return;
}

const contentId = parseContentUrl(inputUrl);
```

This avoids an intermediate feed navigation before the final episode redirect.

`isListenEpisodeUrl()` should be implemented as a thin wrapper around `parseListenUrl()` rather than a separate regular expression, so interception behavior cannot diverge from parser behavior:

```ts
function isListenEpisodeUrl(url: string): boolean {
  return parseListenUrl(url)?.episodeUrl != null;
}
```

### LISTEN URL Normalization Rules

For episode matching, normalize both the user-provided LISTEN episode URL and RSS item `link` as follows:

- Accept only `listen.style` as the host.
- Canonicalize the scheme to `https`.
- Lowercase the host.
- Remove query parameters and hash fragments before matching.
- Remove a single trailing slash from the path.
- Match only `/p/{podcastSlug}/{episodeSlug}`.
- Do not lowercase path segments.
- Return `null` for malformed or unsupported LISTEN URLs.

The `t` query parameter is parsed separately from the matching URL and never participates in link comparison.

Slug handling:

- Extract slugs from URL path segments, not from raw string slicing.
- Reject decoded slugs that contain `/`, `?`, `#`, or control characters.
- If percent-decoding a slug segment fails, treat the URL as malformed and return `null`.
- When building RSS URLs or canonical episode URLs, encode slugs with `encodeURIComponent`.
- Do not decode and re-encode for comparison unless both sides use the same canonicalization function.

Supported shape decisions:

- `https://listen.style/p/foo/` is a podcast page URL.
- `https://listen.style/p/foo/bar/` is an episode URL and matches `/p/foo/bar`.
- `https://listen.style/p/foo/bar?foo=1&t=90` is an episode URL and preserves `t=90`.
- `https://listen.style/p/foo/bar#fragment` is an episode URL and ignores the hash for matching.
- `https://listen.style/p/foo/bar//` falls through as unsupported.
- `https://listen.style/p/foo/bar/baz` falls through as unsupported.
- `https://listen.style/u/user` falls through as unsupported.
- `https://listen.style/p/` falls through as unsupported.
- `https://rss.listen.style/p/foo/rss/` is accepted and canonicalized to `https://rss.listen.style/p/foo/rss`.
- `http://listen.style/p/foo` is accepted and canonicalized to `https://listen.style/p/foo`.
- `https://listen.style/p/foo%2Fbar` falls through as unsupported.
- `https://listen.style/p/foo/%2Fbar` falls through as unsupported.
- Invalid percent-encoding in any slug segment falls through as unsupported.

### Episode Resolution

Add an application-level resolver for LISTEN episode URLs:

```ts
resolveListenEpisodeUrl(url): Promise<
  | { kind: 'episode'; path: string; initialTimeSec?: number; initialTimeParam?: string }
  | { kind: 'feed-fallback'; path: string; warning: 'listen_episode_not_found' }
  | { kind: 'error'; path: string; reason: 'listen_feed_unavailable' }
>
```

The resolver:

1. Parses `podcastSlug`, `episodeSlug`, and optional `t`.
2. Builds `feedUrl = https://rss.listen.style/p/{podcastSlug}/rss`.
3. Calls the existing podcast feed resolve flow for that feed URL.
4. Finds the RSS item whose `link` matches `https://listen.style/p/{podcastSlug}/{episodeSlug}` after normalization.
5. Builds `buildEpisodeContentId(feedUrl, item.guid)`. The API normalizes missing RSS guid values to `enclosureUrl`.
6. Returns `/podcast/episode/{contentId.id}`, preserving `?t={seconds}` when present.

When appending `?t=...` to the resolved episode path, use `initialTimeParam`, not `initialTimeSec`, so accepted decimal strings are preserved exactly.

`t` parsing:

- Use the first `t` query parameter.
- Accept only positive decimal values matching `/^(?:\d+|\d+\.\d+)$/`.
- Drop `t=0`, negative values, scientific notation, non-numeric values, and missing values.
- Preserve the accepted query value as `initialTimeParam` for URL reconstruction.
- Also expose `initialTimeSec = Number(initialTimeParam)` if playback code needs a number.
- Do not impose an upper bound in the first implementation.

If the feed resolves but the item is not found, the resolver returns feed fallback:

```text
/podcast/feed/{base64url(feedUrl)}?warning=listen_episode_not_found
```

If the feed cannot be fetched or parsed, the resolver returns the feed path with the internal `listen_feed_unavailable` result code. Existing podcast feed UI can then show the normal feed error state.

`listen_feed_unavailable` is an internal `reason` for the resolver. It does not need a dedicated user-facing warning in the first implementation, because the feed page already has an error state for fetch/parse failures. Use `warning` only for user-facing warning codes.

For `kind: 'error'`, callers should still navigate to `result.path` without adding a warning query parameter. The existing podcast feed error state handles user-facing feedback.

Resolver failures may log diagnostic reasons such as `feed_unavailable`, `feed_parse_error`, `item_link_missing`, `item_link_mismatch`, or `duplicate_match`, but only allowlisted warning codes may be surfaced in the UI.

### API Shape

The existing `/api/podcast/resolve` RSS parser currently returns episode fields needed by the feed UI. It should also return each item's source page link.

Add `link?: string` and make `guid` a normalized identity field:

```ts
interface ParsedEpisode {
  title: string;
  guid: string; // raw RSS guid, or enclosureUrl fallback when guid is missing
  rawGuid?: string;
  link?: string;
  enclosureUrl: string;
  pubDate: string;
  duration: number;
  description: string;
}
```

`parseRss()` should read item `<link>` and include it in `episodes`. It should also normalize `guid` at parse time by using `rawGuid || enclosureUrl`, matching the existing bookmark signing fallback. This keeps existing consumers simple while preserving `rawGuid` for debugging and future display if needed.

RSS item parsing rules:

- Trim surrounding whitespace from `<link>` and `<guid>`.
- Treat empty or whitespace-only `<link>` values as missing.
- Treat empty or whitespace-only `<guid>` values as missing.
- If a parser ever returns multiple link values, use the first valid string.
- Do not use Atom alternate links unless the existing parser already handles Atom fields.
- If multiple RSS items match the normalized LISTEN episode URL, use the first item in feed order and optionally log a duplicate-match diagnostic.

### UI Flow

The input/navigation layer should detect LISTEN episode URLs before normal provider parsing or navigation starts. A LISTEN episode URL starts async resolution and then navigates to the resolved path.

Feed fallback warnings should be displayed on the feed page. Use a lightweight existing notification style where possible:

- Prefer toast if there is already a route-safe toast utility in the content-resolution flow.
- Otherwise show an inline warning above the feed list.

Warning codes must be allowlisted. The UI must not render arbitrary warning query parameter values.

```ts
const warningTextByCode = {
  listen_episode_not_found:
    '指定された LISTEN エピソードは RSS 内で見つかりませんでした。一覧から選択してください。'
} as const;
```

Warning text for `listen_episode_not_found`:

```text
指定された LISTEN エピソードは RSS 内で見つかりませんでした。一覧から選択してください。
```

The warning query parameter should be removed or ignored after display if the existing route pattern already has a safe way to do that. If not, leaving it in the URL is acceptable for the first implementation.

If the warning is displayed as a toast, remove the warning query parameter after showing it to avoid repeated notifications on refresh or back navigation. If the warning is displayed inline, leaving the query parameter in the URL is acceptable.

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

The navigation layer should ignore stale resolver results if the input changes or the component unmounts before resolution completes. Use `AbortController` or a monotonically increasing request id.

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
podcast:item:guid:{normalizedRssItemGuid}
```

`normalizedRssItemGuid` is the raw RSS item guid, or the enclosure URL when the guid is missing.

The i-tag hint remains the feed URL for episode comments, matching the existing `PodcastProvider`.

This keeps LISTEN comments interoperable with the existing podcast/comment subscription design.

## Error Handling

- Invalid LISTEN URL: fall through to existing provider parsing.
- RSS fetch failure: navigate to feed path and let the existing podcast feed UI show its error state.
- RSS parse failure: same as RSS fetch failure.
- RSS item missing: navigate to feed path and show `listen_episode_not_found` warning.
- RSS item has no guid: `parseRss()` stores `guid = enclosureUrl` and `rawGuid = undefined`, so episode `ContentId` construction still has a stable value.
- Whitespace-only RSS item guid values are treated as missing.
- `?t=` uses the first query parameter and is preserved only when it matches the positive decimal rule.
- Unsupported LISTEN paths fall through to existing provider parsing.
- Warning query parameters are displayed only through an explicit allowlist.

## Tests

Add targeted tests for:

- `PodcastProvider.parseUrl()` accepts LISTEN podcast page URLs.
- `PodcastProvider.parseUrl()` accepts LISTEN RSS URLs.
- LISTEN episode URL parsing extracts podcast slug, episode slug, canonical feed URL, normalized episode URL, and optional `t`.
- `ParsedListenUrl.episodeUrl` is canonicalized without query parameters or hash fragments.
- `isListenEpisodeUrl()` uses the same parsing behavior as `parseListenUrl()`.
- `normalizeListenEpisodeUrl()` returns `null` for unsupported or malformed URLs.
- `normalizeListenEpisodeUrl()` does not lowercase path segments.
- `http://listen.style/p/foo` is canonicalized to `https://listen.style/p/foo`.
- `https://rss.listen.style/p/foo/rss/` is canonicalized to `https://rss.listen.style/p/foo/rss`.
- LISTEN episode URL is intercepted before normal provider parsing/navigation.
- RSS parsing includes item `<link>` in returned episodes.
- RSS parsing stores `guid = enclosureUrl` when item `<guid>` is missing.
- LISTEN episode resolver redirects to the podcast episode path when `item.link` matches.
- LISTEN episode resolver falls back to the feed path with `warning=listen_episode_not_found` when no item matches.
- `?t=` is preserved on successful episode redirect.
- `?t=abc`, `?t=-1`, `?t=0`, and `?t=1e3` are dropped.
- `?t=90.50` is preserved as `initialTimeParam = '90.50'` and exposed as `initialTimeSec = 90.5`.
- Successful redirects append `?t=90.50`, not `?t=90.5`.
- Multiple `t` params use the first value.
- LISTEN episode URL with query, hash, or trailing slash still matches the RSS item link.
- RSS item link with query, hash, or trailing slash still matches the canonical LISTEN episode URL.
- RSS item without `<link>` falls back to the feed page with warning.
- Whitespace-only `<guid>` falls back to `enclosureUrl`.
- Whitespace-only `<link>` is treated as missing.
- Duplicate matching item links use the first item in feed order.
- Malformed LISTEN paths such as `/p/{podcast}/{episode}/extra` fall through.
- LISTEN episode URLs with multiple trailing slashes fall through.
- Invalid percent-encoding in slug segments returns `null`.
- Decoded slug values containing `/` are rejected.
- Unsupported LISTEN paths such as `/u/{user}` fall through.
- Feed warning UI displays only allowlisted warning codes.
- Resolver error results use internal `reason` and do not create user-facing warning text.
- Resolver `kind: 'error'` navigates to the feed path without adding warning query parameters.
- Toast warning display removes the warning query parameter after display.

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
