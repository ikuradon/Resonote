import { afterNavigate } from '$app/navigation';
import { getAuth } from '$shared/browser/auth.js';
import { isExtensionMode } from '$shared/browser/extension.js';
import { getFollows } from '$shared/browser/follows.js';
import { getLocale, setLocale } from '$shared/browser/locale.js';
import {
  destroyRelayStatus,
  getRelays,
  initRelayStatus,
  isTransitionalState
} from '$shared/browser/relays.js';
import { initApp } from '$appcore/bootstrap/init-app.js';
import { manageNotifications } from '$appcore/bootstrap/init-notifications.svelte.js';

export function createAppShellViewModel() {
  const auth = getAuth();

  let menuOpen = $state(false);

  afterNavigate(() => {
    menuOpen = false;
  });

  let relayList = $derived(getRelays());
  let relayConnectedCount = $derived(
    relayList.filter((relay) => relay.state === 'connected').length
  );
  let anyRelayConnecting = $derived(relayList.some((relay) => isTransitionalState(relay.state)));
  let showRelayWarning = $derived(
    relayList.length > 0 && relayConnectedCount === 0 && !anyRelayConnecting
  );
  let localeCode = $derived(getLocale());
  let extensionMode = $derived(isExtensionMode());

  $effect(() => {
    document.documentElement.lang = localeCode;
  });

  $effect(() => {
    return manageNotifications(auth.loggedIn, auth.initialized, auth.pubkey, getFollows().follows);
  });

  $effect(() => {
    initApp();
  });

  $effect(() => {
    if (!auth.loggedIn) {
      destroyRelayStatus();
      return;
    }

    void initRelayStatus();
    return () => {
      destroyRelayStatus();
    };
  });

  function openMenu(): void {
    menuOpen = true;
  }

  function closeMenu(): void {
    menuOpen = false;
  }

  function selectLocale(code: string): void {
    setLocale(code as Parameters<typeof setLocale>[0]);
    menuOpen = false;
  }

  return {
    auth,
    get menuOpen() {
      return menuOpen;
    },
    get relayList() {
      return relayList;
    },
    get relayConnectedCount() {
      return relayConnectedCount;
    },
    get showRelayWarning() {
      return showRelayWarning;
    },
    get localeCode() {
      return localeCode;
    },
    get extensionMode() {
      return extensionMode;
    },
    openMenu,
    closeMenu,
    selectLocale
  };
}
