import type { ContentId } from '$shared/content/types.js';
// eslint-disable-next-line no-restricted-imports -- encodeContentLink is a pure encoding function with no infra side effects
import { encodeContentLink } from '$shared/nostr/content-link.js';

export function buildDefaultShareContent(openUrl: string, pageUrl: string): string {
  return `${openUrl}\n${pageUrl}`;
}

export function buildResonoteShareUrl(
  origin: string,
  contentId: ContentId,
  relays: string[],
  positionSec?: number
): string {
  const encoded = encodeContentLink(contentId, relays);
  const base = `${origin}/${encoded}`;
  return positionSec && positionSec > 0 ? `${base}?t=${positionSec}` : base;
}
