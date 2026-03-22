<script lang="ts">
  interface Props {
    label: string;
    colorClass: string;
  }

  let { label, colorClass }: Props = $props();
</script>

<div
  class="{colorClass} flex items-center justify-center px-2 py-0.5 text-xs font-semibold text-white"
>
  {label}
</div>
