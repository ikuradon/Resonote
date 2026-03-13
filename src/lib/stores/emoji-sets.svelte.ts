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

/**
 * Fetch kind:10030 emoji list for the given pubkey.
 * Extracts inline emoji tags and resolves referenced kind:30030 sets.
 */
export async function loadCustomEmojis(pubkey: string): Promise<void> {
  const gen = ++generation;
  loading = true;
  log.info('Loading custom emojis', { pubkey: shortHex(pubkey) });

  try {
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

    // Step 2: Fetch referenced kind:30030 emoji set events (all batches in parallel)
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
                const dTag = packet.event.tags.find((t: string[]) => t[0] === 'd');
                const title = packet.event.tags.find((t: string[]) => t[0] === 'title');
                const setName = title?.[1] ?? dTag?.[1] ?? 'Emoji Set';
                const setId = `set-${packet.event.id.slice(0, 8)}`;

                const emojis = packet.event.tags
                  .filter((t: string[]) => isEmojiTag(t))
                  .map((t: string[]) => ({
                    id: t[1],
                    name: t[1],
                    skins: [{ src: t[2] }]
                  }));

                if (emojis.length > 0) {
                  categories.push({ id: setId, name: setName, emojis });
                }
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

    // Build final categories
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

    customEmojis = categories;
    log.info('Custom emojis ready', {
      categoryCount: categories.length,
      totalEmojis: categories.reduce((sum, c) => sum + c.emojis.length, 0)
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
