// @public — Stable API for route/component/feature consumers
/**
 * Clipboard bridge — shared browser helper for writing text to the clipboard.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
