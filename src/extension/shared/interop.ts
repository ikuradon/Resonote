declare const browser: typeof chrome | undefined;

export async function openSidePanel(tabId: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- sidePanel is Chrome-only; undefined in Firefox
  if (chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ tabId });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-optional-chain -- browser is only defined in Firefox; typeof guard required for undeclared global
  } else if (typeof browser !== 'undefined' && browser.action) {
    await browser.action.setBadgeText({ text: 'ON', tabId });
    await browser.action.setBadgeBackgroundColor({ color: '#c9a256', tabId });
  }
}
