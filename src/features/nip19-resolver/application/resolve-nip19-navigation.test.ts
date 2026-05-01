import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveNip19Navigation } from '$features/nip19-resolver/application/resolve-nip19-navigation.js';

const { decodeContentLinkMock, decodeNip19Mock, iTagToContentPathMock, fetchNostrEventMock } =
  vi.hoisted(() => ({
    decodeContentLinkMock: vi.fn(),
    decodeNip19Mock: vi.fn(),
    iTagToContentPathMock: vi.fn(),
    fetchNostrEventMock: vi.fn()
  }));

vi.mock('$shared/nostr/helpers.js', () => ({
  decodeContentLink: decodeContentLinkMock,
  iTagToContentPath: iTagToContentPathMock
}));

vi.mock('$shared/nostr/nip19-decode.js', () => ({
  decodeNip19: decodeNip19Mock
}));

vi.mock('$features/nip19-resolver/application/fetch-event.js', () => ({
  fetchNostrEvent: fetchNostrEventMock
}));

describe('resolveNip19Navigation', () => {
  beforeEach(() => {
    decodeContentLinkMock.mockReset();
    decodeNip19Mock.mockReset();
    iTagToContentPathMock.mockReset();
    fetchNostrEventMock.mockReset();
  });

  it('should reject unsupported prefixes', async () => {
    await expect(resolveNip19Navigation('hello')).resolves.toEqual({
      kind: 'error',
      errorKey: 'nip19.invalid'
    });
  });

  it('should redirect ncontent links to the resolved content path', async () => {
    decodeContentLinkMock.mockReturnValue({
      contentId: { platform: 'spotify', type: 'track', id: 'abc123' }
    });

    await expect(resolveNip19Navigation('ncontent1example')).resolves.toEqual({
      kind: 'redirect',
      path: '/spotify/track/abc123'
    });
  });

  it('should redirect npub links to the profile route', async () => {
    decodeNip19Mock.mockReturnValue({
      type: 'npub',
      pubkey: 'pubkey'
    });

    await expect(resolveNip19Navigation('npub1example')).resolves.toEqual({
      kind: 'redirect',
      path: '/profile/npub1example'
    });
  });

  it('should redirect nostr:npub URIs through the same profile route', async () => {
    decodeNip19Mock.mockReturnValue({
      type: 'npub',
      pubkey: 'pubkey'
    });

    await expect(resolveNip19Navigation('nostr:npub1example')).resolves.toEqual({
      kind: 'redirect',
      path: '/profile/npub1example'
    });
    expect(decodeNip19Mock).toHaveBeenCalledWith('npub1example');
  });

  it('should reject nostr: URIs with nsec payloads or whitespace', async () => {
    await expect(resolveNip19Navigation('nostr:nsec1example')).resolves.toEqual({
      kind: 'error',
      errorKey: 'nip19.invalid'
    });
    await expect(resolveNip19Navigation('nostr:npub1example trailing')).resolves.toEqual({
      kind: 'error',
      errorKey: 'nip19.invalid'
    });
  });

  it('should redirect note links when the event has a content path tag', async () => {
    decodeNip19Mock.mockReturnValue({
      type: 'note',
      eventId: 'event-id'
    });
    fetchNostrEventMock.mockResolvedValue({
      kind: 1111,
      tags: [['I', 'spotify:track:abc123']],
      content: ''
    });
    iTagToContentPathMock.mockReturnValue('/spotify/track/abc123');

    await expect(resolveNip19Navigation('note1example')).resolves.toEqual({
      kind: 'redirect',
      path: '/spotify/track/abc123#comment-event-id'
    });
  });

  it('should expose a fallback content path when the event is not a comment', async () => {
    decodeNip19Mock.mockReturnValue({
      type: 'nevent',
      eventId: 'event-id',
      relays: ['wss://relay.example']
    });
    fetchNostrEventMock.mockResolvedValue({
      kind: 1,
      tags: [['I', 'youtube:video:xyz']],
      content: ''
    });
    iTagToContentPathMock.mockReturnValue('/youtube/video/xyz');

    await expect(resolveNip19Navigation('nevent1example')).resolves.toEqual({
      kind: 'error',
      errorKey: 'nip19.not_comment',
      contentPath: '/youtube/video/xyz'
    });
  });

  it('should return not_found when the event cannot be fetched', async () => {
    decodeNip19Mock.mockReturnValue({
      type: 'note',
      eventId: 'event-id'
    });
    fetchNostrEventMock.mockResolvedValue(null);

    await expect(resolveNip19Navigation('note1example')).resolves.toEqual({
      kind: 'error',
      errorKey: 'nip19.not_found'
    });
  });
});
