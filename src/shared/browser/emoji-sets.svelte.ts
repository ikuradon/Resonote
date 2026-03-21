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
  const dTag = event.tags.find((tag) => tag[0] === 'd');
  const title = event.tags.find((tag) => tag[0] === 'title');
  const setName = title?.[1] ?? dTag?.[1] ?? 'Emoji Set';
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
    const { getEventsDB } = await import('$shared/nostr/gateway.js');
    const eventsDB = await getEventsDB();

    const cachedList = await eventsDB.getByPubkeyAndKind(pubkey, 10030);
    if (gen !== generation) return;

    if (cachedList) {
      const { inlineEmojis, setRefs } = extractFromEmojiList(cachedList);

      const setCategories = (
        await Promise.all(
          setRefs.map(async (ref) => {
            const parts = ref.split(':');
            if (parts.length < 3 || !parts[1] || !parts[2]) return null;
            const cached = await eventsDB.getByReplaceKey(parts[1], 30030, parts[2]);
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

    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('$shared/nostr/gateway.js')
    ]);
    const rxNostr = await getRxNostr();

    const { inlineEmojis, setRefs } = await new Promise<{
      inlineEmojis: CustomEmoji[];
      setRefs: string[];
    }>((resolve) => {
      const req = createRxBackwardReq();
      const emojis: CustomEmoji[] = [];
      const refs: string[] = [];

      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          eventsDB
            .put(packet.event)
            .catch((err) => log.error('Failed to cache emoji list event', err));
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

    const setCategories: EmojiCategory[] = [];

    if (setRefs.length > 0) {
      const batchPromises: Promise<EmojiCategory[]>[] = [];
      const BATCH_SIZE = 20;

      for (let i = 0; i < setRefs.length; i += BATCH_SIZE) {
        const batch = setRefs.slice(i, i + BATCH_SIZE);
        const filters = batch
          .map((ref) => {
            const parts = ref.split(':');
            if (parts.length < 3 || !parts[1] || !parts[2]) return null;
            return { kinds: [30030 as number], authors: [parts[1]], '#d': [parts[2]] };
          })
          .filter((filter): filter is NonNullable<typeof filter> => filter !== null);

        batchPromises.push(
          new Promise<EmojiCategory[]>((resolve) => {
            const req = createRxBackwardReq();
            const categories: EmojiCategory[] = [];

            const sub = rxNostr.use(req).subscribe({
              next: (packet) => {
                eventsDB
                  .put(packet.event)
                  .catch((err) => log.error('Failed to cache emoji set event', err));
                const category = buildCategoryFromEvent(packet.event);
                if (category) categories.push(category);
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
