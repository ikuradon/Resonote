import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function directSharedNostrPolicyBlock(): string {
  const source = readFileSync('scripts/check-auftakt-migration.mjs', 'utf8');
  const policyStart = source.indexOf("name: 'direct-shared-nostr-consumer-import'");
  expect(policyStart).toBeGreaterThan(-1);
  const nextPolicyStart = source.indexOf('\n  }\n];', policyStart);
  expect(nextPolicyStart).toBeGreaterThan(policyStart);
  return source.slice(policyStart, nextPolicyStart);
}

describe('check-auftakt-migration semantic guard', () => {
  it('scopes direct shared Nostr executable import guard to app-facing boundary files', () => {
    const policy = directSharedNostrPolicyBlock();

    expect(policy).toContain('event-db');
    expect(policy).toContain('pending-publishes');
    expect(policy).toContain('materialized-latest');
    expect(policy).toContain('fileFilter: isAppFacingRuntimeBoundaryFile');
    expect(policy).not.toContain("'src/shared/nostr/relays-config.ts'");
  });

  it('checks direct runtime package imports for app-facing consumers', () => {
    const source = readFileSync('scripts/check-auftakt-migration.mjs', 'utf8');

    expect(source).toContain("name: 'direct-runtime-package-consumer-import'");
    expect(source).toContain('@auftakt\\/(?:runtime|resonote|adapter-dexie)');
    expect(source).toContain('fileFilter: isAppFacingRuntimeBoundaryFile');
  });

  it('enforces semantic guards during proof runs', () => {
    const source = readFileSync('scripts/check-auftakt-migration.mjs', 'utf8');

    expect(source).toContain(
      "const semanticGuard = process.argv.includes('--semantic-guard') || proof;"
    );
  });

  it('excludes historical superpowers docs from tracked semantic guards', () => {
    const source = readFileSync('scripts/check-auftakt-migration.mjs', 'utf8');

    expect(source).toContain("'docs/superpowers/'");
  });

  it('tracks the residual user-relays alias through its relative contract test', () => {
    const source = readFileSync('scripts/check-auftakt-migration.mjs', 'utf8');

    expect(source).toContain("specifiers: ['$shared/nostr/user-relays.js', './user-relays.js']");
    expect(source).toContain("allowedTestImporters: ['src/shared/nostr/user-relays.test.ts']");
  });
});
