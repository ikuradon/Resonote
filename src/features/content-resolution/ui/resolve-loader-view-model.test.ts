import { describe, expect, it, vi } from 'vitest';

const { resolveEncodedNavigationMock } = vi.hoisted(() => ({
  resolveEncodedNavigationMock: vi.fn(async () => ({
    path: '/podcast/feed/abc123'
  }))
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: (key: string) => key
}));

vi.mock('../application/resolve-encoded-navigation.js', () => ({
  resolveEncodedNavigation: resolveEncodedNavigationMock
}));

import { createResolveLoaderViewModel } from './resolve-loader-view-model.svelte.js';

describe('createResolveLoaderViewModel', () => {
  describe('initial state', () => {
    it('status starts as loading', () => {
      resolveEncodedNavigationMock.mockReturnValue(new Promise(() => {}));
      const vm = createResolveLoaderViewModel({
        getEncodedUrl: () => 'someEncodedUrl',
        navigate: vi.fn()
      });
      expect(vm.status).toBe('loading');
    });

    it('errorMessage starts as empty string', () => {
      resolveEncodedNavigationMock.mockReturnValue(new Promise(() => {}));
      const vm = createResolveLoaderViewModel({
        getEncodedUrl: () => 'someEncodedUrl',
        navigate: vi.fn()
      });
      expect(vm.errorMessage).toBe('');
    });
  });

  describe('public API shape', () => {
    it('exposes status getter', () => {
      const vm = createResolveLoaderViewModel({
        getEncodedUrl: () => '',
        navigate: vi.fn()
      });
      expect('status' in vm).toBe(true);
    });

    it('exposes errorMessage getter', () => {
      const vm = createResolveLoaderViewModel({
        getEncodedUrl: () => '',
        navigate: vi.fn()
      });
      expect('errorMessage' in vm).toBe(true);
    });
  });
});
