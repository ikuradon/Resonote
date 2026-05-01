import { describe, expect, it } from 'vitest';

import {
  buildNip53AddressTag,
  buildNip53LiveChat,
  buildNip53LiveStream,
  buildNip53MeetingRoom,
  buildNip53MeetingSpace,
  buildNip53ParticipantTag,
  buildNip53RoomPresence,
  isNip53ActivityStatus,
  isNip53AddressKind,
  isNip53SpaceStatus,
  NIP53_ACTIVITY_STATUSES,
  NIP53_LIVE_CHAT_KIND,
  NIP53_LIVE_STREAM_KIND,
  NIP53_MEETING_SPACE_KIND,
  NIP53_ROOM_PRESENCE_KIND,
  NIP53_SPACE_STATUSES,
  parseNip53Address,
  parseNip53AddressTags,
  parseNip53LiveChat,
  parseNip53LiveStream,
  parseNip53MeetingRoom,
  parseNip53MeetingSpace,
  parseNip53ParticipantTags,
  parseNip53RelaysTag,
  parseNip53RoomPresence
} from './index.js';

describe('NIP-53 live activities', () => {
  it('builds and parses live stream addressable events', () => {
    const event = buildNip53LiveStream({
      identifier: 'demo-cf-stream',
      title: 'Adult Swim Metalocalypse',
      summary: 'Live stream from IPTV-ORG collection',
      image: 'https://i.imgur.com/CaKq6Mt.png',
      hashtags: ['animation', ' iptv '],
      streamingUrl: 'https://example.com/stream.m3u8',
      recordingUrl: 'https://example.com/recording.mp4',
      starts: 1_687_182_672,
      ends: 1_687_186_000,
      status: 'live',
      currentParticipants: 10,
      totalParticipants: 42,
      participants: [
        {
          pubkey: 'host',
          relayHint: 'wss://provider.example',
          role: 'Host',
          proof: 'proof-hex'
        }
      ],
      relays: ['wss://one.example', ' wss://two.example '],
      pinnedEventIds: ['pinned-event'],
      tags: [['client', 'resonote']]
    });

    expect(event).toEqual({
      kind: NIP53_LIVE_STREAM_KIND,
      content: '',
      tags: [
        ['d', 'demo-cf-stream'],
        ['title', 'Adult Swim Metalocalypse'],
        ['summary', 'Live stream from IPTV-ORG collection'],
        ['image', 'https://i.imgur.com/CaKq6Mt.png'],
        ['t', 'animation'],
        ['t', 'iptv'],
        ['streaming', 'https://example.com/stream.m3u8'],
        ['recording', 'https://example.com/recording.mp4'],
        ['starts', '1687182672'],
        ['ends', '1687186000'],
        ['status', 'live'],
        ['current_participants', '10'],
        ['total_participants', '42'],
        ['p', 'host', 'wss://provider.example', 'Host', 'proof-hex'],
        ['relays', 'wss://one.example', 'wss://two.example'],
        ['pinned', 'pinned-event'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip53LiveStream({ ...event, pubkey: 'author', created_at: 123 })).toEqual({
      kind: 30311,
      identifier: 'demo-cf-stream',
      content: '',
      title: 'Adult Swim Metalocalypse',
      summary: 'Live stream from IPTV-ORG collection',
      image: 'https://i.imgur.com/CaKq6Mt.png',
      hashtags: ['animation', 'iptv'],
      streamingUrl: 'https://example.com/stream.m3u8',
      recordingUrl: 'https://example.com/recording.mp4',
      starts: 1_687_182_672,
      ends: 1_687_186_000,
      status: 'live',
      currentParticipants: 10,
      totalParticipants: 42,
      participants: [
        {
          pubkey: 'host',
          relayHint: 'wss://provider.example',
          role: 'Host',
          proof: 'proof-hex'
        }
      ],
      relays: ['wss://one.example', 'wss://two.example'],
      pinnedEventIds: ['pinned-event'],
      pubkey: 'author',
      createdAt: 123
    });
  });

  it('builds and parses live chat messages with activity, parent, and quote tags', () => {
    const event = buildNip53LiveChat({
      activity: {
        kind: 30311,
        pubkey: 'activity-author',
        identifier: 'demo-cf-stream',
        relayHint: 'wss://relay.example',
        marker: 'root'
      },
      content: 'Zaps to live streams is beautiful.',
      parentEventId: 'parent-id',
      parentRelayHint: 'wss://relay.example',
      quoteTags: [['q', 'quoted-event', 'wss://relay.example']]
    });

    expect(event).toEqual({
      kind: NIP53_LIVE_CHAT_KIND,
      content: 'Zaps to live streams is beautiful.',
      tags: [
        ['a', '30311:activity-author:demo-cf-stream', 'wss://relay.example', 'root'],
        ['e', 'parent-id', 'wss://relay.example'],
        ['q', 'quoted-event', 'wss://relay.example']
      ]
    });
    expect(parseNip53LiveChat({ ...event, pubkey: 'chatter', created_at: 456 })).toEqual({
      kind: 1311,
      content: 'Zaps to live streams is beautiful.',
      activity: {
        kind: 30311,
        pubkey: 'activity-author',
        identifier: 'demo-cf-stream',
        value: '30311:activity-author:demo-cf-stream',
        relayHint: 'wss://relay.example',
        marker: 'root'
      },
      parentEventId: 'parent-id',
      parentRelayHint: 'wss://relay.example',
      quoteTags: [['q', 'quoted-event', 'wss://relay.example']],
      pubkey: 'chatter',
      createdAt: 456
    });
  });

  it('builds and parses meeting spaces', () => {
    const event = buildNip53MeetingSpace({
      identifier: 'main-conference-room',
      room: 'Main Conference Hall',
      status: 'open',
      serviceUrl: 'https://meet.example.com/room',
      summary: 'Our primary conference space',
      image: 'https://example.com/room.jpg',
      endpointUrl: 'https://api.example.com/room',
      hashtags: ['conference'],
      providers: [{ pubkey: 'host', relayHint: 'wss://nostr.example.com', role: 'Host' }],
      relays: ['wss://relay1.example', 'wss://relay2.example']
    });

    expect(event).toEqual({
      kind: NIP53_MEETING_SPACE_KIND,
      content: '',
      tags: [
        ['d', 'main-conference-room'],
        ['room', 'Main Conference Hall'],
        ['status', 'open'],
        ['service', 'https://meet.example.com/room'],
        ['summary', 'Our primary conference space'],
        ['image', 'https://example.com/room.jpg'],
        ['endpoint', 'https://api.example.com/room'],
        ['t', 'conference'],
        ['p', 'host', 'wss://nostr.example.com', 'Host'],
        ['relays', 'wss://relay1.example', 'wss://relay2.example']
      ]
    });
    expect(parseNip53MeetingSpace(event)).toEqual({
      kind: 30312,
      identifier: 'main-conference-room',
      room: 'Main Conference Hall',
      status: 'open',
      serviceUrl: 'https://meet.example.com/room',
      content: '',
      summary: 'Our primary conference space',
      image: 'https://example.com/room.jpg',
      endpointUrl: 'https://api.example.com/room',
      hashtags: ['conference'],
      providers: [
        { pubkey: 'host', relayHint: 'wss://nostr.example.com', role: 'Host', proof: null }
      ],
      relays: ['wss://relay1.example', 'wss://relay2.example'],
      pubkey: null,
      createdAt: null
    });
  });

  it('builds and parses meeting room events', () => {
    const event = buildNip53MeetingRoom({
      identifier: 'annual-meeting-2026',
      parentSpace: {
        kind: 30312,
        pubkey: 'space-author',
        identifier: 'main-conference-room',
        relayHint: 'wss://relay.example'
      },
      title: 'Annual Company Meeting',
      summary: 'Yearly company-wide meeting',
      starts: 1_676_262_123,
      ends: 1_676_269_323,
      status: 'planned',
      currentParticipants: 175,
      totalParticipants: 180,
      participants: [{ pubkey: 'speaker', role: 'Speaker' }]
    });

    expect(parseNip53MeetingRoom({ ...event, pubkey: 'author', created_at: 789 })).toEqual({
      kind: 30313,
      identifier: 'annual-meeting-2026',
      parentSpace: {
        kind: 30312,
        pubkey: 'space-author',
        identifier: 'main-conference-room',
        value: '30312:space-author:main-conference-room',
        relayHint: 'wss://relay.example',
        marker: null
      },
      title: 'Annual Company Meeting',
      starts: 1_676_262_123,
      status: 'planned',
      content: '',
      summary: 'Yearly company-wide meeting',
      image: null,
      ends: 1_676_269_323,
      currentParticipants: 175,
      totalParticipants: 180,
      participants: [{ pubkey: 'speaker', relayHint: null, role: 'Speaker', proof: null }],
      pubkey: 'author',
      createdAt: 789
    });
  });

  it('builds and parses room presence events with hand raised flag', () => {
    const event = buildNip53RoomPresence({
      room: {
        kind: 30312,
        pubkey: 'space-author',
        identifier: 'main-conference-room',
        marker: 'root'
      },
      handRaised: true
    });

    expect(event).toEqual({
      kind: NIP53_ROOM_PRESENCE_KIND,
      content: '',
      tags: [
        ['a', '30312:space-author:main-conference-room', '', 'root'],
        ['hand', '1']
      ]
    });
    expect(parseNip53RoomPresence({ ...event, pubkey: 'listener', created_at: 111 })).toEqual({
      kind: 10312,
      room: {
        kind: 30312,
        pubkey: 'space-author',
        identifier: 'main-conference-room',
        value: '30312:space-author:main-conference-room',
        relayHint: null,
        marker: 'root'
      },
      handRaised: true,
      content: '',
      pubkey: 'listener',
      createdAt: 111
    });
  });

  it('exposes tag helpers, relays parser, constants, and guards', () => {
    expect(NIP53_ACTIVITY_STATUSES).toEqual(['planned', 'live', 'ended']);
    expect(NIP53_SPACE_STATUSES).toEqual(['open', 'private', 'closed']);
    expect(isNip53ActivityStatus('live')).toBe(true);
    expect(isNip53ActivityStatus('open')).toBe(false);
    expect(isNip53SpaceStatus('private')).toBe(true);
    expect(isNip53AddressKind(30313)).toBe(true);
    expect(isNip53AddressKind(1311)).toBe(false);
    expect(buildNip53AddressTag({ kind: 30311, pubkey: 'author', identifier: 'id' })).toEqual([
      'a',
      '30311:author:id'
    ]);
    expect(buildNip53ParticipantTag({ pubkey: 'pubkey', role: 'Speaker' })).toEqual([
      'p',
      'pubkey',
      '',
      'Speaker'
    ]);
    expect(
      parseNip53ParticipantTags([['p', 'pubkey', 'wss://relay.example', 'Host', 'proof']])
    ).toEqual([
      { pubkey: 'pubkey', relayHint: 'wss://relay.example', role: 'Host', proof: 'proof' }
    ]);
    expect(
      parseNip53RelaysTag([['relays', 'wss://one.example', ' ', 'wss://two.example']])
    ).toEqual(['wss://one.example', 'wss://two.example']);
    expect(parseNip53Address('30313:pubkey:identifier:with-colon')).toEqual({
      kind: 30313,
      pubkey: 'pubkey',
      identifier: 'identifier:with-colon',
      value: '30313:pubkey:identifier:with-colon',
      relayHint: null,
      marker: null
    });
    expect(parseNip53AddressTags([['a', '30311:pubkey:id', 'wss://relay.example']])).toHaveLength(
      1
    );
  });

  it('rejects invalid builders and malformed parser inputs', () => {
    expect(() => buildNip53LiveStream({ identifier: 'id', status: 'open' as never })).toThrow(
      'Unsupported NIP-53 activity status: open'
    );
    expect(() =>
      buildNip53MeetingSpace({
        identifier: 'room',
        room: 'Room',
        status: 'open',
        serviceUrl: 'https://meet.example.com',
        providers: []
      })
    ).toThrow('NIP-53 meeting space requires at least one provider');
    expect(() =>
      buildNip53MeetingRoom({
        identifier: 'meeting',
        parentSpace: { kind: 30311, pubkey: 'author', identifier: 'stream' },
        title: 'Meeting',
        starts: 1,
        status: 'planned'
      })
    ).toThrow('NIP-53 meeting room parent space must reference kind:30312');
    expect(() =>
      buildNip53RoomPresence({
        room: { kind: 30311, pubkey: 'author', identifier: 'stream' }
      })
    ).toThrow('NIP-53 room presence must reference kind:30312');
    expect(parseNip53LiveStream({ kind: 30311, content: '', tags: [] })).toBeNull();
    expect(parseNip53LiveChat({ kind: 1311, content: '', tags: [] })).toBeNull();
    expect(parseNip53MeetingSpace({ kind: 30312, content: '', tags: [['d', 'room']] })).toBeNull();
    expect(
      parseNip53MeetingRoom({ kind: 30313, content: '', tags: [['d', 'meeting']] })
    ).toBeNull();
    expect(parseNip53RoomPresence({ kind: 10312, content: '', tags: [] })).toBeNull();
    expect(parseNip53Address('1311:pubkey:id')).toBeNull();
  });
});
