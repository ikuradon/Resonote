import { untrack } from 'svelte';

import { useCachedLatest, type UseCachedLatestResult } from '$shared/auftakt/resonote.js';
import { t } from '$shared/i18n/t.js';
import { RELAY_LIST_KIND } from '$shared/nostr/events.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';

import {
  type ConnectionState,
  parseRelayTags,
  type RelayEntry,
  type RelayState
} from '../domain/relay-model.js';

interface RelaySettingsViewModelOptions {
  getPubkey: () => string | null;
  getLiveRelays: () => RelayState[];
  saveRelayList: (entries: RelayEntry[]) => Promise<void>;
}

function defaultRelayEntries(): RelayEntry[] {
  return DEFAULT_RELAYS.map((url) => ({ url, read: true, write: true }));
}

export function createRelaySettingsViewModel(options: RelaySettingsViewModelOptions) {
  let entries = $state<RelayEntry[]>([]);
  let dirty = $state(false);
  let saving = $state(false);
  let savedOk = $state(false);
  let addUrl = $state('');
  let addError = $state('');

  let relayQuery = $state<UseCachedLatestResult | undefined>(undefined);
  let savedOkTimer: ReturnType<typeof setTimeout> | undefined;
  let relayQuerySettled = $derived(relayQuery?.settlement.phase === 'settled');

  $effect(() => {
    const pubkey = options.getPubkey();

    // Destroy previous query without tracking relayQuery as a dependency.
    // Reading relayQuery here would create a circular dependency:
    // effect writes relayQuery → relayQuery changes → effect re-runs → infinite loop
    untrack(() => {
      relayQuery?.destroy();
      relayQuery = undefined;
    });

    if (!pubkey) return;

    relayQuery = useCachedLatest(pubkey, RELAY_LIST_KIND);
    return () => {
      relayQuery?.destroy();
      relayQuery = undefined;
    };
  });

  $effect(() => {
    return () => {
      if (savedOkTimer) clearTimeout(savedOkTimer);
    };
  });

  let serverEntries = $derived.by(() => {
    if (!relayQuery?.event) return [];
    return parseRelayTags(relayQuery.event.tags);
  });

  $effect(() => {
    if (!dirty && serverEntries.length > 0) {
      entries = [...serverEntries];
    }
  });

  let relayLoading = $derived(!relayQuerySettled);
  let noRelayList = $derived(
    relayQuerySettled === true && !relayQuery?.event && entries.length === 0
  );
  let liveRelays = $derived(options.getLiveRelays());

  function connectionStateFor(url: string): ConnectionState | null {
    return liveRelays.find((r) => r.url === url)?.state ?? null;
  }

  function setupDefaults(): void {
    entries = defaultRelayEntries();
    dirty = true;
  }

  function toggleRead(index: number): void {
    entries[index] = { ...entries[index], read: !entries[index].read };
    dirty = true;
  }

  function toggleWrite(index: number): void {
    entries[index] = { ...entries[index], write: !entries[index].write };
    dirty = true;
  }

  function removeRelay(index: number): void {
    entries = entries.filter((_, i) => i !== index);
    dirty = true;
  }

  function addRelay(): void {
    const url = addUrl.trim();
    if (!/^wss?:\/\/.+/.test(url)) {
      addError = t('settings.relays.invalid_url');
      return;
    }
    addError = '';
    if (!entries.some((e) => e.url === url)) {
      entries = [...entries, { url, read: true, write: true }];
      dirty = true;
    }
    addUrl = '';
  }

  function handleAddKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRelay();
    }
  }

  function resetToDefaults(): void {
    entries = defaultRelayEntries();
    dirty = true;
  }

  async function save() {
    if (saving || entries.length === 0) return;
    saving = true;
    savedOk = false;
    try {
      await options.saveRelayList(entries);
      dirty = false;
      savedOk = true;
      if (savedOkTimer) clearTimeout(savedOkTimer);
      savedOkTimer = setTimeout(() => {
        savedOk = false;
      }, 3000);
    } finally {
      saving = false;
    }
  }

  return {
    get entries() {
      return entries;
    },
    get dirty() {
      return dirty;
    },
    get saving() {
      return saving;
    },
    get savedOk() {
      return savedOk;
    },
    get addUrl() {
      return addUrl;
    },
    set addUrl(value: string) {
      addUrl = value;
    },
    get addError() {
      return addError;
    },
    get relayLoading() {
      return relayLoading;
    },
    get noRelayList() {
      return noRelayList;
    },
    connectionStateFor,
    setupDefaults,
    toggleRead,
    toggleWrite,
    removeRelay,
    addRelay,
    handleAddKeydown,
    resetToDefaults,
    save
  };
}
