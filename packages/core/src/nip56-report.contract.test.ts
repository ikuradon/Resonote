import { describe, expect, it } from 'vitest';

import {
  buildNip56ReportEvent,
  isNip56ReportType,
  NIP56_REPORT_KIND,
  parseNip56ReportEvent,
  parseNip56ReportTargets
} from './index.js';

describe('NIP-56 report events', () => {
  it('builds profile reports with a typed p tag', () => {
    expect(
      buildNip56ReportEvent({
        targetKind: 'profile',
        pubkey: ' reported-pubkey ',
        reportType: 'impersonation',
        content: 'pretending to be nostr:npub...',
        tags: [['L', 'social.nos.ontology']]
      })
    ).toEqual({
      kind: NIP56_REPORT_KIND,
      content: 'pretending to be nostr:npub...',
      tags: [
        ['p', 'reported-pubkey', 'impersonation'],
        ['L', 'social.nos.ontology']
      ]
    });
  });

  it('builds note reports with a typed e tag and related p tag', () => {
    expect(
      buildNip56ReportEvent({
        targetKind: 'event',
        pubkey: 'reported-pubkey',
        eventId: 'note-id',
        reportType: 'illegal',
        content: 'jurisdiction-specific report'
      })
    ).toEqual({
      kind: NIP56_REPORT_KIND,
      content: 'jurisdiction-specific report',
      tags: [
        ['e', 'note-id', 'illegal'],
        ['p', 'reported-pubkey']
      ]
    });
  });

  it('builds blob reports with x, e, optional p, and server tags', () => {
    expect(
      buildNip56ReportEvent({
        targetKind: 'blob',
        blobHash: 'blob-hash',
        eventId: 'event-with-blob',
        pubkey: 'reported-pubkey',
        reportType: 'malware',
        mediaServers: [' https://media.example/path ', '']
      })
    ).toEqual({
      kind: NIP56_REPORT_KIND,
      content: '',
      tags: [
        ['x', 'blob-hash', 'malware'],
        ['e', 'event-with-blob', 'malware'],
        ['p', 'reported-pubkey'],
        ['server', 'https://media.example/path']
      ]
    });
  });

  it('parses report targets, related pubkeys, servers, and label tags', () => {
    expect(
      parseNip56ReportEvent({
        kind: NIP56_REPORT_KIND,
        pubkey: 'reporter',
        created_at: 123,
        content: 'context',
        tags: [
          ['e', 'note-id', 'spam'],
          ['p', 'reported-pubkey'],
          ['server', 'https://media.example'],
          ['L', 'social.nos.ontology'],
          ['l', 'NS-spam', 'social.nos.ontology']
        ]
      })
    ).toEqual({
      reporterPubkey: 'reporter',
      createdAt: 123,
      content: 'context',
      targets: [
        {
          tagName: 'e',
          targetKind: 'event',
          value: 'note-id',
          reportType: 'spam'
        }
      ],
      reportedPubkeys: ['reported-pubkey'],
      mediaServers: ['https://media.example'],
      labelTags: [
        ['L', 'social.nos.ontology'],
        ['l', 'NS-spam', 'social.nos.ontology']
      ]
    });
  });

  it('rejects unsupported report types and report events without typed targets', () => {
    expect(isNip56ReportType('spam')).toBe(true);
    expect(isNip56ReportType('phishing')).toBe(false);
    expect(() =>
      buildNip56ReportEvent({
        targetKind: 'profile',
        pubkey: 'pubkey',
        reportType: 'phishing' as 'spam'
      })
    ).toThrow('Unsupported NIP-56 report type: phishing');
    expect(
      parseNip56ReportEvent({ kind: NIP56_REPORT_KIND, tags: [['p', 'pubkey']], content: '' })
    ).toBeNull();
    expect(
      parseNip56ReportTargets([
        ['x', 'blob', 'malware'],
        ['p', 'pubkey']
      ])
    ).toEqual([
      {
        tagName: 'x',
        targetKind: 'blob',
        value: 'blob',
        reportType: 'malware'
      }
    ]);
  });
});
