import { describe, expect, it } from 'vitest';

import {
  appendNip32SelfLabelTags,
  buildNip32LabelEvent,
  buildNip32LabelTag,
  buildNip32LabelTargetTag,
  buildNip32NamespaceTag,
  isNip32LabelTargetTagName,
  NIP32_IMPLIED_NAMESPACE,
  NIP32_LABEL_KIND,
  NIP32_LABEL_TAG,
  NIP32_NAMESPACE_TAG,
  parseNip32LabelEvent,
  parseNip32Labels,
  parseNip32LabelTargets,
  parseNip32Namespaces,
  parseNip32SelfReportedLabels
} from './index.js';

describe('NIP-32 labels', () => {
  it('builds namespace, label, and target tags', () => {
    expect(buildNip32NamespaceTag(' com.example.ontology ')).toEqual([
      NIP32_NAMESPACE_TAG,
      'com.example.ontology'
    ]);
    expect(buildNip32LabelTag({ value: ' VI-hum ', namespace: ' com.example.ontology ' })).toEqual([
      NIP32_LABEL_TAG,
      'VI-hum',
      'com.example.ontology'
    ]);
    expect(buildNip32LabelTag({ value: 'user label' })).toEqual(['l', 'user label', 'ugc']);
    expect(
      buildNip32LabelTargetTag({ tagName: 'e', value: ' note-id ', relayHint: ' wss://r ' })
    ).toEqual(['e', 'note-id', 'wss://r']);
    expect(
      buildNip32LabelTargetTag({ tagName: 't', value: 'permies', relayHint: 'ignored' })
    ).toEqual(['t', 'permies']);
  });

  it('builds kind:1985 label events with namespace tags before labels and targets', () => {
    expect(
      buildNip32LabelEvent({
        content: 'moderation explanation',
        labels: [
          { value: 'approve', namespace: 'nip28.moderation' },
          { value: 'spam', namespace: 'social.nos.ontology' }
        ],
        targets: [{ tagName: 'e', value: 'event-id', relayHint: 'wss://relay.example' }],
        tags: [['client', 'resonote']]
      })
    ).toEqual({
      kind: NIP32_LABEL_KIND,
      content: 'moderation explanation',
      tags: [
        ['L', 'nip28.moderation'],
        ['L', 'social.nos.ontology'],
        ['l', 'approve', 'nip28.moderation'],
        ['l', 'spam', 'social.nos.ontology'],
        ['e', 'event-id', 'wss://relay.example'],
        ['client', 'resonote']
      ]
    });
  });

  it('parses label events with namespaces, labels, and label targets', () => {
    expect(
      parseNip32LabelEvent({
        kind: NIP32_LABEL_KIND,
        pubkey: 'labeler',
        created_at: 123,
        content: 'context',
        tags: [
          ['L', 'license'],
          ['l', 'MIT', 'license'],
          ['e', 'event-id', 'wss://relay.example']
        ]
      })
    ).toEqual({
      labelerPubkey: 'labeler',
      createdAt: 123,
      content: 'context',
      namespaces: ['license'],
      labels: [{ value: 'MIT', namespace: 'license', namespaceDeclared: true }],
      targets: [{ tagName: 'e', value: 'event-id', relayHint: 'wss://relay.example' }]
    });
  });

  it('supports implied ugc labels when no namespace tag is present', () => {
    expect(parseNip32Labels([['l', 'user supplied']])).toEqual([
      { value: 'user supplied', namespace: NIP32_IMPLIED_NAMESPACE, namespaceDeclared: true }
    ]);
    expect(
      parseNip32Labels([
        ['L', 'license'],
        ['l', 'missing mark']
      ])
    ).toEqual([{ value: 'missing mark', namespace: 'ugc', namespaceDeclared: false }]);
  });

  it('parses self-reported labels on non-label events and appends them without mutation', () => {
    const tags = [['p', 'pubkey']] as const;
    expect(appendNip32SelfLabelTags(tags, [{ value: 'en', namespace: 'ISO-639-1' }])).toEqual([
      ['p', 'pubkey'],
      ['L', 'ISO-639-1'],
      ['l', 'en', 'ISO-639-1']
    ]);
    expect(tags).toEqual([['p', 'pubkey']]);
    expect(
      parseNip32SelfReportedLabels({
        kind: 1,
        tags: [
          ['L', 'ISO-639-1'],
          ['l', 'en', 'ISO-639-1']
        ]
      })
    ).toEqual([{ value: 'en', namespace: 'ISO-639-1', namespaceDeclared: true }]);
    expect(parseNip32SelfReportedLabels({ kind: 1985, tags: [['l', 'en']] })).toEqual([]);
  });

  it('parses target tags and exposes target tag guards', () => {
    expect(
      parseNip32Namespaces([
        ['L', 'license'],
        ['L', 'license'],
        ['L', '']
      ])
    ).toEqual(['license']);
    expect(
      parseNip32LabelTargets([
        ['e', 'event-id', 'wss://relay'],
        ['p', 'pubkey', 'wss://relay'],
        ['a', '30023:pubkey:d'],
        ['r', 'https://example.com'],
        ['t', 'nostr'],
        ['x', 'ignored']
      ])
    ).toEqual([
      { tagName: 'e', value: 'event-id', relayHint: 'wss://relay' },
      { tagName: 'p', value: 'pubkey', relayHint: 'wss://relay' },
      { tagName: 'a', value: '30023:pubkey:d', relayHint: null },
      { tagName: 'r', value: 'https://example.com', relayHint: null },
      { tagName: 't', value: 'nostr', relayHint: null }
    ]);
    expect(isNip32LabelTargetTagName('e')).toBe(true);
    expect(isNip32LabelTargetTagName('x')).toBe(false);
  });

  it('rejects empty labels, namespaces, and label events without required parts', () => {
    expect(() => buildNip32NamespaceTag(' ')).toThrow('NIP-32 namespace must not be empty');
    expect(() => buildNip32LabelTag({ value: ' ' })).toThrow('NIP-32 label must not be empty');
    expect(() => buildNip32LabelTargetTag({ tagName: 'e', value: ' ' })).toThrow(
      'NIP-32 target value must not be empty'
    );
    expect(() =>
      buildNip32LabelEvent({ labels: [], targets: [{ tagName: 'e', value: 'id' }] })
    ).toThrow('NIP-32 label event requires at least one label');
    expect(() => buildNip32LabelEvent({ labels: [{ value: 'spam' }], targets: [] })).toThrow(
      'NIP-32 label event requires at least one target'
    );
    expect(parseNip32LabelEvent({ kind: 1985, content: '', tags: [['l', 'spam']] })).toBeNull();
  });
});
