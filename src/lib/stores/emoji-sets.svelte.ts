/**
 * Custom emoji sets store (NIP-30 + NIP-51 kind:10030).
 * Fetches the user's emoji list and referenced kind:30030 emoji set events.
 */

import { isEmojiTag } from '../utils/emoji.js';
import { createLogger, shortHex } from '../utils/logger.js';

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

/** Extract inline emojis and set refs from a kind:10030 event. */
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

/** Build an EmojiCategory from a kind:30030 event. */
function buildCategoryFromEvent(event: { id: string; tags: string[][] }): EmojiCategory | null {
  const dTag = event.tags.find((t) => t[0] === 'd');
  const title = event.tags.find((t) => t[0] === 'title');
  const setName = title?.[1] ?? dTag?.[1] ?? 'Emoji Set';
  const setId = `set-${event.id.slice(0, 8)}`;

  const emojis = event.tags
    .filter((t) => isEmojiTag(t))
    .map((t) => ({
      id: t[1],
      name: t[1],
      skins: [{ src: t[2] }]
    }));

  if (emojis.length === 0) return null;
  return { id: setId, name: setName, emojis };
}

/** Build final categories from inline emojis and set categories. */
function buildCategories(
  inlineEmojis: CustomEmoji[],
  setCategories: EmojiCategory[]
): EmojiCategory[] {
  const categories: EmojiCategory[] = [];

  if (inlineEmojis.length > 0) {
    categories.push({
      id: 'custom-inline',
      name: 'Custom',
      emojis: inlineEmojis.map((e) => ({
        id: e.shortcode,
        name: e.shortcode,
        skins: [{ src: e.url }]
      }))
    });
  }

  categories.push(...setCategories);
  return categories;
}

/**
 * Fetch kind:10030 emoji list for the given pubkey.
 * Restores from DB first, then fetches from relays to update.
 */
export async function loadCustomEmojis(pubkey: string): Promise<void> {
  const gen = ++generation;
  loading = true;
  log.info('Loading custom emojis', { pubkey: shortHex(pubkey) });

  try {
    const { getEventsDB } = await import('../nostr/event-db.js');
    const eventsDB = await getEventsDB();

    // Restore from DB for instant display
    const cachedList = await eventsDB.getByPubkeyAndKind(pubkey, 10030);
    if (gen !== generation) return;

    if (cachedList) {
      const { inlineEmojis, setRefs } = extractFromEmojiList(cachedList);

      const setCategories = (
        await Promise.all(
          setRefs.map(async (ref) => {
            const [, refPubkey, dTag] = ref.split(':');
            const cached = await eventsDB.getByReplaceKey(refPubkey, 30030, dTag);
            return cached ? buildCategoryFromEvent(cached) : null;
          })
        )
      ).filter((c): c is EmojiCategory => c !== null);

      if (gen !== generation) return;
      const restored = buildCategories(inlineEmojis, setCategories);
      if (restored.length > 0) {
        customEmojis = restored;
        log.info('Restored emojis from DB', {
          categoryCount: restored.length,
          totalEmojis: restored.reduce((sum, c) => sum + c.emojis.length, 0)
        });
      }
    }

    // Fetch from relays
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('../nostr/client.js')
    ]);
    const rxNostr = await getRxNostr();

    // Step 1: Fetch kind:10030 (user's emoji list)
    const { inlineEmojis, setRefs } = await new Promise<{
      inlineEmojis: CustomEmoji[];
      setRefs: string[];
    }>((resolve) => {
      const req = createRxBackwardReq();
      const emojis: CustomEmoji[] = [];
      const refs: string[] = [];

      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          eventsDB.put(packet.event);
          for (const tag of packet.event.tags) {
            if (isEmojiTag(tag)) {
              emojis.push({ shortcode: tag[1], url: tag[2] });
            } else if (tag[0] === 'a' && tag[1]?.startsWith('30030:')) {
              refs.push(tag[1]);
            }
          }
        },
        complete: () => {
          sub.unsubscribe();
          resolve({ inlineEmojis: emojis, setRefs: refs });
        },
        error: () => {
          sub.unsubscribe();
          resolve({ inlineEmojis: emojis, setRefs: refs });
        }
      });

      req.emit({ kinds: [10030], authors: [pubkey], limit: 1 });
      req.over();
    });

    if (gen !== generation) return;

    log.info('Emoji list loaded', {
      inlineCount: inlineEmojis.length,
      setRefCount: setRefs.length
    });

    // Step 2: Fetch referenced kind:30030 emoji set events
    const setCategories: EmojiCategory[] = [];

    if (setRefs.length > 0) {
      const BATCH_SIZE = 20;
      const batchPromises: Promise<EmojiCategory[]>[] = [];

      for (let i = 0; i < setRefs.length; i += BATCH_SIZE) {
        const batch = setRefs.slice(i, i + BATCH_SIZE);
        const filters = batch.map((ref) => {
          const [, refPubkey, dTag] = ref.split(':');
          return { kinds: [30030 as number], authors: [refPubkey], '#d': [dTag] };
        });

        batchPromises.push(
          new Promise<EmojiCategory[]>((resolve) => {
            const req = createRxBackwardReq();
            const categories: EmojiCategory[] = [];

            const sub = rxNostr.use(req).subscribe({
              next: (packet) => {
                eventsDB.put(packet.event);
                const cat = buildCategoryFromEvent(packet.event);
                if (cat) categories.push(cat);
              },
              complete: () => {
                sub.unsubscribe();
                resolve(categories);
              },
              error: () => {
                sub.unsubscribe();
                resolve(categories);
              }
            });

            for (const filter of filters) {
              req.emit(filter);
            }
            req.over();
          })
        );
      }

      const results = await Promise.all(batchPromises);
      if (gen !== generation) return;
      for (const batch of results) {
        setCategories.push(...batch);
      }
    }

    customEmojis = buildCategories(inlineEmojis, setCategories);
    log.info('Custom emojis ready', {
      categoryCount: customEmojis.length,
      totalEmojis: customEmojis.reduce((sum, c) => sum + c.emojis.length, 0)
    });
  } catch (err) {
    log.error('Failed to load custom emojis', err);
  } finally {
    if (gen === generation) {
      loading = false;
    }
  }
}

/** Clear custom emojis (called on logout). In-memory only — DB cleared separately. */
export function clearCustomEmojis(): void {
  log.info('Clearing custom emojis');
  ++generation;
  customEmojis = [];
  loading = false;
}
