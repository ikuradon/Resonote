import { findTagValue } from '$shared/nostr/helpers.js';
import { isEmojiTag } from '$shared/utils/emoji.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('emoji-sets');

export interface CustomEmoji {
  shortcode: string;
  url: string;
}

export interface EmojiCategory {
  id: string;
  name: string;
  emojis: { id: string; name: string; skins: { src: string }[] }[];
}

let customEmojis = $state<EmojiCategory[]>([]);
let loading = $state(false);
let generation = 0;

export function getCustomEmojis() {
  return {
    get categories() {
      return customEmojis;
    },
    get loading() {
      return loading;
    }
  };
}

function extractFromEmojiList(event: { tags: string[][] }): {
  inlineEmojis: CustomEmoji[];
  setRefs: string[];
} {
  const emojis: CustomEmoji[] = [];
  const refs: string[] = [];
  for (const tag of event.tags) {
    if (isEmojiTag(tag)) {
      emojis.push({ shortcode: tag[1], url: tag[2] });
    } else if (tag[0] === 'a' && tag[1]?.startsWith('30030:')) {
      refs.push(tag[1]);
    }
  }
  return { inlineEmojis: emojis, setRefs: refs };
}

function buildCategoryFromEvent(event: { id: string; tags: string[][] }): EmojiCategory | null {
  const setName = findTagValue(event.tags, 'title') ?? findTagValue(event.tags, 'd') ?? 'Emoji Set';
  const setId = `set-${event.id.slice(0, 8)}`;

  const emojis = event.tags
    .filter((tag) => isEmojiTag(tag))
    .map((tag) => ({
      id: tag[1],
      name: tag[1],
      skins: [{ src: tag[2] }]
    }));

  if (emojis.length === 0) return null;
  return { id: setId, name: setName, emojis };
}

function buildSetKey(author: string, dTag: string): string {
  return `${author}:${dTag}`;
}

function buildCategories(
  inlineEmojis: CustomEmoji[],
  setCategories: EmojiCategory[]
): EmojiCategory[] {
  const categories: EmojiCategory[] = [];

  if (inlineEmojis.length > 0) {
    categories.push({
      id: 'custom-inline',
      name: 'Custom',
      emojis: inlineEmojis.map((emoji) => ({
        id: emoji.shortcode,
        name: emoji.shortcode,
        skins: [{ src: emoji.url }]
      }))
    });
  }

  categories.push(...setCategories);
  return categories;
}

