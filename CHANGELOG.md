# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-03-28

### Added

- Initial release of Resonote: Nostr-based media comment sync system (NIP-73 + NIP-22 + NIP-25)
- Spotify content provider with web embed playback
- YouTube content provider with IFrame Player API integration
- SoundCloud content provider with oEmbed URL resolution and Sets (playlist) support
- Vimeo, Mixcloud, Spreaker, Niconico, Podbean content providers with web embeds
- Audio direct URL content provider with metadata parsing (ID3v2/Vorbis/FLAC)
- Podcast RSS feed content provider with episode resolution and NIP-B0 bookmarks
- Extension-only content providers: Netflix, Prime Video, Disney+, Apple Music, Fountain.fm, AbemaTV, TVer, U-NEXT
- Apple Podcasts URL support via iTunes Lookup API
- Browser extension infrastructure (Chrome/Firefox Manifest V3) with content scripts and side panel
- Hono-based server API on Cloudflare Pages (adapter-cloudflare) with typed routes and middleware
- Server API routes: podcast/resolve, oembed/resolve, youtube/feed, podbean/resolve, system/pubkey
- Cache middleware and error-handler middleware for server API
- SSRF protection via `safeFetch()` with redirect hop validation
- Threaded reply support for comments (NIP-22)
- NIP-09 event deletion with pubkey verification and offline reconciliation
- Custom emoji reactions with emoji picker and emoji set management
- Unified Nostr Events DB with IndexedDB persistent caching (`cachedFetchById`)
- NoteInput component with autocomplete and hashtag support
- Virtual scroll list with prefix sum binary search and ResizeObserver height caching
- Keyboard shortcuts for comments, tabs, and playback control
- Content Info tab with metadata display, bookmark, and share functionality
- Flow tab with jump-to-now overlay and directional indicator
- Copy comment link and scroll-to-comment from URL hash
- ReadOnly auth detection with `canWrite`/`hasNip44` getters and UI restrictions
- Mute settings with blur on SPA navigation for readOnly users
- Follow/unfollow and Web of Trust (WoT) support
- Relay list management with edit controls
- Notification feed with classifier and display helpers
- Profile page with header view model
- Sharing feature with share-link generation
- Embed loading overlays with brand icons and waveform animation
- Delete confirmation dialog
- Two-column layout for player page (player left, comments right)
- Header nav redesign with Resonote branding and mobile-first login
- Paper airplane fly animation for send button
- Component playbook page for interactive UI testing (dev only)
- DEV-only test page with playback simulator and event generator
- Internationalization: Japanese, English, Kyoto dialect, Osaka dialect, villainess language (悪役令嬢語)
- Logo and favicon with speech-bubble note cutout design
- OGP metadata for `resonote.cc` production domain
- Cloudflare Pages deployment with GitHub Actions CI (lint, test, E2E, build)
- Preview deploy workflow for PR environments with automatic cleanup
- E2E tests with Playwright (Chromium) and 4-way CI sharding
- Structure guard tests to prevent legacy import regressions
- relay-session integration tests with MockPool WebSocket mock

### Fixed

- SoundCloud embed using permalink URL instead of oEmbed-resolved API URL
- Podbean `seekTo()` seconds/milliseconds mismatch and `getDuration()` NaN before playback
- Spreaker widget not re-scanning on SPA re-navigation (script remove + re-add)
- SPA navigation iframe cleanup causing `postMessage` errors (try-catch guard)
- Cache API undefined in dev mode (Node.js environment)
- Orphan reply parent fetch with deduplication and deleted-state race handling
- VirtualScrollList zero-height cache entries and pure `$derived` offsets
- Scroll sync on items change to prevent list disappearance
- Jump-to-latest appearing immediately on scroll away
- Action menu and emoji picker not closing on scroll
- Nested reply `isOwn` check and clipboard error handling
- Floating-point comparison and state reset issues in extension content scripts
- NIP-22/73/25/09 tag compliance in event builders
- XML-escaped HTML and CDATA markers in RSS description parsing
- HTML tags in podcast RSS descriptions at server level
- Relay bookmark descriptions containing HTML
- Mute settings blur persistence on SPA navigation for readOnly users
- Settings icon position in header nav
- Preview deploy artifact upload for `.svelte-kit/` directory
- `ContentfulStatusCode` type for Hono `c.json()` overload interop
- Duplicate Cache-Control headers in server route handlers
- Security headers moved from `_headers` to `hooks.server.ts` for SSR routes
- E2E test updates for SoundCloud Sets support and podcast feed UI redesign

### Changed

- Migrated server API from Cloudflare Functions to Hono on adapter-cloudflare
- Moved SvelteKit entry files to `src/web/` directory
- Replaced emoji-mart packages with `@ikuradon` scoped versions
- Renamed "Open and comment" to "Open original" in all locales
- Redesigned header nav with Resonote branding and mobile-first login flow
- Redesigned podcast feed page UI
- Parallelized E2E tests with `fullyParallel` and 4-way CI sharding
- Optimized WoT restoration with single index scan instead of N lookups
- Auto-resume playback when seeking from comment timestamp
- Simplified preview deploy workflow with deterministic branch names

[Unreleased]: https://github.com/ikuradon/Resonote/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ikuradon/Resonote/releases/tag/v0.1.0
