import { openSidePanel } from './shared/compat.js';
import { SIDEPANEL_PORT_NAME } from './shared/constants.js';
import type { ContentId } from '$shared/content/types.js';
import type { ExtensionMessage } from './shared/messages.js';
import { isSafeUrl, isValidContentId } from './shared/messages.js';

interface TabState {
  contentId: ContentId;
  siteUrl: string;
}

const tabStates = new Map<number, TabState>();
let activeTabId: number | null = null;
let sidePanelPort: chrome.runtime.Port | null = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === SIDEPANEL_PORT_NAME) {
    sidePanelPort = port;
    port.onDisconnect.addListener(() => {
      sidePanelPort = null;
    });
  }
});

function forwardToSidePanel(message: unknown): void {
  sidePanelPort?.postMessage(message);
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'resonote:site-detected': {
      if (!tabId || !isSafeUrl(message.siteUrl) || !isValidContentId(message.contentId)) return;
      tabStates.set(tabId, {
        contentId: message.contentId,
        siteUrl: message.siteUrl
      });
      activeTabId = tabId;
      openSidePanel(tabId);
      forwardToSidePanel(message);
      break;
    }

    case 'resonote:playback-state': {
      if (tabId === activeTabId) {
        forwardToSidePanel(message);
      }
      break;
    }

    case 'resonote:site-lost': {
      if (tabId) {
        tabStates.delete(tabId);
        if (tabId === activeTabId) {
          activeTabId = null;
          forwardToSidePanel(message);
        }
      }
      break;
    }

    case 'resonote:seek': {
      if (activeTabId) {
        chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
      }
      break;
    }

    case 'resonote:open-content': {
      if (tabId && isSafeUrl(message.siteUrl) && isValidContentId(message.contentId)) {
        chrome.tabs.update(tabId, { url: message.siteUrl });
        tabStates.set(tabId, {
          contentId: message.contentId,
          siteUrl: message.siteUrl
        });
        activeTabId = tabId;
        openSidePanel(tabId);
      }
      break;
    }
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (tabStates.has(tabId)) {
    activeTabId = tabId;
    const state = tabStates.get(tabId)!;
    forwardToSidePanel({
      type: 'resonote:site-detected',
      contentId: state.contentId,
      siteUrl: state.siteUrl
    });
  } else {
    activeTabId = null;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && tabStates.has(tabId)) {
    // Tab navigated — remove stale state
    tabStates.delete(tabId);
    if (tabId === activeTabId) {
      activeTabId = null;
      forwardToSidePanel({ type: 'resonote:site-lost' });
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  if (tabId === activeTabId) {
    activeTabId = null;
  }
});
