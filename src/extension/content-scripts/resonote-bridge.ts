import { RESONOTE_EXT_ATTR, RESONOTE_ACTION_ATTR } from '../shared/constants.js';

document.documentElement.setAttribute(RESONOTE_EXT_ATTR, 'true');

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName === RESONOTE_ACTION_ATTR) {
      const raw = document.documentElement.getAttribute(RESONOTE_ACTION_ATTR);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (typeof data === 'object' && data !== null && typeof data.type === 'string') {
          chrome.runtime.sendMessage(data);
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
