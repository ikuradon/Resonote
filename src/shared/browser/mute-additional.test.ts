import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, publishMuteListMock } = vi.hoisted(() => ({
  authState: { pubkey: null as string | null },
  publishMuteListMock: vi.fn()
}));

vi.mock('./auth.svelte.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/nostr/client.js', () => ({
  fetchLatestEvent: vi.fn(async () => null)
}));

vi.mock('$features/mute/application/mute-actions.js', () => ({
  publishMuteList: publishMuteListMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }),
  shortHex: (s: string): string => s.slice(0, 8)
}));

vi.mock('$shared/nostr/events.js', () => ({
  MUTE_KIND: 10000
}));

import {
  clearMuteList,
  getMuteList,
  muteUser,
  muteWord,
  unmuteUser,
  unmuteWord
} from './mute.svelte.js';

const MY_PUBKEY = 'aabbccdd'.repeat(8);
const USER_A = '11111111'.repeat(8);

function setupNip44() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      nostr: {
        nip44: {
          encrypt: vi.fn(async () => 'encrypted'),
          decrypt: vi.fn()
        }
      }
    }
  });
}

const originalWindow = globalThis.window;

beforeEach(() => {
  clearMuteList();
  vi.clearAllMocks();
  authState.pubkey = MY_PUBKEY;
  setupNip44();
  publishMuteListMock.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: originalWindow
  });
});

describe('unmuteUser', () => {
  it('removes a muted user from mutedPubkeys', async () => {
    await muteUser(USER_A);
    expect(getMuteList().mutedPubkeys.has(USER_A)).toBe(true);

    await unmuteUser(USER_A);

    expect(getMuteList().mutedPubkeys.has(USER_A)).toBe(false);
  });

  it('does nothing when user is not muted', async () => {
    publishMuteListMock.mockClear();

    await unmuteUser(USER_A);

    expect(publishMuteListMock).not.toHaveBeenCalled();
  });

  it('calls publishMuteList after unmuting', async () => {
    await muteUser(USER_A);
    publishMuteListMock.mockClear();

    await unmuteUser(USER_A);

    expect(publishMuteListMock).toHaveBeenCalledTimes(1);
  });
});

describe('muteWord', () => {
  it('adds a word to mutedWords', async () => {
    await muteWord('badword');

    expect(getMuteList().mutedWords).toContain('badword');
  });

  it('normalizes word to lowercase', async () => {
    await muteWord('BadWord');

    expect(getMuteList().mutedWords).toContain('badword');
  });

  it('does not add empty or whitespace-only words', async () => {
    publishMuteListMock.mockClear();
    await muteWord('   ');

    expect(getMuteList().mutedWords).toEqual([]);
    expect(publishMuteListMock).not.toHaveBeenCalled();
  });

  it('does not add a word that is already muted', async () => {
    await muteWord('spam');
    publishMuteListMock.mockClear();

    await muteWord('spam');

    expect(publishMuteListMock).not.toHaveBeenCalled();
    expect(getMuteList().mutedWords).toEqual(['spam']);
  });

  it('calls publishMuteList after adding a word', async () => {
    publishMuteListMock.mockClear();
    await muteWord('newword');

    expect(publishMuteListMock).toHaveBeenCalledTimes(1);
  });
});

describe('unmuteWord', () => {
  it('removes a word from mutedWords', async () => {
    await muteWord('spam');
    expect(getMuteList().mutedWords).toContain('spam');

    await unmuteWord('spam');

    expect(getMuteList().mutedWords).not.toContain('spam');
  });

  it('does nothing when word is not in mutedWords', async () => {
    publishMuteListMock.mockClear();

    await unmuteWord('nonexistent');

    expect(publishMuteListMock).not.toHaveBeenCalled();
  });

  it('calls publishMuteList after removing a word', async () => {
    await muteWord('spam');
    publishMuteListMock.mockClear();

    await unmuteWord('spam');

    expect(publishMuteListMock).toHaveBeenCalledTimes(1);
  });

  it('matches case-insensitively for removal', async () => {
    await muteWord('spam');

    await unmuteWord('SPAM');

    expect(getMuteList().mutedWords).not.toContain('spam');
  });
});
