import { startIntervalTask } from '$shared/browser/interval-task.js';

export interface DemoComment {
  id: string;
  author: string;
  content: string;
  positionMs: number;
  createdAt: number;
  arrivedAt: number;
  hasCW?: boolean;
  hasEmoji?: boolean;
}

export interface PlaybookVirtualList {
  scrollToIndex(index: number): void;
  isAutoScrolling(): boolean;
}

const ADJECTIVES = ['Great', 'Amazing', 'Love this', 'Nice', 'Cool', 'Interesting', 'Wow'];
const SUFFIXES = [
  'part!',
  'moment here',
  'beat drop',
  'section',
  'transition',
  'melody',
  'vibe',
  'solo',
  'hook',
  'chorus'
];
const AUTHORS = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'heidi'];
const LONG_TEXTS = [
  'This is a much longer comment that spans multiple lines to test dynamic height handling in the virtual scroll component. The comment card should expand to fit this content naturally.',
  'Short',
  'Another extended comment with lots of detail about the track. I really enjoyed the way the bass line interacts with the melody at this point. The producer did an excellent job here.',
  'Medium length comment with some extra words to make it a bit taller than the short ones but not as tall as the really long ones.',
  "Five lines worth of content to really push the dynamic height. This comment discusses the intricate layering of instruments in the bridge section. The synthesizer pad creates an ethereal atmosphere while the drums maintain a steady groove. I particularly love how the vocals soar over the top. It's moments like these that make music so special and worth discussing."
];
const CW_REASONS = ['spoiler', 'loud section', 'controversial opinion'];
const CUSTOM_EMOJIS = [
  {
    shortcode: 'fire',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f525.svg'
  },
  {
    shortcode: 'heart_eyes',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60d.svg'
  },
  {
    shortcode: 'musical_note',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f3b5.svg'
  },
  {
    shortcode: 'star',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2b50.svg'
  },
  {
    shortcode: 'thumbsup',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f44d.svg'
  }
] as const;

const NEW_HIGHLIGHT_MS = 3_000;
const HIGHLIGHT_MS = 5_000;
const PLAYBACK_DURATION = 300_000;

