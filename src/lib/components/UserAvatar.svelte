<script lang="ts">
  interface Props {
    pubkey: string;
    picture?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    ring?: boolean;
    'data-testid'?: string;
  }

  let { pubkey, picture, size = 'sm', ring = true, 'data-testid': dataTestId }: Props = $props();

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
  const isFallback = $derived(!picture || imgError);
  const testId = $derived(
    dataTestId ? (isFallback ? `${dataTestId}-fallback` : `${dataTestId}-image`) : undefined
  );
</script>

<img
  {src}
  alt=""
  class="{sizeClass} rounded-full object-cover {ringClass}"
  loading="lazy"
  data-testid={testId}
  onerror={() => {
    imgError = true;
  }}
/>