export async function loadCustomEmojis(pubkey: string): Promise<void> {
  const gen = ++generation;
  loading = true;
  log.info('Loading custom emojis', { pubkey: shortHex(pubkey) });

  try {
    const { fetchLatest, getStoreAsync } = await import('$shared/nostr/store.js');
    const store = await getStoreAsync();

    // Try cache first
    const cachedListResults = await store.getSync({ kinds: [10030], authors: [pubkey], limit: 1 });
    if (gen !== generation) return;

    const cachedList = cachedListResults.length > 0 ? cachedListResults[0].event : null;
    if (cachedList) {
      const { inlineEmojis, setRefs } = extractFromEmojiList(cachedList);

      const setCategories = (
        await Promise.all(
          setRefs.map(async (ref) => {
            const parts = ref.split(':');
            if (parts.length < 3 || !parts[1] || !parts[2]) return null;
            const cachedResults = await store.getSync({
              kinds: [30030],
              authors: [parts[1]],
              '#d': [parts[2]],
              limit: 1
            });
            const cached = cachedResults.length > 0 ? cachedResults[0].event : null;
            return cached ? buildCategoryFromEvent(cached) : null;
          })
        )
      ).filter((category): category is EmojiCategory => category !== null);

      if (gen !== generation) return;
      const restored = buildCategories(inlineEmojis, setCategories);
      if (restored.length > 0) {
        customEmojis = restored;
        log.info('Restored emojis from DB', {
          categoryCount: restored.length,
          totalEmojis: restored.reduce((sum, category) => sum + category.emojis.length, 0)
        });
      }
    }

    // Fetch latest from relay via fetchLatest (kind:10030)
    const latestEvent = await fetchLatest(pubkey, 10030, {
      timeout: 5000,
      directFallback: true
    });
    if (gen !== generation) return;

    if (!latestEvent) {
      // No emoji list found — keep cached results if any
      log.info('No emoji list found on relays');
      return;
    }

    const { inlineEmojis, setRefs } = extractFromEmojiList(latestEvent);

    log.info('Emoji list loaded', {
      inlineCount: inlineEmojis.length,
      setRefCount: setRefs.length
    });

    const setCategories: EmojiCategory[] = [];

    if (setRefs.length > 0) {
      const [{ createSyncedQuery }, { getRxNostr }] = await Promise.all([
        import('@ikuradon/auftakt/sync'),
        import('$shared/nostr/client.js')
      ]);
      const rxNostr = await getRxNostr();
      const { firstValueFrom, filter, timeout, catchError, of, merge, map, take } =
        await import('rxjs');
      const { shareReplay, startWith, withLatestFrom } = await import('rxjs/operators');

      const BATCH_SIZE = 20;

      for (let i = 0; i < setRefs.length; i += BATCH_SIZE) {
        const batch = setRefs.slice(i, i + BATCH_SIZE);
        const filters = batch
          .map((ref) => {
            const parts = ref.split(':');
            if (parts.length < 3 || !parts[1] || !parts[2]) return null;
            return { kinds: [30030 as number], authors: [parts[1]], '#d': [parts[2]] };
          })
          .filter((f): f is NonNullable<typeof f> => f !== null);

        if (filters.length === 0) continue;

        const authors = [...new Set(filters.flatMap((f) => f.authors))];
        const dTags = [...new Set(filters.flatMap((f) => f['#d']))];
        const requestedKeys = new Set(
          filters.flatMap((f) =>
            f.authors.flatMap((author) => f['#d'].map((dTag) => buildSetKey(author, dTag)))
          )
        );
        const onlyRequestedKey = requestedKeys.size === 1 ? [...requestedKeys][0] : undefined;
        const uniqueKeyByDTag = new Map<string, string | null>();
        for (const f of filters) {
          const author = f.authors[0];
          const dTag = f['#d'][0];
          if (!author || !dTag) continue;
          const key = buildSetKey(author, dTag);
          const existing = uniqueKeyByDTag.get(dTag);
          uniqueKeyByDTag.set(dTag, existing && existing !== key ? null : key);
        }

        const synced = createSyncedQuery(rxNostr, store, {
          filter: { kinds: [30030], authors, '#d': dTags },
          strategy: 'backward'
        });
        const sharedEvents$ = synced.events$.pipe(
          startWith([] as unknown[]),
          shareReplay({ bufferSize: 1, refCount: true })
        );

        let batchCategories: Array<EmojiCategory | null> = [];
        try {
          const result = await firstValueFrom(
            merge(
              sharedEvents$.pipe(
                filter((events: unknown[]) => events.length > 0),
                take(1)
              ),
              synced.status$.pipe(
                filter((status: unknown) => status === 'complete'),
                take(1),
                withLatestFrom(sharedEvents$),
                map(([, events]) => events as unknown[])
              )
            ).pipe(
              timeout(5000),
              catchError(() => of(null))
            )
          );

          if (Array.isArray(result) && result.length > 0) {
            const matchedByKey = new Map<string, EmojiCategory>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const cachedEvent of result as any[]) {
              const author = cachedEvent.event.pubkey;
              const dTag = findTagValue(cachedEvent.event.tags, 'd');
              const key = author
                ? dTag
                  ? buildSetKey(author, dTag)
                  : onlyRequestedKey
                : dTag
                  ? (uniqueKeyByDTag.get(dTag) ?? onlyRequestedKey)
                  : onlyRequestedKey;
              if (!key) continue;
              if (!requestedKeys.has(key) || matchedByKey.has(key)) continue;
              const category = buildCategoryFromEvent(cachedEvent.event);
              if (category) matchedByKey.set(key, category);
            }
            batchCategories = filters.map((f) => {
              const author = f.authors[0];
              const dTag = f['#d'][0];
              if (!author || !dTag) return null;
              return matchedByKey.get(buildSetKey(author, dTag)) ?? null;
            });
          }
        } finally {
          synced.dispose();
        }

        if (gen !== generation) return;
        for (const cat of batchCategories) {
          if (cat) setCategories.push(cat);
        }
      }
    }

    customEmojis = buildCategories(inlineEmojis, setCategories);
    log.info('Custom emojis ready', {
      categoryCount: customEmojis.length,
      totalEmojis: customEmojis.reduce((sum, category) => sum + category.emojis.length, 0)
    });
  } catch (err) {
    log.error('Failed to load custom emojis', err);
  } finally {
    if (gen === generation) {
      loading = false;
    }
  }
}

export function clearCustomEmojis(): void {
  log.info('Clearing custom emojis');
  ++generation;
  customEmojis = [];
  loading = false;
}
