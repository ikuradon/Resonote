import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const {
  authState,
  getEventsDBMock,
  getByPubkeyAndKindMock,
  getAllByKindMock,
  publishFollowMock,
  publishUnfollowMock,
  fetchWotMock,
  logInfoMock
} = vi.hoisted(() => ({
  authState: { pubkey: null as string | null },
  getEventsDBMock: vi.fn(),
  getByPubkeyAndKindMock: vi.fn(),
  getAllByKindMock: vi.fn(),
  publishFollowMock: vi.fn(),
  publishUnfollowMock: vi.fn(),
  fetchWotMock: vi.fn(),
  logInfoMock: vi.fn()
}));

vi.mock('./auth.svelte.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getEventsDB: getEventsDBMock
}));

vi.mock('$features/follows/application/follow-actions.js', () => ({
  publishFollow: publishFollowMock,
  publishUnfollow: publishUnfollowMock
}));

vi.mock('$features/follows/infra/wot-fetcher.js', () => ({
  fetchWot: fetchWotMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }),
  shortHex: (s: string) => s.slice(0, 8)
}));

import {
  clearFollows,
  followUser,
  getFollows,
  loadFollows,
  matchesFilter,
  refreshFollows,
  unfollowUser
} from './follows.svelte.js';

// ---- helpers ----
const MY_PUBKEY = 'aabbccdd'.repeat(8);
const FOLLOW_A = '11111111'.repeat(8);
const FOLLOW_B = '22222222'.repeat(8);
const STRANGER = '33333333'.repeat(8);

function makeKind3Event(pubkey: string, followPubkeys: string[]) {
  return {
    id: `evt-${pubkey.slice(0, 4)}`,
    pubkey,
    kind: 3,
    created_at: 1_000_000,
    content: '',
    tags: followPubkeys.map((pk) => ['p', pk]),
    sig: 'sig'
  };
}

// ---- tests ----

describe('getFollows', () => {
  beforeEach(() => {
    clearFollows();
  });

  it('初期状態が空セットで loading=false', () => {
    const f = getFollows();
    expect(f.follows.size).toBe(0);
    expect(f.wot.size).toBe(0);
    expect(f.loading).toBe(false);
    expect(f.cachedAt).toBeNull();
    expect(f.discoveredCount).toBe(0);
  });
});

describe('clearFollows', () => {
  beforeEach(() => {
    clearFollows();
  });

  it('stateを初期値にリセットする', () => {
    clearFollows();
    const f = getFollows();
    expect(f.follows.size).toBe(0);
    expect(f.wot.size).toBe(0);
    expect(f.loading).toBe(false);
    expect(f.cachedAt).toBeNull();
    expect(f.discoveredCount).toBe(0);
  });
});

describe('matchesFilter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearFollows();
    // loadFollows で follows/wot をセットする
    getByPubkeyAndKindMock.mockResolvedValue(makeKind3Event(MY_PUBKEY, [FOLLOW_A]));
    getAllByKindMock.mockResolvedValue([makeKind3Event(MY_PUBKEY, [FOLLOW_A])]);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });
    await loadFollows(MY_PUBKEY);
  });

  it("filter='all' は誰でも通す", () => {
    expect(matchesFilter(STRANGER, 'all', MY_PUBKEY)).toBe(true);
    expect(matchesFilter(FOLLOW_A, 'all', MY_PUBKEY)).toBe(true);
  });

  it("filter='follows' は自分のpubkeyを通す", () => {
    expect(matchesFilter(MY_PUBKEY, 'follows', MY_PUBKEY)).toBe(true);
  });

  it("filter='follows' はフォロイーを通す", () => {
    expect(matchesFilter(FOLLOW_A, 'follows', MY_PUBKEY)).toBe(true);
  });

  it("filter='follows' は非フォロイーを弾く", () => {
    expect(matchesFilter(STRANGER, 'follows', MY_PUBKEY)).toBe(false);
  });

  it("filter='wot' はフォロイーを通す", () => {
    expect(matchesFilter(FOLLOW_A, 'wot', MY_PUBKEY)).toBe(true);
  });

  it("filter='wot' は自分のpubkeyを通す", () => {
    expect(matchesFilter(MY_PUBKEY, 'wot', MY_PUBKEY)).toBe(true);
  });

  it("filter='wot' は非WoTユーザーを弾く", () => {
    expect(matchesFilter(STRANGER, 'wot', MY_PUBKEY)).toBe(false);
  });

  it('myPubkey=null の場合、自分のキーによる特別扱いなし', () => {
    expect(matchesFilter(MY_PUBKEY, 'follows', null)).toBe(false);
  });
});

