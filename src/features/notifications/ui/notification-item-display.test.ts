import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeNotificationItem,
  getNotificationActorDisplay
} from '$features/notifications/ui/notification-display.js';
import type { Notification } from '$features/notifications/domain/notification-model.js';

const { getProfileDisplayMock, getContentPathFromTagsMock } = vi.hoisted(() => ({
  getProfileDisplayMock: vi.fn(),
  getContentPathFromTagsMock: vi.fn()
}));

vi.mock('$shared/browser/profile.js', () => ({
  getProfileDisplay: getProfileDisplayMock
}));

vi.mock('$shared/nostr/helpers.js', () => ({
  getContentPathFromTags: getContentPathFromTagsMock
}));

describe('getNotificationActorDisplay', () => {
  beforeEach(() => {
    getProfileDisplayMock.mockReset();
    getContentPathFromTagsMock.mockReset();
  });

  it('should build actor display fields from profile state', () => {
    getProfileDisplayMock.mockReturnValue({
      displayName: 'alice',
      picture: 'https://example.com/alice.png',
      profileHref: '/profile/npub1alice'
    });

    expect(getNotificationActorDisplay('f'.repeat(64))).toEqual({
      displayName: 'alice',
      picture: 'https://example.com/alice.png',
      profileHref: '/profile/npub1alice'
    });
  });
});

describe('describeNotificationItem', () => {
  beforeEach(() => {
    getProfileDisplayMock.mockReset();
    getContentPathFromTagsMock.mockReset();

    getProfileDisplayMock.mockReturnValue({
      displayName: 'alice',
      picture: 'https://example.com/alice.png',
      profileHref: '/profile/npub1alice'
    });
  });

  function createNotification(overrides: Partial<Notification> = {}): Notification {
    return {
      id: 'notif-1',
      type: 'reply',
      pubkey: 'f'.repeat(64),
      content: 'hello world',
      createdAt: Math.floor(new Date('2026-01-15T12:00:00Z').getTime() / 1000) - 60,
      tags: [],
      ...overrides
    };
  }

  it('should derive actor, content preview, target preview, and content path', () => {
    getContentPathFromTagsMock.mockReturnValue('/spotify/track/abc123');

    const notification = createNotification({
      targetEventId: 'target-1'
    });

    expect(
      describeNotificationItem(notification, {
        contentPreview: (content) => `preview:${content}`,
        targetTexts: new Map([['target-1', 'target preview']]),
        unread: true
      })
    ).toMatchObject({
      actor: {
        displayName: 'alice',
        picture: 'https://example.com/alice.png'
      },
      contentPath: '/spotify/track/abc123',
      contentPreview: 'preview:hello world',
      targetPreview: 'target preview',
      unread: true,
      label: expect.any(String),
      icon: expect.any(String),
      timeLabel: expect.any(String)
    });
  });

  it('should derive reaction display for reaction notifications', () => {
    const notification = createNotification({
      type: 'reaction',
      content: '+'
    });

    expect(
      describeNotificationItem(notification, {
        contentPreview: (content) => content,
        targetTexts: new Map()
      }).reaction
    ).toEqual({
      type: 'heart',
      content: '❤️'
    });
  });
});
