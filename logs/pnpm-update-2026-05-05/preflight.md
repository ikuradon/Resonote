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

- Baseline snapshot time: 2026-05-05 21:44:38 JST
- Artifacts updated at same snapshot:
  - `logs/pnpm-update-2026-05-05/pnpm-outdated-2026-05-05.json`
  - `logs/pnpm-update-2026-05-05/pnpm-list-depth-0-before.txt`

- Command: `pnpm run check`
  - exit status: 0
  - summary:
    svelte-check found 0 errors and 0 warnings

- Command: `pnpm run test:packages`
  - exit status: 0
  - summary:
    Test Files 104 passed (104)
    Tests 594 passed (594)
    Duration 9.35s (transform 7.52s, setup 0ms, import 28.53s, tests 11.19s, environment 66ms)

- Command: `pnpm run build`
  - exit status: 0
  - summary:
    [EVAL] Warning: Use of direct `eval` function is strongly discouraged as it poses security risks and may cause issues with minification.
    [EVAL] Warning: Use of direct `eval` function is strongly discouraged as it poses security risks and may cause issues with minification.
    [PLUGIN_TIMINGS] Warning: Your build spent significant time in plugins. Here is a breakdown:
    ✓ built in 3.33s
    ✓ built in 32ms
    .svelte-kit/output/server/entries/fallbacks/error.svelte.js 0.55 kB │ gzip: 0.35 kB
    [PLUGIN_TIMINGS] Warning: Your build spent significant time in plugins. Here is a breakdown:
    ✓ built in 8.70s
    Run npm run preview to preview your production build locally.
    > Using @sveltejs/adapter-cloudflare
