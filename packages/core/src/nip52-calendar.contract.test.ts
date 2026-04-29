import { describe, expect, it } from 'vitest';

import {
  buildNip52AddressTag,
  buildNip52Calendar,
  buildNip52DateCalendarEvent,
  buildNip52EventRevisionTag,
  buildNip52ParticipantTag,
  buildNip52Rsvp,
  buildNip52TimeCalendarEvent,
  isNip52CalendarEventKind,
  isNip52Date,
  isNip52FreeBusy,
  isNip52RsvpStatus,
  NIP52_CALENDAR_EVENT_KINDS,
  NIP52_CALENDAR_KIND,
  NIP52_CALENDAR_RSVP_KIND,
  NIP52_DATE_BASED_CALENDAR_EVENT_KIND,
  NIP52_FREE_BUSY_VALUES,
  NIP52_RSVP_STATUSES,
  NIP52_TIME_BASED_CALENDAR_EVENT_KIND,
  parseNip52AddressPointer,
  parseNip52Calendar,
  parseNip52CalendarEventMetadata,
  parseNip52DateCalendarEvent,
  parseNip52DayTimestamps,
  parseNip52Participants,
  parseNip52Rsvp,
  parseNip52TimeCalendarEvent
} from './index.js';

describe('NIP-52 calendar events', () => {
  it('builds and parses date-based calendar events', () => {
    const event = buildNip52DateCalendarEvent({
      identifier: 'conference-2026',
      title: 'Nostr Conference',
      content: 'All day event',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      summary: 'Meetup',
      image: 'https://example.com/image.png',
      locations: ['Tokyo', ' Room 1 '],
      geohash: 'xn76',
      participants: [{ pubkey: 'speaker', relayHint: 'wss://relay.example', role: 'speaker' }],
      hashtags: ['nostr'],
      references: ['https://example.com'],
      calendarRequests: [
        {
          kind: 31924,
          pubkey: 'calendar-author',
          identifier: 'meetups',
          relayHint: 'wss://relay.example'
        }
      ],
      tags: [['client', 'resonote']]
    });

    expect(event).toEqual({
      kind: NIP52_DATE_BASED_CALENDAR_EVENT_KIND,
      content: 'All day event',
      tags: [
        ['d', 'conference-2026'],
        ['title', 'Nostr Conference'],
        ['summary', 'Meetup'],
        ['image', 'https://example.com/image.png'],
        ['location', 'Tokyo'],
        ['location', 'Room 1'],
        ['g', 'xn76'],
        ['p', 'speaker', 'wss://relay.example', 'speaker'],
        ['t', 'nostr'],
        ['r', 'https://example.com'],
        ['a', '31924:calendar-author:meetups', 'wss://relay.example'],
        ['start', '2026-05-01'],
        ['end', '2026-05-03'],
        ['client', 'resonote']
      ]
    });

    expect(parseNip52DateCalendarEvent({ ...event, pubkey: 'author', created_at: 123 })).toEqual({
      kind: 31922,
      content: 'All day event',
      metadata: {
        identifier: 'conference-2026',
        title: 'Nostr Conference',
        summary: 'Meetup',
        image: 'https://example.com/image.png',
        locations: ['Tokyo', 'Room 1'],
        geohash: 'xn76',
        participants: [{ pubkey: 'speaker', relayHint: 'wss://relay.example', role: 'speaker' }],
        hashtags: ['nostr'],
        references: ['https://example.com'],
        calendarRequests: [
          {
            kind: 31924,
            pubkey: 'calendar-author',
            identifier: 'meetups',
            value: '31924:calendar-author:meetups',
            relayHint: 'wss://relay.example'
          }
        ],
        deprecatedName: null
      },
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      pubkey: 'author',
      createdAt: 123
    });
  });

  it('builds and parses time-based calendar events with D day tags and time zones', () => {
    const event = buildNip52TimeCalendarEvent({
      identifier: 'call',
      title: 'Call',
      startTimestamp: 1_700_000_000,
      endTimestamp: 1_700_090_000,
      startTzid: 'Asia/Tokyo',
      endTzid: 'America/Costa_Rica',
      participants: [{ pubkey: 'guest', role: 'attendee' }]
    });

    expect(event).toEqual({
      kind: NIP52_TIME_BASED_CALENDAR_EVENT_KIND,
      content: '',
      tags: [
        ['d', 'call'],
        ['title', 'Call'],
        ['p', 'guest', '', 'attendee'],
        ['start', '1700000000'],
        ['end', '1700090000'],
        ['D', '19675'],
        ['D', '19676'],
        ['start_tzid', 'Asia/Tokyo'],
        ['end_tzid', 'America/Costa_Rica']
      ]
    });

    expect(parseNip52TimeCalendarEvent(event)).toEqual({
      kind: 31923,
      content: '',
      metadata: {
        identifier: 'call',
        title: 'Call',
        summary: null,
        image: null,
        locations: [],
        geohash: null,
        participants: [{ pubkey: 'guest', relayHint: null, role: 'attendee' }],
        hashtags: [],
        references: [],
        calendarRequests: [],
        deprecatedName: null
      },
      startTimestamp: 1_700_000_000,
      endTimestamp: 1_700_090_000,
      startTzid: 'Asia/Tokyo',
      endTzid: 'America/Costa_Rica',
      dayTimestamps: [19675, 19676],
      pubkey: null,
      createdAt: null
    });
  });

  it('builds and parses calendars containing date or time calendar event addresses', () => {
    const event = buildNip52Calendar({
      identifier: 'meetups',
      title: 'Meetups',
      content: 'Public meetup calendar',
      events: [
        { kind: 31922, pubkey: 'author', identifier: 'conference-2026' },
        { kind: 31923, pubkey: 'author', identifier: 'call', relayHint: 'wss://relay.example' }
      ]
    });

    expect(event).toEqual({
      kind: NIP52_CALENDAR_KIND,
      content: 'Public meetup calendar',
      tags: [
        ['d', 'meetups'],
        ['title', 'Meetups'],
        ['a', '31922:author:conference-2026'],
        ['a', '31923:author:call', 'wss://relay.example']
      ]
    });
    expect(parseNip52Calendar({ ...event, pubkey: 'calendar-author', created_at: 456 })).toEqual({
      kind: 31924,
      content: 'Public meetup calendar',
      identifier: 'meetups',
      title: 'Meetups',
      events: [
        {
          kind: 31922,
          pubkey: 'author',
          identifier: 'conference-2026',
          value: '31922:author:conference-2026',
          relayHint: null
        },
        {
          kind: 31923,
          pubkey: 'author',
          identifier: 'call',
          value: '31923:author:call',
          relayHint: 'wss://relay.example'
        }
      ],
      pubkey: 'calendar-author',
      createdAt: 456
    });
  });

  it('builds and parses RSVPs with status, free/busy, event revision, and author tags', () => {
    const event = buildNip52Rsvp({
      identifier: 'rsvp-1',
      event: { kind: 31923, pubkey: 'event-author', identifier: 'call' },
      status: 'accepted',
      freeBusy: 'busy',
      content: 'See you there',
      eventId: 'event-id',
      eventRelayHint: 'wss://relay.example',
      authorPubkey: 'event-author',
      authorRelayHint: 'wss://relay.example'
    });

    expect(event).toEqual({
      kind: NIP52_CALENDAR_RSVP_KIND,
      content: 'See you there',
      tags: [
        ['e', 'event-id', 'wss://relay.example'],
        ['a', '31923:event-author:call'],
        ['d', 'rsvp-1'],
        ['status', 'accepted'],
        ['fb', 'busy'],
        ['p', 'event-author', 'wss://relay.example']
      ]
    });
    expect(parseNip52Rsvp({ ...event, pubkey: 'attendee', created_at: 789 })).toEqual({
      kind: 31925,
      content: 'See you there',
      identifier: 'rsvp-1',
      status: 'accepted',
      freeBusy: 'busy',
      event: {
        kind: 31923,
        pubkey: 'event-author',
        identifier: 'call',
        value: '31923:event-author:call',
        relayHint: null
      },
      eventId: 'event-id',
      eventRelayHint: 'wss://relay.example',
      authorPubkey: 'event-author',
      authorRelayHint: 'wss://relay.example',
      pubkey: 'attendee',
      createdAt: 789
    });
  });

  it('omits free/busy on declined RSVP builders and ignores declined fb while parsing', () => {
    const event = buildNip52Rsvp({
      identifier: 'declined',
      event: { kind: 31922, pubkey: 'event-author', identifier: 'holiday' },
      status: 'declined',
      freeBusy: 'free'
    });

    expect(event.tags).toEqual([
      ['a', '31922:event-author:holiday'],
      ['d', 'declined'],
      ['status', 'declined']
    ]);
    expect(
      parseNip52Rsvp({ ...event, tags: [...event.tags, ['fb', 'busy']] })?.freeBusy
    ).toBeNull();
  });

  it('exposes tag helpers, constants, guards, and parsers', () => {
    expect(NIP52_CALENDAR_EVENT_KINDS).toEqual([31922, 31923]);
    expect(NIP52_RSVP_STATUSES).toEqual(['accepted', 'declined', 'tentative']);
    expect(NIP52_FREE_BUSY_VALUES).toEqual(['free', 'busy']);
    expect(isNip52CalendarEventKind(31922)).toBe(true);
    expect(isNip52CalendarEventKind(31924)).toBe(false);
    expect(isNip52RsvpStatus('tentative')).toBe(true);
    expect(isNip52RsvpStatus('maybe')).toBe(false);
    expect(isNip52FreeBusy('free')).toBe(true);
    expect(isNip52Date('2026-05-01')).toBe(true);
    expect(isNip52Date('2026-02-31')).toBe(false);
    expect(buildNip52AddressTag({ kind: 31922, pubkey: 'author', identifier: 'id' })).toEqual([
      'a',
      '31922:author:id'
    ]);
    expect(buildNip52EventRevisionTag('event-id', 'wss://relay.example')).toEqual([
      'e',
      'event-id',
      'wss://relay.example'
    ]);
    expect(buildNip52ParticipantTag({ pubkey: 'pubkey', role: 'host' })).toEqual([
      'p',
      'pubkey',
      '',
      'host'
    ]);
    expect(parseNip52Participants([['p', 'pubkey', 'wss://relay.example', 'host']])).toEqual([
      { pubkey: 'pubkey', relayHint: 'wss://relay.example', role: 'host' }
    ]);
    expect(
      parseNip52DayTimestamps([
        ['D', '2'],
        ['D', '1'],
        ['D', '2']
      ])
    ).toEqual([1, 2]);
    expect(parseNip52AddressPointer('31922:pubkey:identifier:with-colon')).toEqual({
      kind: 31922,
      pubkey: 'pubkey',
      identifier: 'identifier:with-colon',
      value: '31922:pubkey:identifier:with-colon',
      relayHint: null
    });
    expect(
      parseNip52CalendarEventMetadata([
        ['d', 'id'],
        ['name', 'Deprecated Name'],
        ['start', '2026-01-01']
      ])?.title
    ).toBe('Deprecated Name');
  });

  it('rejects invalid builders and malformed parser inputs', () => {
    expect(() =>
      buildNip52DateCalendarEvent({
        identifier: 'id',
        title: 'Title',
        startDate: '2026-02-31'
      })
    ).toThrow('NIP-52 start date must be YYYY-MM-DD');
    expect(() =>
      buildNip52DateCalendarEvent({
        identifier: 'id',
        title: 'Title',
        startDate: '2026-05-02',
        endDate: '2026-05-01'
      })
    ).toThrow('NIP-52 date calendar event end date must be after start date');
    expect(() =>
      buildNip52TimeCalendarEvent({
        identifier: 'id',
        title: 'Title',
        startTimestamp: 2,
        endTimestamp: 1
      })
    ).toThrow('NIP-52 time calendar event end timestamp must be after start timestamp');
    expect(() =>
      buildNip52Calendar({
        identifier: 'calendar',
        title: 'Calendar',
        events: [{ kind: 31924, pubkey: 'author', identifier: 'bad' }]
      })
    ).toThrow('NIP-52 calendar event must reference kind:31922 or kind:31923');
    expect(() =>
      buildNip52Rsvp({
        identifier: 'rsvp',
        event: { kind: 31924, pubkey: 'author', identifier: 'bad' },
        status: 'accepted'
      })
    ).toThrow('NIP-52 RSVP event must reference kind:31922 or kind:31923');
    expect(parseNip52DateCalendarEvent({ kind: 31922, content: '', tags: [] })).toBeNull();
    expect(
      parseNip52TimeCalendarEvent({
        kind: 31923,
        content: '',
        tags: [
          ['d', 'id'],
          ['title', 'Title'],
          ['start', '1']
        ]
      })
    ).toBeNull();
    expect(parseNip52Calendar({ kind: 31924, content: '', tags: [['d', 'id']] })).toBeNull();
    expect(parseNip52Rsvp({ kind: 31925, content: '', tags: [['d', 'id']] })).toBeNull();
  });
});
