import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const packageIndexPath = resolve(currentDir, 'index.ts');

function readPackageJson(): {
  exports?: Record<string, string | Record<string, string>>;
} {
  const raw = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as {
    exports?: Record<string, string | Record<string, string>>;
  };
}

function assertNoPublicSubpathLeakage(
  exportsField: Record<string, string | Record<string, string>>
): void {
  const exportKeys = Object.keys(exportsField);
  expect(exportKeys).toEqual(['.']);

  for (const [key, value] of Object.entries(exportsField)) {
    expect(key).toBe('.');

    const target = typeof value === 'string' ? value : value.import;
    expect(target).toBe('./src/index.ts');
  }
}

const FORBIDDEN_STALE_PACKAGE_NAMES = [
  '@auftakt/timeline',
  '@auftakt/adapter-relay',
  '@auftakt/adapter-indexeddb'
] as const;

const staleRelaySessionWords = (() => {
  const lower = ['r', 'x'].join('');
  const upper = ['R', 'x'].join('');
  const lowerCreate = ['c', 'r', 'e', 'a', 't', 'e'].join('');
  const upperCreate = ['C', 'r', 'e', 'a', 't', 'e'].join('');
  const lowerGet = ['g', 'e', 't'].join('');
  const lowerNostr = ['n', 'o', 's', 't', 'r'].join('');
  const upperNostr = ['N', 'o', 's', 't', 'r'].join('');

  return [
    [lower, '-', lowerNostr].join(''),
    [upper, upperNostr].join(''),
    [lower, upperNostr].join(''),
    [upperCreate, upper, upperNostr].join(''),
    [lowerCreate, upper, upperNostr].join(''),
    [lowerGet, upper, upperNostr].join('')
  ];
})();

