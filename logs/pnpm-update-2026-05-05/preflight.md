# Preflight

## Versions

```text
node=v24.15.0
packageManager=pnpm@10.33.2
pnpm=10.33.2
save-exact=undefined
save-prefix=undefined
```

## Guard checks

- Step 1 (`git status --short`): PASS (Task 1 Step 1 実行時は empty output)
- Step 4 (packageManager vs pnpm version): PASS (expected=10.33.2, actual=10.33.2)

## Baseline commands

- Recorded at: 2026-05-05 21:39:07 JST
- Command: `pnpm run check`
  - exit status: 0
  - summary: svelte-check found 0 errors and 0 warnings
- Command: `pnpm run test:packages`
  - exit status: 0
  - summary: Test Files 104 passed (104); Tests 594 passed (594) Duration 9.91s (transform 8.52s, setup 0ms, import 29.89s, tests 11.75s, environment 86ms)
- Command: `pnpm run build`
  - exit status: 0
  - summary: [33m[EVAL] Warning:[0m Use of direct `eval` function is strongly discouraged as it poses security risks and may cause issues with minification.;[33m[PLUGIN_TIMINGS] Warning:[0m Your build spent significant time in plugins. Here is a breakdown: ✓ built in 3.44s;✓ built in 34ms .svelte-kit/output/server/entries/fallbacks/error.svelte.js 0.55 kB │ gzip: 0.35 kB;[33m[PLUGIN_TIMINGS] Warning:[0m Your build spent significant time in plugins. Here is a breakdown: ✓ built in 9.09s;> Using @sveltejs/adapter-cloudflare
