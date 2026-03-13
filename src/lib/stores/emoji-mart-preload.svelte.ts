/**
 * Preloads emoji-mart data and module so the picker opens instantly.
 * Call `preloadEmojiMart()` early (e.g. on page mount).
 * EmojiPicker reads the cached result via `getEmojiMartModules()`.
 */

let cached: Promise<{ data: unknown; Picker: unknown }> | undefined;

export function preloadEmojiMart(): void {
  if (cached) return;
  cached = Promise.all([
    import('@ikuradon/emoji-kitchen-mart-data').then((m) => m.default),
    import('@ikuradon/emoji-kitchen-mart')
  ]).then(
    ([data, mod]) => ({ data, Picker: mod.Picker }),
    (err) => {
      cached = undefined; // Allow retry on next call
      throw err;
    }
  );
}

export function getEmojiMartModules(): Promise<{ data: unknown; Picker: unknown }> {
  if (!cached) preloadEmojiMart();
  return cached!;
}
