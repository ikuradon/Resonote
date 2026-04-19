## 2026-04-18T13:32:00Z Task: orchestration decision

- Execute Task 1 first, with Task 2 parallel if possible, because Task 1 unblocks Task 7 and file-level enforcement constrains follow-up work.
- Reuse high-level façade policy: `src/shared/auftakt/resonote.ts` remains the only intended app-facing migration façade.

## 2026-04-18T23:08:00Z Task 7 verification decision

- The original plan wording used `pnpm exec vitest run "packages/**/*.test.ts"`, but Vitest v4 positional filter semantics treat the quoted glob as a literal substring in this repo. The stable, machine-executable package contract lane is `pnpm run test:packages`, so the plan QA/DoD commands were updated accordingly.
