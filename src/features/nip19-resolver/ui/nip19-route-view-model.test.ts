import { describe, expect, it, vi } from 'vitest';

const { resolveNip19NavigationMock } = vi.hoisted(() => ({
  resolveNip19NavigationMock: vi.fn(async () => ({
    kind: 'redirect' as const,
    path: '/spotify/track/abc'
  }))
}));

vi.mock('../application/resolve-nip19-navigation.js', () => ({
  resolveNip19Navigation: resolveNip19NavigationMock
}));

import { createNip19RouteViewModel } from './nip19-route-view-model.svelte.js';

describe('createNip19RouteViewModel', () => {
  describe('initial state', () => {
    it('loading starts true', () => {
      resolveNip19NavigationMock.mockReturnValue(new Promise(() => {}));
      const vm = createNip19RouteViewModel({
        getValue: () => 'npub1abc',
        navigate: vi.fn()
      });
      expect(vm.loading).toBe(true);
    });

    it('error starts null', () => {
      resolveNip19NavigationMock.mockReturnValue(new Promise(() => {}));
      const vm = createNip19RouteViewModel({
        getValue: () => 'npub1abc',
        navigate: vi.fn()
      });
      expect(vm.error).toBeNull();
    });

    it('contentPath starts null', () => {
      resolveNip19NavigationMock.mockReturnValue(new Promise(() => {}));
      const vm = createNip19RouteViewModel({
        getValue: () => 'npub1abc',
        navigate: vi.fn()
      });
      expect(vm.contentPath).toBeNull();
    });
  });

  describe('public API shape', () => {
    it('exposes loading getter', () => {
      const vm = createNip19RouteViewModel({
        getValue: () => '',
        navigate: vi.fn()
      });
      expect('loading' in vm).toBe(true);
    });

    it('exposes error getter', () => {
      const vm = createNip19RouteViewModel({
        getValue: () => '',
        navigate: vi.fn()
      });
      expect('error' in vm).toBe(true);
    });

    it('exposes contentPath getter', () => {
      const vm = createNip19RouteViewModel({
        getValue: () => '',
        navigate: vi.fn()
      });
      expect('contentPath' in vm).toBe(true);
    });
  });
});
