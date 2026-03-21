import { decodeContentLink, iTagToContentPath } from '$shared/nostr/helpers.js';
import { decodeNip19 } from '$shared/nostr/nip19-decode.js';
import { fetchNostrEvent } from './fetch-event.js';

const VALID_PREFIXES = ['npub1', 'nprofile1', 'nevent1', 'note1', 'ncontent1'];

export type Nip19NavigationErrorKey = 'nip19.invalid' | 'nip19.not_found' | 'nip19.not_comment';

export type ResolveNip19NavigationResult =
  | { kind: 'redirect'; path: string }
  | { kind: 'error'; errorKey: Nip19NavigationErrorKey; contentPath?: string };

export async function resolveNip19Navigation(value: string): Promise<ResolveNip19NavigationResult> {
  if (!value || !VALID_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { kind: 'error', errorKey: 'nip19.invalid' };
  }

  if (value.startsWith('ncontent1')) {
    const decoded = decodeContentLink(value);
    if (!decoded) {
      return { kind: 'error', errorKey: 'nip19.invalid' };
    }

    const { contentId } = decoded;
    return {
      kind: 'redirect',
      path: `/${contentId.platform}/${contentId.type}/${contentId.id}`
    };
  }

  const decoded = decodeNip19(value);
  if (!decoded) {
    return { kind: 'error', errorKey: 'nip19.invalid' };
  }

  switch (decoded.type) {
    case 'npub':
    case 'nprofile':
      return {
        kind: 'redirect',
        path: `/profile/${value}`
      };
    case 'note':
    case 'nevent': {
      try {
        const event = await fetchNostrEvent(
          decoded.eventId,
          'relays' in decoded ? decoded.relays : []
        );
        if (!event) {
          return { kind: 'error', errorKey: 'nip19.not_found' };
        }

        const iTag = event.tags.find((tag) => tag[0] === 'I' && tag[1]);
        const contentPath = iTag ? (iTagToContentPath(iTag[1]) ?? undefined) : undefined;

        if (event.kind !== 1111) {
          return {
            kind: 'error',
            errorKey: 'nip19.not_comment',
            contentPath
          };
        }

        if (contentPath) {
          return {
            kind: 'redirect',
            path: contentPath
          };
        }

        return { kind: 'error', errorKey: 'nip19.not_found' };
      } catch {
        return { kind: 'error', errorKey: 'nip19.not_found' };
      }
    }
  }
}