export function createPlaybookContentViewModel() {
  let sending = $state(false);
  let liked = $state(false);
  let confirmOpen = $state(false);
  let spotifyReady = $state(false);
  let youtubeReady = $state(false);
  let nextId = $state(0);
  let sendingResetTimer = $state<ReturnType<typeof setTimeout> | undefined>();

  let fps = $state(0);
  let fpsFrames = 0;
  let fpsLastTime = 0;

  let autoAddEnabled = $state(false);
  let highlightTick = $state(0);
  let demoComments = $state<DemoComment[]>(generateInitial(200));

  let playbackMs = $state(0);
  let playbackPlaying = $state(false);

  let virtualList = $state<PlaybookVirtualList | undefined>();
  let autoScrollEnabled = $state(true);
  let userScrolledAway = $state(false);
  let visibleStart = $state(0);
  let visibleEnd = $state(0);
  let revealedCW = $state(new Set<string>());

  function randomComment(positionMs?: number, isNew = false): DemoComment {
    const id = `demo-${nextId++}`;
    const roll = Math.random();
    const content =
      roll < 0.2
        ? LONG_TEXTS[Math.floor(Math.random() * LONG_TEXTS.length)]
        : `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}`;

    return {
      id,
      author: AUTHORS[Math.floor(Math.random() * AUTHORS.length)],
      content,
      positionMs: positionMs ?? Math.floor(Math.random() * PLAYBACK_DURATION),
      createdAt: Date.now(),
      arrivedAt: isNew ? Date.now() : 0,
      hasCW: Math.random() < 0.08,
      hasEmoji: Math.random() < 0.15
    };
  }

  function generateInitial(count: number): DemoComment[] {
    const arr: DemoComment[] = [];
    for (let i = 0; i < count; i++) {
      arr.push(randomComment());
    }
    return arr.sort((a, b) => a.positionMs - b.positionMs);
  }

  $effect(() => {
    if (sendingResetTimer) {
      return () => clearTimeout(sendingResetTimer);
    }
  });

  $effect(() => {
    fpsLastTime = performance.now();
    let rafId = 0;

    const loop = (now: number) => {
      fpsFrames++;
      if (now - fpsLastTime >= 1000) {
        fps = fpsFrames;
        fpsFrames = 0;
        fpsLastTime = now;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  });

  $effect(() => {
    const task = startIntervalTask(() => {
      highlightTick += 1;
    }, 500);

    return () => task.stop();
  });

  $effect(() => {
    if (!playbackPlaying) return;

    const task = startIntervalTask(() => {
      playbackMs += 1000;
      if (playbackMs >= PLAYBACK_DURATION) {
        playbackMs = 0;
      }
    }, 1000);

    return () => task.stop();
  });

  $effect(() => {
    if (!autoAddEnabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (cancelled || !autoAddEnabled) return;
      timer = setTimeout(
        () => {
          addRandomComment(true);
          schedule();
        },
        500 + Math.random() * 2500
      );
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  });

  $effect(() => {
    if (autoScrollEnabled && !userScrolledAway && demoComments.length > 0 && virtualList) {
      virtualList.scrollToIndex(findNearestIndex(playbackMs));
    }
  });

  function simulateSend(): void {
    sending = true;
    if (sendingResetTimer) clearTimeout(sendingResetTimer);
    sendingResetTimer = setTimeout(() => {
      sending = false;
      sendingResetTimer = undefined;
    }, 2000);
  }

  function toggleLiked(): void {
    liked = !liked;
  }

  function openConfirm(): void {
    confirmOpen = true;
  }

  function closeConfirm(): void {
    confirmOpen = false;
  }

  function toggleSpotifyReady(): void {
    spotifyReady = !spotifyReady;
  }

  function toggleYoutubeReady(): void {
    youtubeReady = !youtubeReady;
  }

  function formatMs(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function togglePlayback(): void {
    playbackPlaying = !playbackPlaying;
  }

  function seekTo(ms: number): void {
    playbackMs = Math.max(0, Math.min(ms, PLAYBACK_DURATION));
  }

  function setPlaybackPosition(ms: number): void {
    seekTo(ms);
  }

  function setVirtualList(list: PlaybookVirtualList | undefined): void {
    virtualList = list;
  }

  function setAutoScrollEnabled(next: boolean): void {
    autoScrollEnabled = next;
  }

  function findNearestIndex(posMs: number): number {
    let lo = 0;
    let hi = demoComments.length - 1;
    let result = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (demoComments[mid].positionMs <= posMs) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return result;
  }

  function handleRangeChange(start: number, end: number): void {
    visibleStart = start;
    visibleEnd = end;

    if (autoScrollEnabled && virtualList && !virtualList.isAutoScrolling()) {
      const target = findNearestIndex(playbackMs);
      if (target < start || target > end) {
        userScrolledAway = true;
      }
    }
  }

  function jumpToNow(): void {
    userScrolledAway = false;
    if (virtualList) {
      virtualList.scrollToIndex(findNearestIndex(playbackMs));
    }
  }

  function addRandomComment(isNew = false): void {
    const jitter = (Math.random() - 0.5) * 10_000;
    const positionMs = Math.max(0, Math.min(playbackMs + jitter, PLAYBACK_DURATION));
    const comment = randomComment(positionMs, isNew);

    let lo = 0;
    let hi = demoComments.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (demoComments[mid].positionMs <= positionMs) lo = mid + 1;
      else hi = mid;
    }

    demoComments = [...demoComments.slice(0, lo), comment, ...demoComments.slice(lo)];
  }

  function deleteRandomComment(): void {
    if (demoComments.length === 0) return;
    const idx = visibleStart + Math.floor(Math.random() * (visibleEnd - visibleStart + 1));
    const safeIdx = Math.min(Math.max(0, idx), demoComments.length - 1);
    demoComments = [...demoComments.slice(0, safeIdx), ...demoComments.slice(safeIdx + 1)];
  }

  function addBulk(count: number): void {
    const newComments: DemoComment[] = [];
    for (let i = 0; i < count; i++) {
      newComments.push(randomComment());
    }
    demoComments = [...demoComments, ...newComments].sort((a, b) => a.positionMs - b.positionMs);
  }

  function toggleAutoAdd(): void {
    autoAddEnabled = !autoAddEnabled;
  }

  function revealCW(id: string): void {
    revealedCW = new Set([...revealedCW, id]);
  }

  function isNearCurrentPosition(positionMs: number): boolean {
    return Math.abs(positionMs - playbackMs) < HIGHLIGHT_MS;
  }

  function isNewComment(comment: DemoComment): boolean {
    void highlightTick;
    return comment.arrivedAt > 0 && Date.now() - comment.arrivedAt < NEW_HIGHLIGHT_MS;
  }

  function isRevealed(id: string): boolean {
    return revealedCW.has(id);
  }

  function getCwReason(index: number): string {
    return CW_REASONS[index % CW_REASONS.length];
  }

  function getEmoji(index: number) {
    return CUSTOM_EMOJIS[index % CUSTOM_EMOJIS.length];
  }

  return {
    get sending() {
      return sending;
    },
    get liked() {
      return liked;
    },
    get confirmOpen() {
      return confirmOpen;
    },
    get spotifyReady() {
      return spotifyReady;
    },
    get youtubeReady() {
      return youtubeReady;
    },
    get demoComments() {
      return demoComments;
    },
    get playbackMs() {
      return playbackMs;
    },
    get playbackPlaying() {
      return playbackPlaying;
    },
    get autoAddEnabled() {
      return autoAddEnabled;
    },
    get autoScrollEnabled() {
      return autoScrollEnabled;
    },
    get userScrolledAway() {
      return userScrolledAway;
    },
    get visibleStart() {
      return visibleStart;
    },
    get visibleEnd() {
      return visibleEnd;
    },
    get fps() {
      return fps;
    },
    get revealedCW() {
      return revealedCW;
    },
    get playbackDuration() {
      return PLAYBACK_DURATION;
    },
    get highlightMs() {
      return HIGHLIGHT_MS;
    },
    simulateSend,
    toggleLiked,
    openConfirm,
    closeConfirm,
    toggleSpotifyReady,
    toggleYoutubeReady,
    formatMs,
    togglePlayback,
    seekTo,
    setPlaybackPosition,
    setVirtualList,
    setAutoScrollEnabled,
    handleRangeChange,
    jumpToNow,
    addRandomComment,
    deleteRandomComment,
    addBulk,
    toggleAutoAdd,
    revealCW,
    isNearCurrentPosition,
    isNewComment,
    isRevealed,
    getCwReason,
    getEmoji
  };
}
