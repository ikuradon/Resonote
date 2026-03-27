<script lang="ts" generics="T">
  import { onDestroy, onMount, type Snippet, untrack } from 'svelte';

  interface Props {
    items: T[];
    keyFn: (item: T) => string;
    estimateHeight?: number;
    overscan?: number;
    children: Snippet<[{ item: T; index: number }]>;
    onRangeChange?: (start: number, end: number) => void;
  }

  let {
    items,
    keyFn,
    estimateHeight = 80,
    overscan = 5,
    children,
    onRangeChange
  }: Props = $props();

  let container: HTMLDivElement | undefined;
  let innerEl: HTMLDivElement | undefined;
  let scrollTop = $state(0);
  let containerHeight = $state(0);

  // --- Prefix sum (cumulative offset array) ---
  // offsets[i] = sum of heights for items[0..i)
  // offsets[items.length] = totalHeight
  const heightCache = new Map<string, number>();
  let offsetVersion = $state(0);

  // Adaptive estimate: running average of measured heights.
  let measuredSum = 0;
  let measuredCount = 0;

  function currentEstimate(): number {
    return measuredCount > 0 ? Math.round(measuredSum / measuredCount) : estimateHeight;
  }

  function heightOf(key: string, estimate: number): number {
    return heightCache.get(key) ?? estimate;
  }

  // Offsets as $derived — always in sync with items (no $effect lag).
  let offsets = $derived.by(() => {
    void offsetVersion; // re-derive when heights are measured
    const estimate = currentEstimate();
    const arr = new Array(items.length + 1);
    arr[0] = 0;
    for (let i = 0; i < items.length; i++) {
      arr[i + 1] = arr[i] + heightOf(keyFn(items[i]), estimate);
    }
    return arr;
  });

  // Partial update: recompute offsets from index k onward.
  // Bumps offsetVersion to trigger offsets re-derivation.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API compatibility
  function updateOffsetsFrom(_k: number) {
    offsetVersion++;
  }

  // Binary search: find largest i where offsets[i] <= target
  function findIndexForOffset(target: number): number {
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= target) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // --- Track previous items to detect insertions and adjust scroll ---
  let prevItemKeys: string[] = [];

  // Track item keys for scroll compensation
  let itemKeys = $derived(items.map(keyFn));

  // Post-DOM effects: sync containerHeight/scrollTop, compensate scroll for insertions
  $effect(() => {
    const newKeys = itemKeys;
    const oldKeys = prevItemKeys;

    // Update containerHeight in case it was 0 at mount time (fixes 0→N transition #153)
    // Also sync scrollTop — browser clamps it when scrollHeight shrinks (e.g. item deletion),
    // but our $state doesn't update without a scroll event.
    if (container) {
      containerHeight = container.clientHeight;
      scrollTop = container.scrollTop;
    }

    // Compensate scroll for items inserted above viewport
    if (container && oldKeys.length > 0) {
      const range = untrack(() => visibleRange);
      const oldTopKey = range.start < oldKeys.length ? oldKeys[range.start] : null;

      if (oldTopKey) {
        const newIndex = newKeys.indexOf(oldTopKey);
        const oldIndex = oldKeys.indexOf(oldTopKey);
        if (newIndex >= 0 && oldIndex >= 0) {
          const newOffset = untrack(() => offsets[newIndex]);
          const est = currentEstimate();
          let oldOffset = 0;
          for (let i = 0; i < oldIndex; i++) {
            oldOffset += heightOf(oldKeys[i], est);
          }
          const delta = newOffset - oldOffset;
          if (Math.abs(delta) > 1) {
            container.scrollTop += delta;
            scrollTop = container.scrollTop;
          }
        }
      }
    }

    prevItemKeys = newKeys;
  });

  // --- Visible range via binary search ---
  let visibleRange = $derived.by(() => {
    if (items.length === 0) return { start: 0, end: -1 };

    const startIdx = findIndexForOffset(scrollTop);
    const endOffset = scrollTop + containerHeight;

    let endIdx = startIdx;
    for (let i = startIdx; i < items.length; i++) {
      if (offsets[i] >= endOffset) break;
      endIdx = i;
    }

    const start = Math.max(0, startIdx - overscan);
    const end = Math.min(items.length - 1, endIdx + overscan);
    return { start, end };
  });

  $effect(() => {
    onRangeChange?.(visibleRange.start, visibleRange.end);
  });

  // O(1) lookups via prefix sum
  let totalHeight = $derived(offsets[items.length] ?? 0);

  let offsetTop = $derived(offsets[visibleRange.start] ?? 0);

  let renderedItems = $derived(
    items.length === 0 || visibleRange.end < 0
      ? []
      : items.slice(visibleRange.start, visibleRange.end + 1).map((item, i) => ({
          item,
          index: visibleRange.start + i,
          key: keyFn(item)
        }))
  );

  // --- Programmatic scroll flag ---
  let isProgrammaticScroll = false;
  let programmaticScrollTimer: ReturnType<typeof setTimeout> | undefined;

  function handleScroll() {
    if (container) {
      scrollTop = container.scrollTop;
      containerHeight = container.clientHeight;
    }
  }

  // --- ResizeObserver with differential observe/unobserve ---
  let resizeObserver: ResizeObserver | undefined;
  const observedElements = new Set<Element>();

  onMount(() => {
    if (container) {
      containerHeight = container.clientHeight;
      // Re-measure after first paint in case initial clientHeight was 0
      if (containerHeight === 0) {
        requestAnimationFrame(() => {
          if (container && containerHeight === 0) {
            containerHeight = container.clientHeight;
          }
        });
      }
    }

    // Batched resize handling: collect changes and apply in one rAF
    let pendingScrollDelta = 0;
    let pendingMinChanged = items.length;
    let resizeRafId: number | undefined;

    function flushResizeUpdates() {
      resizeRafId = undefined;
      if (pendingScrollDelta !== 0 && container) {
        container.scrollTop += pendingScrollDelta;
        scrollTop = container.scrollTop;
      }
      untrack(() => updateOffsetsFrom(pendingMinChanged));
      pendingScrollDelta = 0;
      pendingMinChanged = items.length;
    }

    resizeObserver = new ResizeObserver((entries) => {
      let changed = false;
      const firstVisible = untrack(() => visibleRange.start);
      // Build key → index map from current rendered range for O(1) lookup
      const keyToIndex = untrack(() => {
        const map = new Map<string, number>();
        const range = visibleRange;
        for (let i = range.start; i <= range.end && i < items.length; i++) {
          map.set(keyFn(items[i]), i);
        }
        return map;
      });

      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const key = el.dataset.vlKey;
        if (!key) continue;
        const newH = el.getBoundingClientRect().height;
        if (newH === 0) continue; // Skip zero-height measurements (element not yet laid out)
        const oldH = heightCache.get(key);
        if (oldH !== undefined && Math.abs(oldH - newH) < 0.5) continue;

        // Update running average (applied at next rebuildOffsets)
        if (oldH === undefined) {
          measuredSum += newH;
          measuredCount++;
        } else {
          measuredSum += newH - oldH;
        }

        const itemIndex = keyToIndex.get(key) ?? -1;
        if (itemIndex >= 0 && itemIndex < firstVisible) {
          pendingScrollDelta += newH - (oldH ?? currentEstimate());
        }
        if (itemIndex >= 0 && itemIndex < pendingMinChanged) {
          pendingMinChanged = itemIndex;
        }

        heightCache.set(key, newH);
        changed = true;
      }

      if (!changed) return;

      // Batch all updates into a single rAF
      if (resizeRafId === undefined) {
        resizeRafId = requestAnimationFrame(flushResizeUpdates);
      }
    });
  });

  // Differential observe: track which elements are currently observed
  $effect(() => {
    if (!innerEl || !resizeObserver) return;
    const currentEls = new Set<Element>();
    const els = innerEl.children;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      currentEls.add(el);
      if (!observedElements.has(el)) {
        resizeObserver.observe(el);
        observedElements.add(el);
      }
    }
    // Unobserve elements that left the rendered set
    for (const el of observedElements) {
      if (!currentEls.has(el)) {
        resizeObserver.unobserve(el);
        observedElements.delete(el);
      }
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    observedElements.clear();
    heightCache.clear();
    measuredSum = 0;
    measuredCount = 0;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
  });

  export function scrollToIndex(index: number) {
    if (!container || index < 0 || index >= items.length) return;
    const offset = offsets[index] ?? 0;
    const itemHeight = (offsets[index + 1] ?? offset) - offset;
    const centered = offset - (containerHeight - itemHeight) / 2;

    isProgrammaticScroll = true;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticScroll = false;
    }, 500);

    container.scrollTo({ top: Math.max(0, centered), behavior: 'smooth' });
  }

  /** Get current scroll position. */
  export function getScrollTop(): number {
    return container?.scrollTop ?? 0;
  }

  export function scrollToEnd() {
    if (!container) return;
    isProgrammaticScroll = true;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticScroll = false;
    }, 500);
    container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
  }

  export function scrollToOffset(offset: number) {
    isProgrammaticScroll = true;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticScroll = false;
    }, 500);
    container?.scrollTo({ top: offset, behavior: 'smooth' });
  }

  export function isAutoScrolling(): boolean {
    return isProgrammaticScroll;
  }
</script>

<div bind:this={container} onscroll={handleScroll} class="min-h-0 flex-1 overflow-y-auto">
  <div style="height: {totalHeight}px; position: relative;">
    <div bind:this={innerEl} style="position: absolute; top: {offsetTop}px; left: 0; right: 0;">
      {#each renderedItems as { item, index, key } (key)}
        <div data-vl-key={key}>
          {@render children({ item, index })}
        </div>
      {/each}
    </div>
  </div>
</div>
