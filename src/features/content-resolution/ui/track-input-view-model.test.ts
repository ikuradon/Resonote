import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveContentNavigationMock, startIntervalTaskMock, stopMock } = vi.hoisted(() => {
  const stopMock = vi.fn();
  return {
    resolveContentNavigationMock: vi.fn(),
    startIntervalTaskMock: vi.fn(() => ({ stop: stopMock, isRunning: () => true })),
    stopMock
  };
});

vi.mock('../application/content-navigation.js', () => ({
  resolveContentNavigation: resolveContentNavigationMock
}));

vi.mock('$shared/browser/interval-task.js', () => ({
  startIntervalTask: startIntervalTaskMock
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: (key: string) => key
}));

import { createTrackInputViewModel } from './track-input-view-model.svelte.js';

describe('createTrackInputViewModel', () => {
  let navigateMock: (path: string) => void;

  beforeEach(() => {
    navigateMock = vi.fn<(path: string) => void>();
    resolveContentNavigationMock.mockReset();
    startIntervalTaskMock.mockClear();
    stopMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeVm() {
    return createTrackInputViewModel({ navigate: navigateMock });
  }

  describe('initial state', () => {
    it('should have empty url and error', () => {
      const vm = makeVm();
      expect(vm.url).toBe('');
      expect(vm.error).toBe('');
    });

    it('should have canSubmit=false when url is empty', () => {
      const vm = makeVm();
      expect(vm.canSubmit).toBe(false);
    });

    it('should have placeholderVisible=true initially', () => {
      const vm = makeVm();
      expect(vm.placeholderVisible).toBe(true);
    });
  });

  describe('url input', () => {
    it('should update url on set', () => {
      const vm = makeVm();
      vm.url = 'https://example.com';
      expect(vm.url).toBe('https://example.com');
    });

    it('should set canSubmit=true when url has content', () => {
      const vm = makeVm();
      vm.url = 'https://example.com';
      expect(vm.canSubmit).toBe(true);
    });

    it('should be canSubmit=false when url is only whitespace', () => {
      const vm = makeVm();
      vm.url = '   ';
      expect(vm.canSubmit).toBe(false);
    });

    it('should clear error when url is updated', async () => {
      resolveContentNavigationMock.mockResolvedValueOnce({ errorKey: 'track.unsupported' });
      const vm = makeVm();
      vm.url = 'bad-input';
      await vm.submit();
      expect(vm.error).toBe('track.unsupported');

      vm.url = 'new-input';
      expect(vm.error).toBe('');
    });
  });

  describe('submit', () => {
    it('does nothing when resolveContentNavigation returns null', async () => {
      resolveContentNavigationMock.mockResolvedValueOnce(null);
      const vm = makeVm();
      vm.url = 'some-url';
      await vm.submit();
      expect(navigateMock).not.toHaveBeenCalled();
      expect(vm.error).toBe('');
    });

    it('sets error when result has errorKey', async () => {
      resolveContentNavigationMock.mockResolvedValueOnce({ errorKey: 'track.unsupported' });
      const vm = makeVm();
      vm.url = 'not-a-real-url';
      await vm.submit();
      expect(vm.error).toBe('track.unsupported');
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('calls navigate with path after async navigation resolves', async () => {
      resolveContentNavigationMock.mockResolvedValueOnce({ path: '/spotify/track/abc' });
      const vm = makeVm();
      vm.url = 'https://open.spotify.com/track/abc';
      await vm.submit();
      expect(navigateMock).toHaveBeenCalledWith('/spotify/track/abc');
      expect(vm.error).toBe('');
    });

    it('clears error before processing on second submit', async () => {
      resolveContentNavigationMock
        .mockResolvedValueOnce({ errorKey: 'track.unsupported' })
        .mockResolvedValueOnce({ path: '/resolve/encodedurl' });
      const vm = makeVm();
      vm.url = 'bad';
      await vm.submit();
      expect(vm.error).toBe('track.unsupported');

      await vm.submit();
      expect(vm.error).toBe('');
      expect(navigateMock).toHaveBeenCalledWith('/resolve/encodedurl');
    });

    it('passes the current url value to resolveContentNavigation', async () => {
      resolveContentNavigationMock.mockResolvedValueOnce(null);
      const vm = makeVm();
      vm.url = 'https://www.youtube.com/watch?v=xyz';
      await vm.submit();
      expect(resolveContentNavigationMock).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=xyz'
      );
    });

    it('ignores stale navigation when url changes and a later submit resolves first', async () => {
      const first = deferred<{ path: string }>();
      const second = deferred<{ path: string }>();
      resolveContentNavigationMock
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      const vm = makeVm();
      vm.url = 'https://example.com/first';
      const firstSubmit = vm.submit();
      vm.url = 'https://example.com/second';
      const secondSubmit = vm.submit();

      second.resolve({ path: '/resolve/second' });
      await secondSubmit;
      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/resolve/second');

      first.resolve({ path: '/resolve/first' });
      await firstSubmit;
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });

    it('ignores stale navigation when the same url is submitted again before the first result resolves', async () => {
      const first = deferred<{ path: string }>();
      const second = deferred<{ path: string }>();
      resolveContentNavigationMock
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      const vm = makeVm();
      vm.url = 'https://example.com/same';
      const firstSubmit = vm.submit();
      const secondSubmit = vm.submit();

      second.resolve({ path: '/resolve/latest' });
      await secondSubmit;
      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/resolve/latest');

      first.resolve({ path: '/resolve/stale' });
      await firstSubmit;
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('placeholder', () => {
    it('returns first placeholder key as translated string', () => {
      const vm = makeVm();
      // placeholderIndex starts at 0, t() returns the key itself in mock
      expect(vm.placeholder).toBe('track.placeholder.youtube');
    });

    it('placeholderVisible is true initially', () => {
      const vm = makeVm();
      expect(vm.placeholderVisible).toBe(true);
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
