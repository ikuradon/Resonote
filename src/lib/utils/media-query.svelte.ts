/**
 * Reactive media query hook for Svelte 5.
 * Returns an object with a reactive `matches` property.
 *
 * Usage:
 *   const desktop = createMediaQuery('(min-width: 1024px)');
 *   // In template: {#if desktop.matches} ... {/if}
 */
export function createMediaQuery(query: string) {
  let matches = $state(true);

  $effect(() => {
    const mql = window.matchMedia(query);
    matches = mql.matches;
    function handler(e: MediaQueryListEvent) {
      matches = e.matches;
    }
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  });

  return {
    get matches() {
      return matches;
    }
  };
}