describe('loadFollows — DBキャッシュあり', () => {
  beforeEach(() => {
    clearFollows();
    vi.clearAllMocks();
  });

  it('kind:3 キャッシュから follows と wot を復元する', async () => {
    const kind3 = makeKind3Event(MY_PUBKEY, [FOLLOW_A, FOLLOW_B]);
    const allKind3 = [kind3, makeKind3Event(FOLLOW_A, [FOLLOW_B, STRANGER])];
    getByPubkeyAndKindMock.mockResolvedValue(kind3);
    getAllByKindMock.mockResolvedValue(allKind3);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });

    await loadFollows(MY_PUBKEY);

    const f = getFollows();
    expect(f.follows.has(FOLLOW_A)).toBe(true);
    expect(f.follows.has(FOLLOW_B)).toBe(true);
    // WoT には自分、フォロイー、フォロイーのフォロイーが含まれる
    expect(f.wot.has(MY_PUBKEY)).toBe(true);
    expect(f.wot.has(FOLLOW_A)).toBe(true);
    expect(f.wot.has(FOLLOW_B)).toBe(true);
    expect(f.wot.has(STRANGER)).toBe(true);
    expect(f.cachedAt).not.toBeNull();
    expect(f.loading).toBe(false);
  });

  it('WoT にはフォロイーのイベントのみ使用し、非フォロイーのイベントは無視する', async () => {
    const nonFollow = '44444444'.repeat(8);
    const kind3 = makeKind3Event(MY_PUBKEY, [FOLLOW_A]);
    // nonFollow は follows に含まれないので2ホップ対象外
    const allKind3 = [kind3, makeKind3Event(nonFollow, [STRANGER])];
    getByPubkeyAndKindMock.mockResolvedValue(kind3);
    getAllByKindMock.mockResolvedValue(allKind3);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });

    await loadFollows(MY_PUBKEY);

    const f = getFollows();
    // nonFollow のフォロイーである STRANGER は WoT に含まれない
    expect(f.wot.has(STRANGER)).toBe(false);
  });
});

