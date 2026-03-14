document.documentElement.setAttribute('data-resonote-ext', 'true');

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName === 'data-resonote-action') {
      const raw = document.documentElement.getAttribute('data-resonote-action');
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        chrome.runtime.sendMessage(data);
      } catch {
        // Ignore malformed data
      }
      document.documentElement.removeAttribute('data-resonote-action');
    }
  }
});

observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-resonote-action']
});
