<script lang="ts">
  interface Props {
    pubkey: string;
    picture?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    ring?: boolean;
  }

  let { pubkey, picture, size = 'sm', ring = true }: Props = $props();

  const STELLARID_BASE = 'https://stellarid.ikuradon.deno.net';

  let imgError = $state(false);

  // Reset error state when picture URL changes (e.g. async profile load)
  $effect(() => {
    void picture;
    imgError = false;
  });

  const sizeClass = $derived(
    {
      xs: 'h-5 w-5',
      sm: 'h-6 w-6',
      md: 'h-7 w-7',
      lg: 'h-8 w-8',
      xl: 'h-16 w-16'
    }[size]
  );

  const ringClass = $derived(
    ring ? (size === 'xl' ? 'ring-2 ring-border' : 'ring-1 ring-border') : ''
  );

  const src = $derived(picture && !imgError ? picture : `${STELLARID_BASE}/${pubkey}`);
</script>

<img
  {src}
  alt=""
  class="{sizeClass} rounded-full object-cover {ringClass}"
  loading="lazy"
  onerror={() => {
    imgError = true;
  }}
/>