describe('loadFollows — DBキャッシュなし (WoT fetch)', () => {
  beforeEach(() => {
    clearFollows();
    vi.clearAllMocks();
  });

  it('DB に kind:3 がない場合は fetchWot を呼び出す', async () => {
    getByPubkeyAndKindMock.mockResolvedValue(null);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });
    fetchWotMock.mockImplementation(
      async (
        pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        callbacks.onDirectFollows(new Set([FOLLOW_A]));
        return {
          directFollows: new Set([FOLLOW_A]),
          wot: new Set([FOLLOW_A, pubkey])
        };
      }
    );

    await loadFollows(MY_PUBKEY);

    expect(fetchWotMock).toHaveBeenCalledOnce();
    const f = getFollows();
    expect(f.follows.has(FOLLOW_A)).toBe(true);
    expect(f.wot.has(MY_PUBKEY)).toBe(true);
    expect(f.loading).toBe(false);
    expect(f.cachedAt).not.toBeNull();
  });

  it('WoT fetch 完了後は loading=false になる', async () => {
    getByPubkeyAndKindMock.mockResolvedValue(null);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });
    fetchWotMock.mockImplementation(
      async (
        _pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        callbacks.onDirectFollows(new Set());
        return {
          directFollows: new Set(),
          wot: new Set([MY_PUBKEY])
        };
      }
    );

    await loadFollows(MY_PUBKEY);
    // fetchWot 完了後は loading=false
    expect(getFollows().loading).toBe(false);
  });

  it('loading は fetchWot の呼び出し前に true にセットされる', async () => {
    let capturedLoading: boolean | null = null;

    getByPubkeyAndKindMock.mockResolvedValue(null);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });
    fetchWotMock.mockImplementation(
      async (
        _pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        // fetchWot が呼ばれた時点の loading を記録
        capturedLoading = getFollows().loading;
        callbacks.onDirectFollows(new Set());
        return { directFollows: new Set(), wot: new Set([MY_PUBKEY]) };
      }
    );

    await loadFollows(MY_PUBKEY);
    // fetchWot 呼び出し時点で loading=true だった
    expect(capturedLoading).toBe(true);
    // 完了後は false
    expect(getFollows().loading).toBe(false);
  });

  it('onDirectFollows コールバックで follows が更新される', async () => {
    getByPubkeyAndKindMock.mockResolvedValue(null);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });
    fetchWotMock.mockImplementation(
      async (
        pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        callbacks.onDirectFollows(new Set([FOLLOW_A, FOLLOW_B]));
        return {
          directFollows: new Set([FOLLOW_A, FOLLOW_B]),
          wot: new Set([FOLLOW_A, FOLLOW_B, pubkey])
        };
      }
    );

    await loadFollows(MY_PUBKEY);

    const f = getFollows();
    expect(f.follows.has(FOLLOW_A)).toBe(true);
    expect(f.follows.has(FOLLOW_B)).toBe(true);
  });
});

describe('followUser', () => {
  beforeEach(() => {
    clearFollows();
    vi.clearAllMocks();
    authState.pubkey = MY_PUBKEY;
  });

  it('フォロイーをfollows Setに追加する', async () => {
    publishFollowMock.mockResolvedValue(undefined);

    await followUser(FOLLOW_A);

    expect(publishFollowMock).toHaveBeenCalledWith(FOLLOW_A, MY_PUBKEY);
    expect(getFollows().follows.has(FOLLOW_A)).toBe(true);
  });

  it('ログインしていない場合は例外を投げる', async () => {
    authState.pubkey = null;

    await expect(followUser(FOLLOW_A)).rejects.toThrow('Not logged in');
    expect(publishFollowMock).not.toHaveBeenCalled();
  });

  it('複数回 followUser を呼んでも重複しない', async () => {
    publishFollowMock.mockResolvedValue(undefined);

    await followUser(FOLLOW_A);
    await followUser(FOLLOW_A);

    expect(getFollows().follows.has(FOLLOW_A)).toBe(true);
    expect(getFollows().follows.size).toBe(1);
  });
});

describe('unfollowUser', () => {
  beforeEach(async () => {
    clearFollows();
    vi.clearAllMocks();
    authState.pubkey = MY_PUBKEY;
    // 事前に FOLLOW_A をfollowsに追加
    publishFollowMock.mockResolvedValue(undefined);
    await followUser(FOLLOW_A);
  });

  it('follows Setからフォロイーを削除する', async () => {
    publishUnfollowMock.mockResolvedValue(undefined);

    await unfollowUser(FOLLOW_A);

    expect(publishUnfollowMock).toHaveBeenCalledWith(FOLLOW_A, MY_PUBKEY);
    expect(getFollows().follows.has(FOLLOW_A)).toBe(false);
  });

  it('ログインしていない場合は例外を投げる', async () => {
    authState.pubkey = null;

    await expect(unfollowUser(FOLLOW_A)).rejects.toThrow('Not logged in');
    expect(publishUnfollowMock).not.toHaveBeenCalled();
  });

  it('存在しないフォロイーをアンフォローしても follows Setは変わらない', async () => {
    publishUnfollowMock.mockResolvedValue(undefined);

    await unfollowUser(STRANGER);

    expect(getFollows().follows.has(FOLLOW_A)).toBe(true);
    expect(getFollows().follows.has(STRANGER)).toBe(false);
  });
});

