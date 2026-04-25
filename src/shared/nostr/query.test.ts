import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchBackwardEventsMock, fetchBackwardFirstMock } = vi.hoisted(() => ({
  fetchBackwardEventsMock: vi.fn(),
  fetchBackwardFirstMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchBackwardEvents: fetchBackwardEventsMock,
  fetchBackwardFirst: fetchBackwardFirstMock
}));

import { fetchBackwardEvents, fetchBackwardFirst } from './query.js';

describe('fetchBackwardEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBackwardEventsMock.mockResolvedValue([]);
    fetchBackwardFirstMock.mockResolvedValue(null);
  });

  it('delegates backward reads to the Auftakt facade', async () => {
    const event = { id: 'event', kind: 1 };
    fetchBackwardEventsMock.mockResolvedValueOnce([event]);

    await expect(fetchBackwardEvents([{ authors: ['pk1'], kinds: [1] }])).resolves.toEqual([event]);
    expect(fetchBackwardEventsMock).toHaveBeenCalledWith(
      [{ authors: ['pk1'], kinds: [1] }],
      undefined
    );
  });

  it('passes relay read options through to the facade', async () => {
    await fetchBackwardEvents([{ ids: ['event'] }], {
      rejectOnError: true,
      timeoutMs: 5_000
    });

    expect(fetchBackwardEventsMock).toHaveBeenCalledWith([{ ids: ['event'] }], {
      rejectOnError: true,
      timeoutMs: 5_000
    });
  });
});

describe('fetchBackwardFirst', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBackwardFirstMock.mockResolvedValue(null);
  });

  it('delegates first backward read to the Auftakt facade', async () => {
    const event = { id: 'first', kind: 1 };
    fetchBackwardFirstMock.mockResolvedValueOnce(event);

    await expect(fetchBackwardFirst([{ ids: ['first'] }])).resolves.toEqual(event);
    expect(fetchBackwardFirstMock).toHaveBeenCalledWith([{ ids: ['first'] }], undefined);
  });
});
