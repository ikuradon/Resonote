# Final Resolution Summary

Completion is based on the approved target resolution table, not on `pnpm outdated` being empty.
Source of truth:

- `docs/superpowers/specs/2026-05-05-pnpm-outdated-update-design.md`
- `docs/superpowers/plans/2026-05-05-pnpm-outdated-update.md`
- `logs/pnpm-update-2026-05-05/pnpm-list-depth-0-final.txt`

## Target resolution check

- `@codecov/vite-plugin`: target `2.0.1`
- `eslint-plugin-simple-import-sort`: target `13.0.0`
- `nano-staged`: target `1.0.2`
- `typescript`: target `6.0.3`
- `vite`: target `8.0.10`
- `@konemono/nostr-login`: target `1.15.7`
- `@tailwindcss/vite`: target `4.2.4`
- `@vitest/coverage-v8`: target `4.1.5`
- `hono`: target `4.12.17`
- `prettier`: target `3.8.3`
- `svelte`: target `5.55.5`
- `svelte-check`: target `4.4.8`
- `tailwindcss`: target `4.2.4`
- `typescript-eslint`: target `8.59.2`
- `vitest`: target `4.1.5`
- `@playwright/test`: target `1.59.1`
- `@scure/base`: target `2.2.0`
- `@sveltejs/kit`: target `2.59.1`
- `@sveltejs/vite-plugin-svelte`: target `7.1.0`
- `@types/node`: target `25.6.0`
- `eslint`: target `10.3.0`
- `eslint-plugin-svelte`: target `3.17.1`
- `globals`: target `17.6.0`
- `wrangler`: target `4.87.0`
- `zod`: target `4.4.3`
- `@types/chrome`: target `0.1.40`
- `esbuild`: target `0.28.0`

## Scope-out rule

If `logs/pnpm-update-2026-05-05/pnpm-outdated-final.txt` contains packages newer than the target resolution above, those newer versions are outside this update scope.