describe('refreshFollows', () => {
  beforeEach(() => {
    clearFollows();
    vi.clearAllMocks();
  });

  it('refreshFollows は fetchWot を呼びフォローを更新する', async () => {
    getByPubkeyAndKindMock.mockResolvedValue(null);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });
    fetchWotMock.mockImplementation(
      async (
        pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        callbacks.onDirectFollows(new Set([FOLLOW_A, FOLLOW_B]));
        return {
          directFollows: new Set([FOLLOW_A, FOLLOW_B]),
          wot: new Set([FOLLOW_A, FOLLOW_B, pubkey])
        };
      }
    );

    await refreshFollows(MY_PUBKEY);

    expect(fetchWotMock).toHaveBeenCalledOnce();
    const f = getFollows();
    expect(f.follows.has(FOLLOW_A)).toBe(true);
    expect(f.follows.has(FOLLOW_B)).toBe(true);
    expect(f.loading).toBe(false);
    expect(f.cachedAt).not.toBeNull();
  });

  it('refreshFollows 完了後 loading=false になる', async () => {
    fetchWotMock.mockImplementation(
      async (
        pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        callbacks.onDirectFollows(new Set());
        return { directFollows: new Set(), wot: new Set([pubkey]) };
      }
    );

    await refreshFollows(MY_PUBKEY);

    expect(getFollows().loading).toBe(false);
  });

  it('refreshFollows は loading を true に設定してから開始する', async () => {
    let capturedLoading: boolean | null = null;

    fetchWotMock.mockImplementation(
      async (
        _pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        capturedLoading = getFollows().loading;
        callbacks.onDirectFollows(new Set());
        return { directFollows: new Set(), wot: new Set([MY_PUBKEY]) };
      }
    );

    await refreshFollows(MY_PUBKEY);

    expect(capturedLoading).toBe(true);
  });
});

describe('loadFollows — fetchWot エラーパス', () => {
  beforeEach(() => {
    clearFollows();
    vi.clearAllMocks();
  });

  it('fetchWot がエラーを投げても loading=false にリセットされる', async () => {
    getByPubkeyAndKindMock.mockResolvedValue(null);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });
    fetchWotMock.mockRejectedValue(new Error('network error'));

    await expect(loadFollows(MY_PUBKEY)).rejects.toThrow('network error');

    expect(getFollows().loading).toBe(false);
  });
});

describe('loadFollows — generation キャンセル', () => {
  beforeEach(() => {
    clearFollows();
    vi.clearAllMocks();
  });

  it('clearFollows で generation が進むと fetchWot コールバックは state を更新しない', async () => {
    getByPubkeyAndKindMock.mockResolvedValue(null);
    getEventsDBMock.mockResolvedValue({
      getByPubkeyAndKind: getByPubkeyAndKindMock,
      getAllByKind: getAllByKindMock
    });

    fetchWotMock.mockImplementation(
      async (
        pubkey: string,
        callbacks: { onDirectFollows: (f: Set<string>) => void; isCancelled: () => boolean }
      ) => {
        // clearFollows を呼んで generation を進める
        clearFollows();
        // 古い generation のコールバックを呼んでも state は更新されない
        callbacks.onDirectFollows(new Set([FOLLOW_A]));
        return {
          directFollows: new Set([FOLLOW_A]),
          wot: new Set([FOLLOW_A, pubkey])
        };
      }
    );

    await loadFollows(MY_PUBKEY).catch(() => {});

    // clearFollows で generation が進んだので、onDirectFollows の結果は反映されない
    expect(getFollows().follows.size).toBe(0);
  });
});
