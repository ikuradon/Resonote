import { describe, expect, it } from 'vitest';

import { checkNipMatrix } from './check-auftakt-nips.js';

describe('checkNipMatrix', () => {
  it('reports missing NIP classifications', () => {
    const result = checkNipMatrix(
      { nips: ['01', '02'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        entries: [
          {
            nip: '01',
            level: 'internal',
            status: 'partial',
            owner: 'owner',
            proof: 'proof',
            priority: 'P0',
            scopeNotes: 'notes'
          }
        ]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing matrix entry for NIP-02');
  });
});
