<script lang="ts">
  import type { Snippet } from 'svelte';

  import { startIntervalTask } from '$shared/browser/interval-task.js';
  import { t } from '$shared/i18n/t.js';

  import WaveformLoader from './WaveformLoader.svelte';

  interface Props {
    /** Tailwind bg color class for waveform bars */
    color: string;
    /** Brand icon snippet */
    icon: Snippet;
    /** Number of waveform bars */
    bars?: number;
    /** Duration in ms to reach max progress (default: 15000) */
    duration?: number;
    /** Max progress to reach via time (default: 0.8) */
    maxProgress?: number;
    /** Minimum height Tailwind class (e.g. 'min-h-[150px]') to prevent zero-height when parent has no size yet */
    minHeight?: string;
  }

  let { color, icon, bars = 16, duration = 15000, maxProgress = 0.8, minHeight }: Props = $props();

  let progress = $state<number | undefined>(undefined);

  $effect(() => {
    const start = Date.now();
    const progressTask = startIntervalTask(() => {
      const elapsed = Date.now() - start;
      const ratio = Math.min(elapsed / duration, 1);
      // Ease-out: fast start, slows near max
      progress = maxProgress * (1 - Math.pow(1 - ratio, 3));
    }, 500);
    return () => progressTask.stop();
  });
</script>

<div
  class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1 {minHeight ??
    ''}"
>
  <div class="flex items-center gap-3">
    {@render icon()}
    <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
  </div>
  <WaveformLoader {color} {bars} {progress} />
</div>