describe('@auftakt/core public api contract', () => {
  it('does not leak internal modules via package exports', () => {
    const pkg = readPackageJson();
    expect(pkg.exports).toBeDefined();
    assertNoPublicSubpathLeakage(pkg.exports!);
  });

  it('keeps raw relay internals out of the package root', async () => {
    const mod = await import('@auftakt/core');
    const exportNames = Object.keys(mod);

    const get = ['g', 'e', 't'].join('');
    const create = ['c', 'r', 'e', 'a', 't', 'e'].join('');
    const rx = ['R', 'x'].join('');
    const relay = ['R', 'e', 'l', 'a', 'y'].join('');
    const session = ['S', 'e', 's', 's', 'i', 'o', 'n'].join('');
    const backward = ['B', 'a', 'c', 'k', 'w', 'a', 'r', 'd'].join('');
    const forward = ['F', 'o', 'r', 'w', 'a', 'r', 'd'].join('');
    const req = ['R', 'e', 'q'].join('');

    const forbidden = [
      new RegExp(`^${get}${rx}${['N', 'o', 's', 't', 'r'].join('')}$`),
      new RegExp(`^${get}${relay}${session}$`),
      /^rawRequest/i,
      /^relayRequest/i,
      new RegExp(`^${create}${rx}`, 'i'),
      new RegExp(`^${create}${relay}${session}$`),
      new RegExp(`^${create}${backward}${req}$`),
      new RegExp(`^${create}${forward}${req}$`),
      ...staleRelaySessionWords.slice(1).map((word) => new RegExp(`^${word}$`)),
      /^nip07Signer$/,
      /^uniq$/
    ];

    for (const name of exportNames) {
      for (const pattern of forbidden) {
        expect(name).not.toMatch(pattern);
      }
    }
  });

  it('keeps stale package names out of the package source', () => {
    const source = readFileSync(packageIndexPath, 'utf8');

    for (const packageName of FORBIDDEN_STALE_PACKAGE_NAMES) {
      expect(source).not.toContain(packageName);
    }

    expect(source).not.toMatch(new RegExp(staleRelaySessionWords.join('|')));
  });

  it('exposes the expected package-root names explicitly', async () => {
    const mod = await import('@auftakt/core');

    expect(mod).toEqual(
      expect.objectContaining({
        buildRelaySelectionPlan: expect.any(Function),
        buildNip03OpenTimestampsAttestationEvent: expect.any(Function),
        buildNip03OpenTimestampsAttestationFilter: expect.any(Function),
        buildNip13NonceTag: expect.any(Function),
        buildNip14SubjectTag: expect.any(Function),
        buildNip17ChatMessage: expect.any(Function),
        buildNip17ConversationGiftWraps: expect.any(Function),
        buildNip17DmRelayList: expect.any(Function),
        buildNip23LongFormEvent: expect.any(Function),
        buildNip24ProfileMetadata: expect.any(Function),
        buildNip24HashtagTag: expect.any(Function),
        buildNip27ReferenceTags: expect.any(Function),
        buildNip28ChannelCreateEvent: expect.any(Function),
        buildNip28ChannelMessageEvent: expect.any(Function),
        buildNip28ChannelMetadataEvent: expect.any(Function),
        buildNip28HideMessageEvent: expect.any(Function),
        buildNip28MuteUserEvent: expect.any(Function),
        buildNip32LabelEvent: expect.any(Function),
        buildNip32LabelTag: expect.any(Function),
        buildNip31AltTag: expect.any(Function),
        buildNip36ContentWarningTag: expect.any(Function),
        buildNip37DraftWrapEvent: expect.any(Function),
        buildNip38UserStatusEvent: expect.any(Function),
        buildNip38UserStatusFilter: expect.any(Function),
        buildNip39ExternalIdentitiesEvent: expect.any(Function),
        buildNip39ExternalIdentitiesFilter: expect.any(Function),
        buildNip40ExpirationTag: expect.any(Function),
        buildNip43JoinRequestEvent: expect.any(Function),
        buildNip43MembershipListEvent: expect.any(Function),
        buildNip46BunkerUrl: expect.any(Function),
        buildNip46ConnectRequest: expect.any(Function),
        buildNip46NostrConnectUrl: expect.any(Function),
        buildNip46RemoteSigningEvent: expect.any(Function),
        buildNip48ProxyTag: expect.any(Function),
        buildNip50SearchFilter: expect.any(Function),
        buildNip51ListEvent: expect.any(Function),
        buildNip52Calendar: expect.any(Function),
        buildNip52DateCalendarEvent: expect.any(Function),
        buildNip52Rsvp: expect.any(Function),
        buildNip52TimeCalendarEvent: expect.any(Function),
        buildNip53LiveChat: expect.any(Function),
        buildNip53LiveStream: expect.any(Function),
        buildNip53MeetingRoom: expect.any(Function),
        buildNip53MeetingSpace: expect.any(Function),
        buildNip53RoomPresence: expect.any(Function),
        buildNip55ContentResolverUri: expect.any(Function),
        buildNip55IntentRequest: expect.any(Function),
        buildNip55SignerUrl: expect.any(Function),
        buildNip56ReportEvent: expect.any(Function),
        buildNip58BadgeAward: expect.any(Function),
        buildNip58BadgeDefinition: expect.any(Function),
        buildNip58BadgeSet: expect.any(Function),
        buildNip58ProfileBadges: expect.any(Function),
        buildNip59GiftWrap: expect.any(Function),
        buildNip62RequestToVanishEvent: expect.any(Function),
        buildNip68ImetaTag: expect.any(Function),
        buildNip68PictureEvent: expect.any(Function),
        buildNip71VideoEvent: expect.any(Function),
        buildNip71VideoVariantTag: expect.any(Function),
        buildNip72ApprovalEvent: expect.any(Function),
        buildNip72CommunityDefinition: expect.any(Function),
        buildNip72CommunityPost: expect.any(Function),
        buildNip78ApplicationDataEvent: expect.any(Function),
        buildNip7dThreadEvent: expect.any(Function),
        buildNip84HighlightEvent: expect.any(Function),
        buildNip84SourceUrlTag: expect.any(Function),
        buildNip85AssertionEvent: expect.any(Function),
        buildNip85TrustedProviderList: expect.any(Function),
        buildNip86ManagementAuthEvent: expect.any(Function),
        buildNip86ManagementHttpRequest: expect.any(Function),
        buildNip86ManagementRequest: expect.any(Function),
        buildNip88Poll: expect.any(Function),
        buildNip88Response: expect.any(Function),
        buildNip89HandlerInformationEvent: expect.any(Function),
        buildNip89RecommendationEvent: expect.any(Function),
        buildNip92ImetaTag: expect.any(Function),
        buildNip92MediaAttachmentTags: expect.any(Function),
        buildNip94FileMetadataEvent: expect.any(Function),
        buildNip94FileMetadataFilter: expect.any(Function),
        buildNip98AuthorizationHeader: expect.any(Function),
        buildNip98HttpAuthEvent: expect.any(Function),
        buildNipA0VoiceMessage: expect.any(Function),
        buildNipA0VoiceReply: expect.any(Function),
        buildNipA4PublicMessage: expect.any(Function),
        buildNipA4PublicMessageFilter: expect.any(Function),
        buildNipB7BlossomFallbackUrls: expect.any(Function),
        buildNipB7BlossomFileUrl: expect.any(Function),
        buildNipB7BlossomServerListEvent: expect.any(Function),
        buildNipB7BlossomServerListFilter: expect.any(Function),
        calculateNipB7BlossomContentHash: expect.any(Function),
        buildNipC0CodeSnippet: expect.any(Function),
        buildNipC0CodeSnippetFilter: expect.any(Function),
        buildNipC7ChatMessage: expect.any(Function),
        buildNipC7ChatReply: expect.any(Function),
        createRuntimeRequestKey: expect.any(Function),
        filterNegentropyEventRefs: expect.any(Function),
        getEventHash: expect.any(Function),
        extractNipB7BlossomHashFromUrl: expect.any(Function),
        extractNip27References: expect.any(Function),
        naddrEncode: expect.any(Function),
        neventEncode: expect.any(Function),
        noteEncode: expect.any(Function),
        nprofileEncode: expect.any(Function),
        nrelayEncode: expect.any(Function),
        nsecEncode: expect.any(Function),
        npubEncode: expect.any(Function),
        normalizeRelaySelectionPolicy: expect.any(Function),
        normalizeRelayUrl: expect.any(Function),
        parseNip03OpenTimestampsAttestationEvent: expect.any(Function),
        parseNip13Nonce: expect.any(Function),
        parseNip14Subject: expect.any(Function),
        parseNip23LongFormEvent: expect.any(Function),
        parseNip24ProfileMetadataJson: expect.any(Function),
        parseNip24GenericTags: expect.any(Function),
        parseNip28ChannelMessageEvent: expect.any(Function),
        parseNip28ChannelMetadataEvent: expect.any(Function),
        parseNip28HideMessageEvent: expect.any(Function),
        parseNip28MuteUserEvent: expect.any(Function),
        parseNip32LabelEvent: expect.any(Function),
        parseNip32SelfReportedLabels: expect.any(Function),
        parseNip31AltTag: expect.any(Function),
        parseNip36ContentWarning: expect.any(Function),
        parseNip37DraftWrapEvent: expect.any(Function),
        parseNip38UserStatusEvent: expect.any(Function),
        parseNip39ExternalIdentitiesEvent: expect.any(Function),
        parseNip40Expiration: expect.any(Function),
        parseNip43ClaimEvent: expect.any(Function),
        parseNip43MemberChangeEvent: expect.any(Function),
        parseNip43MembershipListEvent: expect.any(Function),
        parseNip21Uri: expect.any(Function),
        parseNip46BunkerUrl: expect.any(Function),
        parseNip46NostrConnectUrl: expect.any(Function),
        parseNip46RemoteSigningEvent: expect.any(Function),
        parseNip46RequestPayloadJson: expect.any(Function),
        parseNip48ProxyTags: expect.any(Function),
        parseNip50SearchFilter: expect.any(Function),
        parseNip51ListEvent: expect.any(Function),
        parseNip52Calendar: expect.any(Function),
        parseNip52DateCalendarEvent: expect.any(Function),
        parseNip52Rsvp: expect.any(Function),
        parseNip52TimeCalendarEvent: expect.any(Function),
        parseNip53LiveChat: expect.any(Function),
        parseNip53LiveStream: expect.any(Function),
        parseNip53MeetingRoom: expect.any(Function),
        parseNip53MeetingSpace: expect.any(Function),
        parseNip53RoomPresence: expect.any(Function),
        parseNip55SignerResultParams: expect.any(Function),
        parseNip55SignerUrl: expect.any(Function),
        parseNip56ReportEvent: expect.any(Function),
        parseNip58BadgeAward: expect.any(Function),
        parseNip58BadgeDefinition: expect.any(Function),
        parseNip58BadgeSet: expect.any(Function),
        parseNip58ProfileBadges: expect.any(Function),
        parseNip51PrivateTagsJson: expect.any(Function),
        parseNip17DmRelayListTags: expect.any(Function),
        parseNip59RumorJson: expect.any(Function),
        parseNip59SealJson: expect.any(Function),
        parseNip62RequestToVanishEvent: expect.any(Function),
        parseNip68ImetaTag: expect.any(Function),
        parseNip68PictureEvent: expect.any(Function),
        parseNip71VideoEvent: expect.any(Function),
        parseNip71VideoVariantTag: expect.any(Function),
        parseNip72ApprovalEvent: expect.any(Function),
        parseNip72CommunityDefinition: expect.any(Function),
        parseNip72CommunityPost: expect.any(Function),
        parseNip78ApplicationDataEvent: expect.any(Function),
        parseNip7dThreadEvent: expect.any(Function),
        parseNip84HighlightEvent: expect.any(Function),
        parseNip85AssertionEvent: expect.any(Function),
        parseNip85TrustedProviderList: expect.any(Function),
        parseNip86ManagementRequestJson: expect.any(Function),
        parseNip86ManagementResponseJson: expect.any(Function),
        parseNip88Poll: expect.any(Function),
        parseNip88Response: expect.any(Function),
        parseNip89HandlerInformationEvent: expect.any(Function),
        parseNip89RecommendationEvent: expect.any(Function),
        parseNip92ImetaTag: expect.any(Function),
        parseNip92MediaAttachments: expect.any(Function),
        parseNip94FileMetadataEvent: expect.any(Function),
        parseNip98HttpAuthEvent: expect.any(Function),
        parseNipA0VoiceMessage: expect.any(Function),
        parseNipA4PublicMessage: expect.any(Function),
        parseNipB7BlossomServerListEvent: expect.any(Function),
        parseNipC0CodeSnippet: expect.any(Function),
        parseNipC7ChatMessage: expect.any(Function),
        parseNip65RelayListTags: expect.any(Function),
        relayListEntriesToSelectionCandidates: expect.any(Function),
        reconcileReplayRepairSubjects: expect.any(Function),
        reduceReadSettlement: expect.any(Function),
        toNip21Uri: expect.any(Function),
        tallyNip88Responses: expect.any(Function),
        validateNip13ProofOfWork: expect.any(Function),
        validateRelayEvent: expect.any(Function),
        verifyNipB7BlossomContentHash: expect.any(Function)
      })
    );
  });
});
