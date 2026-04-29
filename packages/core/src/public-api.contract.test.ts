import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');

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

describe('@auftakt/core public api contract', () => {
  it('does not leak internal modules via package exports', () => {
    const pkg = readPackageJson();
    expect(pkg.exports).toBeDefined();
    assertNoPublicSubpathLeakage(pkg.exports!);
  });

  it('keeps raw relay internals out of the package root', async () => {
    const mod = await import('@auftakt/core');
    const exportNames = Object.keys(mod);

    const forbidden = [/^getRxNostr$/, /^rawRequest/i, /^relayRequest/i];

    for (const name of exportNames) {
      for (const pattern of forbidden) {
        expect(name).not.toMatch(pattern);
      }
    }
  });

  it('exposes the expected package-root names explicitly', async () => {
    const mod = await import('@auftakt/core');

    expect(mod).toEqual(
      expect.objectContaining({
        buildRelaySelectionPlan: expect.any(Function),
        buildNip13NonceTag: expect.any(Function),
        buildNip14SubjectTag: expect.any(Function),
        buildNip17ChatMessage: expect.any(Function),
        buildNip17ConversationGiftWraps: expect.any(Function),
        buildNip17DmRelayList: expect.any(Function),
        buildNip23LongFormEvent: expect.any(Function),
        buildNip24ProfileMetadata: expect.any(Function),
        buildNip24HashtagTag: expect.any(Function),
        buildNip27ReferenceTags: expect.any(Function),
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
        buildRequestExecutionPlan: expect.any(Function),
        calculateRelayReconnectDelay: expect.any(Function),
        createRuntimeRequestKey: expect.any(Function),
        createRxNostrSession: expect.any(Function),
        filterNegentropyEventRefs: expect.any(Function),
        getEventHash: expect.any(Function),
        extractNip27References: expect.any(Function),
        naddrEncode: expect.any(Function),
        neventEncode: expect.any(Function),
        noteEncode: expect.any(Function),
        nprofileEncode: expect.any(Function),
        nrelayEncode: expect.any(Function),
        nsecEncode: expect.any(Function),
        npubEncode: expect.any(Function),
        normalizeRelayLifecycleOptions: expect.any(Function),
        normalizeRelaySelectionPolicy: expect.any(Function),
        normalizeRelayUrl: expect.any(Function),
        parseNip13Nonce: expect.any(Function),
        parseNip14Subject: expect.any(Function),
        parseNip23LongFormEvent: expect.any(Function),
        parseNip24ProfileMetadataJson: expect.any(Function),
        parseNip24GenericTags: expect.any(Function),
        parseNip32LabelEvent: expect.any(Function),
        parseNip32SelfReportedLabels: expect.any(Function),
        parseNip31AltTag: expect.any(Function),
        parseNip36ContentWarning: expect.any(Function),
        parseNip37DraftWrapEvent: expect.any(Function),
        parseNip38UserStatusEvent: expect.any(Function),
        parseNip39ExternalIdentitiesEvent: expect.any(Function),
        parseNip40Expiration: expect.any(Function),
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
        parseNip65RelayListTags: expect.any(Function),
        relayListEntriesToSelectionCandidates: expect.any(Function),
        reconcileReplayRepairSubjects: expect.any(Function),
        reduceReadSettlement: expect.any(Function),
        toNip21Uri: expect.any(Function),
        tallyNip88Responses: expect.any(Function),
        validateNip13ProofOfWork: expect.any(Function),
        validateRelayEvent: expect.any(Function)
      })
    );
  });
});
