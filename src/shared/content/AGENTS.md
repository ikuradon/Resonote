# SHARED CONTENT

## OVERVIEW

Provider parsing/resolution registry. File-per-platform organization; no nested provider subdirs yet.

## WHERE TO LOOK

- Registry: `registry.ts`, `providers.test.ts`
- Generic contracts: `types.ts`, `resolution.ts`, `content-metadata.ts`
- Provider files: `spotify.ts`, `youtube.ts`, `podcast.ts`, etc.
- Resolver extras: `episode-resolver.ts`, `podcast-resolver.ts`

## CONVENTIONS

- One provider = one file + matching test.
- `contentId.type` drives tag/kind generation; keep prefixes consistent.
- Platform quirks belong here, not in feature UI or embeds.

## ANTI-PATTERNS

- No hardcoded provider prefixes outside central helpers.
- No UI/embed state ownership here.
- No provider-specific logic copied into route/view-model code.
