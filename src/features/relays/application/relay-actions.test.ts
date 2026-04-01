import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RelayEntry } from '../domain/relay-model.js';

const { castSignedMock, fetchLatestEventMock, setDefaultRelaysMock, getRxNostrMock } = vi.hoisted(
  () => {
    const setDefaultRelaysMock = vi.fn();
    return {
      castSignedMock: vi.fn(async () => {}),
      fetchLatestEventMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
      setDefaultRelaysMock,
      getRxNostrMock: vi.fn(async () => ({ setDefaultRelays: setDefaultRelaysMock }))
    };
  }
);

vi.mock('$shared/nostr/client.js', () => ({
  castSigned: castSignedMock,
  fetchLatestEvent: fetchLatestEventMock,
  getRxNostr: getRxNostrMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  shortHex: (s: string) => s.slice(0, 8)
}));

import { publishRelayList } from './relay-actions.js';

describe('publishRelayList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRxNostrMock.mockResolvedValue({ setDefaultRelays: setDefaultRelaysMock });
  });

  it('calls castSigned with kind:10002 and empty content', async () => {
    const entries: RelayEntry[] = [{ url: 'wss://relay.example.com', read: true, write: true }];
    await publishRelayList(entries);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: 10002,
      content: '',
      tags: [['r', 'wss://relay.example.com']]
    });
  });

  it('maps read+write entry to ["r", url] tag (no marker)', async () => {
    const entries: RelayEntry[] = [{ url: 'wss://a.example.com', read: true, write: true }];
    await publishRelayList(entries);
    expect(castSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [['r', 'wss://a.example.com']] })
    );
  });

  it('maps read-only entry to ["r", url, "read"] tag', async () => {
    const entries: RelayEntry[] = [{ url: 'wss://b.example.com', read: true, write: false }];
    await publishRelayList(entries);
    expect(castSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [['r', 'wss://b.example.com', 'read']] })
    );
  });

  it('maps write-only entry to ["r", url, "write"] tag', async () => {
    const entries: RelayEntry[] = [{ url: 'wss://c.example.com', read: false, write: true }];
    await publishRelayList(entries);
    expect(castSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [['r', 'wss://c.example.com', 'write']] })
    );
  });

  it('maps multiple entries with mixed permissions', async () => {
    const entries: RelayEntry[] = [
      { url: 'wss://rw.example.com', read: true, write: true },
      { url: 'wss://ro.example.com', read: true, write: false },
      { url: 'wss://wo.example.com', read: false, write: true }
    ];
    await publishRelayList(entries);
    expect(castSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [
          ['r', 'wss://rw.example.com'],
          ['r', 'wss://ro.example.com', 'read'],
          ['r', 'wss://wo.example.com', 'write']
        ]
      })
    );
  });

  it('calls rxNostr.setDefaultRelays with extracted URLs', async () => {
    const entries: RelayEntry[] = [
      { url: 'wss://relay1.example.com', read: true, write: true },
      { url: 'wss://relay2.example.com', read: true, write: false }
    ];
    await publishRelayList(entries);
    expect(setDefaultRelaysMock).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });

  it('returns the list of URLs', async () => {
    const entries: RelayEntry[] = [
      { url: 'wss://relay1.example.com', read: true, write: true },
      { url: 'wss://relay2.example.com', read: false, write: true }
    ];
    const result = await publishRelayList(entries);
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
  });

  it('handles empty entry list', async () => {
    const result = await publishRelayList([]);
    expect(castSignedMock).toHaveBeenCalledWith({ kind: 10002, content: '', tags: [] });
    expect(setDefaultRelaysMock).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
  });

  it('propagates errors from castSigned', async () => {
    castSignedMock.mockRejectedValueOnce(new Error('network error'));
    const entries: RelayEntry[] = [{ url: 'wss://relay.example.com', read: true, write: true }];
    await expect(publishRelayList(entries)).rejects.toThrow('network error');
  });
});
