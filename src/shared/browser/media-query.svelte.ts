/**
 * Reactive media query hook for Svelte 5.
 * Returns an object with a reactive `matches` property.
 */
export function createMediaQuery(query: string) {
  let matches = $state(true);

  $effect(() => {
    const mql = window.matchMedia(query);
    matches = mql.matches;

    function handler(event: MediaQueryListEvent) {
      matches = event.matches;
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
