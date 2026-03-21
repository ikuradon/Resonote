<script lang="ts">
  interface Props {
    /** Progress 0-1. Undefined = indeterminate wave */
    progress?: number;
    /** Tailwind bg color class for active bars */
    color?: string;
    /** Number of bars */
    bars?: number;
    /** Height class */
    height?: string;
  }

  let { progress, color = 'bg-accent', bars = 5, height = 'h-4' }: Props = $props();

  const delays = $derived(Array.from({ length: bars }, (_, i) => (i * 0.8) / bars));
</script>

<div class="flex items-center gap-[2px] {height}" aria-hidden="true">
  {#each delays as delay, i (i)}
    {@const active = progress === undefined || i / bars < progress}
    <span
      class="w-[3px] rounded-sm {active ? color : 'bg-surface-3'}"
      style="height: 100%; {active
        ? `animation: waveform 1.2s ease-in-out infinite; animation-delay: ${delay}s; animation-fill-mode: backwards`
        : 'transform: scaleY(0.1)'}"
    ></span>
  {/each}
</div>
