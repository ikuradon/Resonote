import { describe, expect, it } from 'vitest';

import { checkNipMatrix } from './check-auftakt-nips.js';

function entry(
  nip: string,
  overrides: Partial<Parameters<typeof checkNipMatrix>[1]['entries'][number]> = {}
) {
  return {
    nip,
    level: 'public',
    status: 'partial',
    owner: 'packages/resonote/src/runtime.ts',
    proof: 'packages/resonote/src/public-api.contract.test.ts',
    priority: 'P1',
    scopeNotes: 'bounded support boundary',
    ...overrides
  };
}

describe('checkNipMatrix', () => {
  it('reports missing NIP classifications', () => {
    const result = checkNipMatrix(
      { nips: ['01', '02'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing matrix entry for NIP-02');
  });

  it('reports stale matrix entries outside the official inventory', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01'), entry('02')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Stale matrix entry for NIP-02');
  });

  it('reports inventory and matrix source metadata drift', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'official', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'local',
        sourceDate: '2026-04-25',
        entries: [entry('01')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Matrix sourceUrl differs from inventory sourceUrl');
    expect(result.errors).toContain('Matrix sourceDate differs from inventory sourceDate');
  });
});
