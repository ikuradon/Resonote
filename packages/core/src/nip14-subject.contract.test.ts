import { describe, expect, it } from 'vitest';

import {
  appendNip14SubjectTag,
  buildNip14ReplySubjectTag,
  buildNip14SubjectTag,
  deriveNip14ReplySubject,
  hasNip14Subject,
  isNip14SubjectLikelyTooLong,
  isNip14SubjectTextEvent,
  NIP14_RECOMMENDED_MAX_SUBJECT_LENGTH,
  NIP14_SUBJECT_TAG,
  NIP14_TEXT_EVENT_KIND,
  parseNip14Subject,
  withNip14SubjectTag
} from './index.js';

describe('NIP-14 subject tags', () => {
  it('builds and parses subject tags for text events', () => {
    expect(buildNip14SubjectTag('  Relay notes  ')).toEqual([NIP14_SUBJECT_TAG, 'Relay notes']);
    expect(
      parseNip14Subject({
        tags: [
          ['t', 'nostr'],
          ['subject', 'Relay notes']
        ]
      })
    ).toBe('Relay notes');
    expect(NIP14_TEXT_EVENT_KIND).toBe(1);
    expect(NIP14_RECOMMENDED_MAX_SUBJECT_LENGTH).toBe(80);
  });

  it('rejects empty subjects and ignores blank parsed tags', () => {
    expect(() => buildNip14SubjectTag('  ')).toThrow('NIP-14 subject must not be empty');
    expect(parseNip14Subject({ tags: [['subject', '  ']] })).toBeNull();
    expect(parseNip14Subject({ tags: [] })).toBeNull();
    expect(hasNip14Subject({ tags: [['subject', 'Status']] })).toBe(true);
    expect(hasNip14Subject({ tags: [['t', 'status']] })).toBe(false);
  });

  it('detects subject-bearing kind:1 text events only', () => {
    expect(
      isNip14SubjectTextEvent({
        kind: 1,
        content: 'body',
        tags: [['subject', 'Status']]
      })
    ).toBe(true);
    expect(
      isNip14SubjectTextEvent({
        kind: 30023,
        content: 'body',
        tags: [['subject', 'Article']]
      })
    ).toBe(false);
    expect(
      isNip14SubjectTextEvent({
        kind: 1,
        content: 'body',
        tags: []
      })
    ).toBe(false);
  });

  it('derives reply subjects without duplicating existing Re prefixes', () => {
    expect(deriveNip14ReplySubject('Relay notes')).toBe('Re: Relay notes');
    expect(deriveNip14ReplySubject(' re: Relay notes ')).toBe('re: Relay notes');
    expect(buildNip14ReplySubjectTag('Relay notes')).toEqual(['subject', 'Re: Relay notes']);
  });

  it('exposes the 80 character recommendation without enforcing it in builders', () => {
    const longSubject = 'x'.repeat(81);
    expect(buildNip14SubjectTag(longSubject)).toEqual(['subject', longSubject]);
    expect(isNip14SubjectLikelyTooLong(longSubject)).toBe(true);
    expect(isNip14SubjectLikelyTooLong('x'.repeat(80))).toBe(false);
    expect(() => isNip14SubjectLikelyTooLong('subject', 0)).toThrow(
      'NIP-14 subject max length must be a positive integer'
    );
  });

  it('adds one subject tag without mutating existing tags', () => {
    const tags = [
      ['subject', 'old'],
      ['p', 'pubkey']
    ] as const;

    expect(appendNip14SubjectTag(tags, 'New subject')).toEqual([
      ['p', 'pubkey'],
      ['subject', 'New subject']
    ]);
    expect(tags).toEqual([
      ['subject', 'old'],
      ['p', 'pubkey']
    ]);
  });

  it('rewrites event parameters through a NIP-01-compatible tag list', () => {
    expect(
      withNip14SubjectTag(
        {
          kind: 1,
          content: 'body',
          tags: [
            ['subject', 'old'],
            ['t', 'nostr']
          ]
        },
        'New subject'
      )
    ).toEqual({
      kind: 1,
      content: 'body',
      tags: [
        ['t', 'nostr'],
        ['subject', 'New subject']
      ]
    });
  });
});
