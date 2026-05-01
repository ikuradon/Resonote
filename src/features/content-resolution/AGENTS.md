# FEATURES / CONTENT-RESOLUTION

## OVERVIEW

URL/content identifier resolution, embed-specific orchestration, and provider-facing application helpers.

## WHERE TO LOOK

- `application/resolve-*.ts` — input-specific resolvers
- `domain/` — metadata/content contracts
- `infra/` — external fetch/oEmbed helpers
- `ui/` — resolved content view models and embed orchestration

## CONVENTIONS

- Provider parsing belongs in `src/shared/content`; feature code stitches that into route/embed workflows.
- Embed view models must preserve seek/updatePlayback/loading-timeout conventions.
- Resolution failures should degrade to explicit unsupported/error states, not silent nulls.

## ANTI-PATTERNS

- No provider prefix hardcoding outside shared content helpers.
- No CSP-sensitive script/embed additions without corresponding docs/headers review.
- No route-specific hacks duplicated across resolvers.
