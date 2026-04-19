## 2026-04-18T13:32:00Z Task: open problems

- Need exact file-level allowlist policy for gateway imports: likely `src/shared/auftakt/resonote.ts`, `src/shared/nostr/relays-config.ts`, `src/shared/nostr/cached-query.svelte.ts`, but implementation must verify if any other importer currently exists.
- Need exact ownership/disposition output format for Task 2 so `check:auftakt-migration` can enforce unclassified-file failure.
