# FEATURE SLICES

## OVERVIEW

`src/features/` is the business layer. Most slices follow `domain/`, `application/`, `infra/`, `ui/` with strict directionality.

## WHERE TO LOOK

| Layer          | Rule                            |
| -------------- | ------------------------------- |
| `domain/`      | pure types + pure logic         |
| `application/` | use-case orchestration          |
| `infra/`       | external I/O                    |
| `ui/`          | view-models + Svelte components |

## CONVENTIONS

- `ui → application → domain`, with infra reached through application.
- Cross-feature imports are domain-only; use `$shared` for cross-cutting runtime.
- Heavy slices may get child guides; current hotspots are `comments/` and `content-resolution/`.

## ANTI-PATTERNS

- No infra imports straight from UI.
- No business logic ownership in `src/lib/components`.
- No resurrecting global store patterns to bypass slice boundaries.
