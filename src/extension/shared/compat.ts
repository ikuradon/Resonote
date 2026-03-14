export async function openSidePanel(tabId: number): Promise<void> {
  if (chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ tabId });
  } else if (typeof browser !== 'undefined' && browser.action) {
    await browser.action.setBadgeText({ text: 'ON', tabId });
    await browser.action.setBadgeBackgroundColor({ color: '#c9a256', tabId });
  }
}

export function isFirefox(): boolean {
  return typeof browser !== 'undefined' && typeof chrome.sidePanel === 'undefined';
}
