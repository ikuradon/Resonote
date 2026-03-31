import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchLatestMock, saveRelayListMock } = vi.hoisted(() => {
  return {
    fetchLatestMock: vi.fn(async () => null as Record<string, unknown> | null),
    saveRelayListMock: vi.fn(async () => {})
  };
});

vi.mock('$shared/nostr/store.js', () => ({
  fetchLatest: fetchLatestMock
}));

vi.mock('$shared/nostr/events.js', () => ({
  RELAY_LIST_KIND: 10002
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay.damus.io', 'wss://relay.nostr.band']
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: (key: string) => key
}));

import type { RelayState } from '../domain/relay-model.js';
import { createRelaySettingsViewModel } from './relay-settings-view-model.svelte.js';

const liveRelays: RelayState[] = [
  { url: 'wss://relay.damus.io', state: 'connected' },
  { url: 'wss://relay.nostr.band', state: 'connecting' }
];

function makeVm(pubkey: string | null = 'pubkey1') {
  return createRelaySettingsViewModel({
    getPubkey: () => pubkey,
    getLiveRelays: () => liveRelays,
    saveRelayList: saveRelayListMock
  });
}

describe('createRelaySettingsViewModel', () => {
  beforeEach(() => {
    fetchLatestMock.mockReset();
    fetchLatestMock.mockResolvedValue(null);
    saveRelayListMock.mockReset();
  });

  describe('initial state', () => {
    it('entries starts empty', () => {
      const vm = makeVm();
      expect(vm.entries).toEqual([]);
    });

    it('dirty starts false', () => {
      const vm = makeVm();
      expect(vm.dirty).toBe(false);
    });

    it('saving starts false', () => {
      const vm = makeVm();
      expect(vm.saving).toBe(false);
    });

    it('savedOk starts false', () => {
      const vm = makeVm();
      expect(vm.savedOk).toBe(false);
    });

    it('addUrl starts empty', () => {
      const vm = makeVm();
      expect(vm.addUrl).toBe('');
    });

    it('addError starts empty', () => {
      const vm = makeVm();
      expect(vm.addError).toBe('');
    });

    it('relayLoading is true initially (relayQuery not yet set by $effect)', () => {
      // In test environment $effect does not run, so relayQuery stays undefined → loading=true
      const vm = makeVm();
      expect(vm.relayLoading).toBe(true);
    });

    it('noRelayList is false initially (relayQuery not set by $effect)', () => {
      // In test environment $effect does not run, so relayQuery stays undefined → noRelayList=false
      const vm = makeVm();
      expect(vm.noRelayList).toBe(false);
    });
  });

  describe('addUrl setter/getter', () => {
    it('can set addUrl', () => {
      const vm = makeVm();
      vm.addUrl = 'wss://relay.example.com';
      expect(vm.addUrl).toBe('wss://relay.example.com');
    });
  });

  describe('setupDefaults', () => {
    it('populates entries with default relays', () => {
      const vm = makeVm();
      vm.setupDefaults();
      expect(vm.entries.length).toBe(2);
      expect(vm.entries[0].url).toBe('wss://relay.damus.io');
      expect(vm.entries[0].read).toBe(true);
      expect(vm.entries[0].write).toBe(true);
    });

    it('sets dirty to true', () => {
      const vm = makeVm();
      vm.setupDefaults();
      expect(vm.dirty).toBe(true);
    });
  });

  describe('toggleRead', () => {
    it('toggles read flag for entry at index', () => {
      const vm = makeVm();
      vm.setupDefaults();
      const originalRead = vm.entries[0].read;
      vm.toggleRead(0);
      expect(vm.entries[0].read).toBe(!originalRead);
    });

    it('sets dirty to true', () => {
      const vm = makeVm();
      vm.setupDefaults();
      vm.toggleRead(0);
      expect(vm.dirty).toBe(true);
    });
  });

  describe('toggleWrite', () => {
    it('toggles write flag for entry at index', () => {
      const vm = makeVm();
      vm.setupDefaults();
      const originalWrite = vm.entries[0].write;
      vm.toggleWrite(0);
      expect(vm.entries[0].write).toBe(!originalWrite);
    });
  });

  describe('removeRelay', () => {
    it('removes entry at given index', () => {
      const vm = makeVm();
      vm.setupDefaults();
      const firstUrl = vm.entries[0].url;
      vm.removeRelay(0);
      expect(vm.entries.every((e) => e.url !== firstUrl)).toBe(true);
    });

    it('sets dirty to true', () => {
      const vm = makeVm();
      vm.setupDefaults();
      vm.removeRelay(0);
      expect(vm.dirty).toBe(true);
    });
  });

  describe('addRelay', () => {
    it('adds valid wss URL', () => {
      const vm = makeVm();
      vm.addUrl = 'wss://new.relay.com';
      vm.addRelay();
      expect(vm.entries.some((e) => e.url === 'wss://new.relay.com')).toBe(true);
      expect(vm.addUrl).toBe('');
      expect(vm.addError).toBe('');
    });

    it('sets addError for invalid URL', () => {
      const vm = makeVm();
      vm.addUrl = 'http://not-a-relay.com';
      vm.addRelay();
      expect(vm.addError).toBe('settings.relays.invalid_url');
      expect(vm.entries.length).toBe(0);
    });

    it('does not duplicate existing relay', () => {
      const vm = makeVm();
      vm.setupDefaults();
      const countBefore = vm.entries.length;
      vm.addUrl = 'wss://relay.damus.io';
      vm.addRelay();
      expect(vm.entries.length).toBe(countBefore);
    });

    it('adds ws:// URL as valid', () => {
      const vm = makeVm();
      vm.addUrl = 'ws://local.relay.com';
      vm.addRelay();
      expect(vm.entries.some((e) => e.url === 'ws://local.relay.com')).toBe(true);
    });
  });

  describe('handleAddKeydown', () => {
    it('calls addRelay on Enter', () => {
      const vm = makeVm();
      vm.addUrl = 'wss://key.relay.com';
      const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;
      vm.handleAddKeydown(event);
      expect(vm.entries.some((e) => e.url === 'wss://key.relay.com')).toBe(true);
    });

    it('does nothing on non-Enter key', () => {
      const vm = makeVm();
      vm.addUrl = 'wss://key.relay.com';
      const event = { key: 'a', preventDefault: vi.fn() } as unknown as KeyboardEvent;
      vm.handleAddKeydown(event);
      expect(vm.entries.length).toBe(0);
    });
  });

  describe('resetToDefaults', () => {
    it('resets entries to default relays and sets dirty', () => {
      const vm = makeVm();
      vm.addUrl = 'wss://custom.relay.com';
      vm.addRelay();
      vm.resetToDefaults();
      expect(vm.entries.length).toBe(2);
      expect(vm.dirty).toBe(true);
    });
  });

  describe('connectionStateFor', () => {
    it('returns state for known relay', () => {
      const vm = makeVm();
      expect(vm.connectionStateFor('wss://relay.damus.io')).toBe('connected');
    });

    it('returns null for unknown relay', () => {
      const vm = makeVm();
      expect(vm.connectionStateFor('wss://unknown.relay.com')).toBeNull();
    });
  });

  describe('save', () => {
    it('calls saveRelayList with entries', async () => {
      const vm = makeVm();
      vm.setupDefaults();
      await vm.save();
      expect(saveRelayListMock).toHaveBeenCalledWith(vm.entries);
    });

    it('sets savedOk to true on success', async () => {
      const vm = makeVm();
      vm.setupDefaults();
      await vm.save();
      expect(vm.savedOk).toBe(true);
    });

    it('resets dirty to false on success', async () => {
      const vm = makeVm();
      vm.setupDefaults();
      await vm.save();
      expect(vm.dirty).toBe(false);
    });

    it('does nothing when entries is empty', async () => {
      const vm = makeVm();
      await vm.save();
      expect(saveRelayListMock).not.toHaveBeenCalled();
    });
  });
});
