import { RESONOTE_ACTION_ATTR, RESONOTE_EXT_ATTR } from '../shared/constants.js';
import { isKnownMessageType } from '../shared/messages.js';

document.documentElement.setAttribute(RESONOTE_EXT_ATTR, 'true');

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName === RESONOTE_ACTION_ATTR) {
      const raw = document.documentElement.getAttribute(RESONOTE_ACTION_ATTR);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (typeof data === 'object' && data !== null && isKnownMessageType(data.type)) {
          chrome.runtime.sendMessage(data).catch(() => {});
        }
      } catch {
        // Ignore malformed data
      }
      document.documentElement.removeAttribute(RESONOTE_ACTION_ATTR);
    }
  }
});

observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: [RESONOTE_ACTION_ATTR]
});
