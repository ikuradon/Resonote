import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const packageIndexPath = resolve(currentDir, 'index.ts');

const RESONOTE_VALUE_EXPORT_ALLOWLIST = [
  'buildCommentContentFilters',
  'createResonoteCoordinator',
  'COMMENTS_FLOW',
  'CONTENT_RESOLUTION_FLOW',
  'EMOJI_CATALOG_READ_MODEL',
  'NOTIFICATIONS_FLOW',
  'RESONOTE_PLAY_POSITION_SORT',
  'createEmojiCatalogPlugin',
  'createNotificationsFlowPlugin',
  'createResonoteCommentsFlowPlugin',
  'createResonoteContentResolutionFlowPlugin',
  'createTimelinePlugin',
  'getResonotePlayPositionMs',
  'startCommentDeletionReconcile',
  'startCommentSubscription',
  'startMergedCommentSubscription',
  'resonoteTimelineProjection',
  'sortResonoteTimelineByPlayPosition'
] as const;

const RESONOTE_TYPE_EXPORT_ALLOWLIST = [
  'CommentFilterKinds',
  'CommentSubscriptionRefs',
  'CustomEmojiDiagnosticsSource',
  'CustomEmojiSetDiagnosticsSource',
  'CustomEmojiSetResolution',
  'CustomEmojiSourceDiagnosticsOptions',
  'CustomEmojiSourceDiagnosticsResult',
  'CustomEmojiSourceMode',
  'DeletionEvent',
  'CommentsFlow',
  'ContentResolutionFlow',
  'EmojiCatalogReadModel',
  'EmojiCategory',
  'NotificationStreamHandlers',
  'NotificationStreamOptions',
  'NotificationsFlow',
  'ResonoteTimelineEvent'
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

const FORBIDDEN_ROOT_EXPORTS = [
  'AddressableHandle',
  'AddressableHandleInput',
  'AuftaktRuntimeCoordinator',
  'AuftaktRuntimePlugin',
  'AuftaktRuntimePluginApi',
  'AuftaktRuntimePluginApiVersion',
  'AuftaktRuntimePluginModels',
  'AuftaktRuntimePluginRegistration',
  'EventHandle',
  'EventHandleInput',
  'LatestReadDriver',
  'RELAY_LIST_FLOW',
  'RELAY_METRICS_READ_MODEL',
  'RelayCapabilityPacket',
  'RelayCapabilitySnapshot',
  'RelayHintsHandle',
  'RelaySetHandle',
  'RelaySetSubject',
  'RetryableSignedEvent',
  'UserHandle',
  'UserHandleInput',
  'buildRelaySetSnapshot',
  'cachedFetchById',
  staleRelaySessionWords[3],
  'createEntityHandleFactories',
  staleRelaySessionWords[4],
  'createRelayListFlowPlugin',
  'createRelayMetricsPlugin',
  'fetchBackwardEvents',
  'fetchBackwardFirst',
  'fetchCustomEmojiCategories',
  'fetchCustomEmojiSources',
  'fetchFollowListSnapshot',
  'fetchLatestEvent',
  'fetchNostrEventById',
  'fetchNotificationTargetPreview',
  'fetchProfileCommentEvents',
  'fetchProfileMetadataEvents',
  'fetchProfileMetadataSources',
  'fetchRelayListEvents',
  'fetchRelayListSources',
  'fetchWot',
  'getAddressable',
  'getEvent',
  'getRelayHints',
  'getRelaySet',
  staleRelaySessionWords[5],
  'getUser',
  'invalidateFetchByIdCache',
  'loadCommentSubscriptionDeps',
  'observeRelayCapabilities',
  'observeRelayStatuses',
  'publishSignedEvent',
  'publishSignedEvents',
  'registerPlugin',
  'repairEventsFromRelay',
  'retryPendingPublishes',
  'searchBookmarkDTagEvent',
  'searchEpisodeBookmarkByGuid',
  'setDefaultRelays',
  'snapshotRelayCapabilities',
  'snapshotRelayMetrics',
  'snapshotRelayStatuses',
  'subscribeNotificationStreams',
  'useCachedLatest',
  staleRelaySessionWords[1],
  staleRelaySessionWords[2]
] as const;

const FORBIDDEN_STALE_PACKAGE_NAMES = (() => {
  const auftakt = ['@', 'a', 'u', 'f', 't', 'a', 'k', 't'].join('');
  return [
    `${auftakt}/runtime`,
    `${auftakt}/core`,
    `${auftakt}/adapter-dexie`,
    `${auftakt}/adapter-relay`,
    `${auftakt}/adapter-indexeddb`,
    `${auftakt}/timeline`
  ];
})();

function readPackageJson(): { exports?: Record<string, string | Record<string, string>> } {
  const raw = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as { exports?: Record<string, string | Record<string, string>> };
}

function assertNoPublicSubpathLeakage(
  exportsField: Record<string, string | Record<string, string>>
): void {
  const exportKeys = Object.keys(exportsField);
  expect(exportKeys).toEqual(['.']);

  const target =
    typeof exportsField['.'] === 'string' ? exportsField['.'] : exportsField['.'].import;
  expect(target).toBe('./src/index.ts');
}

describe('@auftakt/resonote public api contract', () => {
  const rawNegentropyPacketName = new RegExp(`^${'NEG'}-(OPEN|MSG|CLOSE)$`);

  it('does not leak internal modules via package exports', () => {
    const pkg = readPackageJson();
    expect(pkg.exports).toBeDefined();
    assertNoPublicSubpathLeakage(pkg.exports!);
  });

  it('exports only the minimal Resonote-specific value allowlist', async () => {
    const mod = await import('@auftakt/resonote');

    expect(Object.keys(mod).sort()).toEqual([...RESONOTE_VALUE_EXPORT_ALLOWLIST].sort());
  });

  it('keeps coordinator surface focused on high-level Resonote flows', async () => {
    const mod = await import('@auftakt/resonote');

    expect(typeof mod.createResonoteCoordinator).toBe('function');
    expect(typeof mod.startCommentSubscription).toBe('function');
    expect(typeof mod.startMergedCommentSubscription).toBe('function');
    expect(typeof mod.startCommentDeletionReconcile).toBe('function');
    expect(typeof mod.buildCommentContentFilters).toBe('function');
  });

  it('keeps type-only exports on the documented Resonote allowlist', () => {
    const source = readFileSync(packageIndexPath, 'utf8');

    for (const name of RESONOTE_TYPE_EXPORT_ALLOWLIST) {
      expect(source).toMatch(new RegExp(`\\b${name}\\b`));
    }

    for (const name of FORBIDDEN_ROOT_EXPORTS) {
      expect(source).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('keeps stale package names and legacy aliases out of the package source', () => {
    const source = readFileSync(packageIndexPath, 'utf8');

    for (const packageName of FORBIDDEN_STALE_PACKAGE_NAMES) {
      expect(source).not.toContain(packageName);
    }

    expect(source).not.toMatch(new RegExp(staleRelaySessionWords.join('|')));
  });

  it('does not expose generic runtime or raw protocol names', async () => {
    const mod = await import('@auftakt/resonote');
    const exportNames = Object.keys(mod);
    const source = readFileSync(packageIndexPath, 'utf8');
    const allowedRuntimeBridgeNames = new Set([
      'buildCommentContentFilters',
      'createResonoteCoordinator',
      'startCommentDeletionReconcile',
      'startCommentSubscription',
      'startMergedCommentSubscription'
    ]);

    for (const name of exportNames) {
      if (allowedRuntimeBridgeNames.has(name)) {
        continue;
      }
      expect(name).not.toMatch(rawNegentropyPacketName);
      expect(name).not.toMatch(/^neg(Open|Msg|Close)$/);
      expect(name).not.toMatch(/Relay(List|Metrics)/);
      expect(name).not.toMatch(
        /^(cached|fetch|publish|retry|observe|snapshot|setDefault|getEvent|getUser)/
      );
      expect(name).not.toMatch(/Coordinator|Handle|Runtime/);
      for (const word of staleRelaySessionWords.slice(1)) {
        expect(name).not.toBe(word);
      }
    }

    expect(source).not.toMatch(/\bNEG-[A-Z]+\b/);
  });

  it('exports projection metadata as data-only package surface', async () => {
    const mod = await import('@auftakt/resonote');

    expect(mod.resonoteTimelineProjection).toMatchObject({
      name: 'resonote.timeline',
      sourceKinds: [1, 1111, 7, 17]
    });
    expect(mod.resonoteTimelineProjection.sorts).toEqual([
      { key: 'created_at', pushdownSupported: true },
      { key: mod.RESONOTE_PLAY_POSITION_SORT, pushdownSupported: false }
    ]);
  });

  it('does not export generic runtime/read/publish/cache/relay-metrics root names', async () => {
    const mod = await import('@auftakt/resonote');
    const names = Object.keys(mod);

    expect(names).not.toEqual(expect.arrayContaining(['cachedFetchById', 'useCachedLatest']));
    expect(names).not.toEqual(
      expect.arrayContaining(['fetchLatestEvent', 'fetchNostrEventById', 'publishSignedEvents'])
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        'retryPendingPublishes',
        'setDefaultRelays',
        'RELAY_METRICS_READ_MODEL',
        'createRelayMetricsPlugin'
      ])
    );
  });
});
