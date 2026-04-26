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
  it('allows facade-owned Auftakt tests to mock shared Nostr bridges', () => {
    const policy = directSharedNostrPolicyBlock();

    expect(policy).toContain("'src/shared/auftakt/cached-read.test.ts'");
    expect(policy).toContain("'src/shared/auftakt/relay-capability.test.ts'");
  });
});
