<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { getCustomEmojis } from '$shared/browser/emoji-sets.js';
  import { createMediaQuery } from '$shared/browser/media-query.js';
  import { addEmojiTag, extractShortcode } from '$shared/utils/emoji.js';
  import { allocateEmojiPopoverId } from './emoji-popover-id.js';
  import EmojiPickerPopover from './EmojiPickerPopover.svelte';
  import MobileOverlay from './MobileOverlay.svelte';
  import type { MentionCandidate } from '$features/comments/ui/mention-candidates.js';
  import { npubEncode } from 'nostr-tools/nip19';

  interface Props {
    content: string;
    emojiTags: string[][];
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    onsubmit?: () => void;
    children?: Snippet;
    mentionCandidates?: MentionCandidate[];
    onmentionquery?: (query: string) => void;
  }

  let {
    content = $bindable(),
    emojiTags = $bindable(),
    disabled = false,
    placeholder = '',
    rows = 1,
    onsubmit,
    children,
    mentionCandidates = [],
    onmentionquery
  }: Props = $props();

  const pickerId = allocateEmojiPopoverId();
  const emojiSets = getCustomEmojis();
  const desktop = createMediaQuery('(min-width: 1024px)');
  let isDesktop = $derived(desktop.matches);

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let composing = $state(false);
  let autocomplete = $state<{
    type: 'emoji' | 'hashtag' | 'mention';
    query: string;
    startPos: number;
  } | null>(null);
  let selectedIndex = $state(0);
  let prevContentLength = $state(0);
  let suppressUntilNewChar = $state(false);

  const HASHTAG_SUGGESTIONS = [
    'NowPlaying',
    'Music',
    'Spotify',
    'Rock',
    'Pop',
    'Jazz',
    'HipHop',
    'Electronic',
    'Classical',
    'Chill',
    'Happy',
    'Sad',
    'Energetic',
    'Favorite',
    'Recommend',
    'NewRelease'
  ];

  interface SuggestionItem {
    label: string;
    shortcode: string;
    url: string;
    /** Set only for mention suggestions */
    mentionPubkey?: string;
    mentionNip05?: string;
  }

  let suggestions = $derived.by<SuggestionItem[]>(() => {
    if (!autocomplete) return [];
    const q = autocomplete.query.toLowerCase();

    if (autocomplete.type === 'emoji') {
      const results: SuggestionItem[] = [];
      for (const cat of emojiSets.categories) {
        for (const e of cat.emojis) {
          if (e.id.toLowerCase().includes(q)) {
            results.push({ label: `:${e.id}:`, shortcode: e.id, url: e.skins[0].src });
          }
          if (results.length >= 8) break;
        }
        if (results.length >= 8) break;
      }
      return results;
    }

    if (autocomplete.type === 'mention') {
      return mentionCandidates.map((c) => ({
        label: `@${c.displayName}`,
        shortcode: c.pubkey,
        url: c.picture ?? '',
        mentionPubkey: c.pubkey,
        mentionNip05: c.nip05
      }));
    }

    // hashtag
    return HASHTAG_SUGGESTIONS.filter((t) => t.toLowerCase().includes(q))
      .slice(0, 8)
      .map((t) => ({ label: `#${t}`, shortcode: t, url: '' }));
  });

  function insertEmoji(reaction: string, emojiUrl?: string) {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    content = content.slice(0, start) + reaction + content.slice(end);
    if (emojiUrl) {
      emojiTags = addEmojiTag(emojiTags, extractShortcode(reaction), emojiUrl);
    }
    tick().then(() => {
      if (textareaEl) {
        const pos = start + reaction.length;
        textareaEl.selectionStart = pos;
        textareaEl.selectionEnd = pos;
        textareaEl.focus();
      }
    });
  }

  function detectAutocomplete() {
    if (!textareaEl) return;
    const pos = textareaEl.selectionStart;
    const before = content.slice(0, pos);

    // Detect @query (mention) — @ at start of text or after whitespace
    if (onmentionquery) {
      const mentionMatch = before.match(/(?:^|\s)@([^\s]*)$/);
      if (mentionMatch) {
        const query = mentionMatch[1];
        autocomplete = {
          type: 'mention',
          query,
          startPos: pos - query.length - 1
        };
        selectedIndex = 0;
        onmentionquery(query);
        return;
      }
    }

    // Detect :query (emoji)
    const emojiMatch = before.match(/:([^:\s]*)$/);
    if (emojiMatch) {
      autocomplete = { type: 'emoji', query: emojiMatch[1], startPos: pos - emojiMatch[0].length };
      selectedIndex = 0;
      return;
    }

    // Detect #query (hashtag)
    const hashMatch = before.match(
      /(?:^|\s)#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]*)$/
    );
    if (hashMatch) {
      autocomplete = {
        type: 'hashtag',
        query: hashMatch[1],
        startPos: pos - hashMatch[1].length - 1
      };
      selectedIndex = 0;
      return;
    }

    autocomplete = null;
  }

  function handleInput() {
    if (composing) return;
    const lengthDiff = content.length - prevContentLength;
    // Detect single-char deletion vs external reset (e.g. form submit clearing content)
    const isDeleting = lengthDiff === -1;
    prevContentLength = content.length;

    if (suppressUntilNewChar) {
      if (isDeleting) return;
      suppressUntilNewChar = false;
    }

    if (isDeleting && !autocomplete) {
      // Don't open new autocomplete while deleting one char at a time
      return;
    }

    detectAutocomplete();
  }

  function acceptSuggestion(item: SuggestionItem) {
    if (!autocomplete || !textareaEl) return;
    const cursorPos = textareaEl.selectionStart;
    const { startPos, type } = autocomplete;

    let replacement: string;
    if (type === 'emoji') {
      replacement = `:${item.shortcode}: `;
      if (item.url) {
        emojiTags = addEmojiTag(emojiTags, item.shortcode, item.url);
      }
    } else if (type === 'mention' && item.mentionPubkey) {
      const npub = npubEncode(item.mentionPubkey);
      replacement = `nostr:${npub} `;
    } else {
      replacement = `#${item.shortcode} `;
    }

    content = content.slice(0, startPos) + replacement + content.slice(cursorPos);
    autocomplete = null;

    tick().then(() => {
      if (textareaEl) {
        const newPos = startPos + replacement.length;
        textareaEl.selectionStart = newPos;
        textareaEl.selectionEnd = newPos;
        textareaEl.focus();
      }
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (composing) return;

    if (autocomplete && suggestions.length > 0) {
      // Clamp selectedIndex in case suggestions shrank asynchronously
      if (selectedIndex >= suggestions.length) {
        selectedIndex = Math.max(0, suggestions.length - 1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % suggestions.length;
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptSuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        autocomplete = null;
        suppressUntilNewChar = true;
        return;
      }
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onsubmit?.();
    }
  }
</script>

{#snippet suggestionContent(item: SuggestionItem)}
  {#if autocomplete?.type === 'mention' && item.url}
    <img src={item.url} alt="" class="h-5 w-5 rounded-full object-cover" />
  {:else if autocomplete?.type === 'mention'}
    <div
      class="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[10px] text-text-muted"
    >
      @
    </div>
  {:else if autocomplete?.type === 'emoji' && item.url}
    <img src={item.url} alt={item.shortcode} class="h-5 w-5 object-contain" />
  {/if}
  <span class="truncate">{item.label}</span>
  {#if item.mentionNip05}
    <span class="ml-auto truncate text-xs text-text-muted">{item.mentionNip05}</span>
  {/if}
{/snippet}

<div class="relative">
  {#if autocomplete && suggestions.length > 0}
    {#if isDesktop || autocomplete.type === 'mention'}
      <div
        class="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-64 overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-surface-0 shadow-lg"
      >
        {#each suggestions as item, i (item.shortcode)}
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors {i ===
            selectedIndex
              ? 'bg-accent/15 text-accent'
              : 'text-text-primary hover:bg-surface-2'}"
            onmousedown={(e) => {
              e.preventDefault();
              acceptSuggestion(item);
            }}
            onmouseenter={() => (selectedIndex = i)}
          >
            {@render suggestionContent(item)}
          </button>
        {/each}
      </div>
    {:else}
      <MobileOverlay
        open={true}
        onclose={() => {
          autocomplete = null;
        }}
        title={autocomplete.type === 'emoji' ? 'Emoji' : 'Hashtag'}
      >
        <div class="flex flex-col gap-1">
          {#each suggestions as item, i (item.shortcode)}
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors {i ===
              selectedIndex
                ? 'bg-accent/15 text-accent'
                : 'text-text-primary hover:bg-surface-2'} rounded-lg"
              onclick={() => acceptSuggestion(item)}
            >
              {@render suggestionContent(item)}
            </button>
          {/each}
        </div>
      </MobileOverlay>
    {/if}
  {/if}

  <div class="flex items-center gap-3">
    <textarea
      bind:this={textareaEl}
      bind:value={content}
      oninput={handleInput}
      onkeydown={handleKeydown}
      oncompositionstart={() => (composing = true)}
      oncompositionend={() => {
        composing = false;
        handleInput();
      }}
      aria-label={placeholder}
      {placeholder}
      {disabled}
      {rows}
      class="flex-1 resize-none rounded-xl border border-border bg-surface-1 px-4 py-2.5 text-base text-text-primary placeholder-text-muted transition-all duration-200 focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none disabled:opacity-40 lg:text-sm"
    ></textarea>
    {#if !disabled}
      <EmojiPickerPopover id={pickerId} onSelect={insertEmoji} />
    {/if}
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
