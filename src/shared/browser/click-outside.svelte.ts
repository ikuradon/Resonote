/**
 * Reactive document click-outside helper for Svelte 5 components.
 */

export interface ClickOutsideOptions {
  active: () => boolean;
  isInside: (target: Node | null) => boolean;
  onOutside: () => void;
}

export function isNodeInsideElements(
  target: Node | null,
  elements: Array<Node | null | undefined>
): boolean {
  if (!target) return false;
  return elements.some((element) => element?.contains(target));
}

export function manageClickOutside(options: ClickOutsideOptions) {
  $effect(() => {
    if (!options.active()) return;

    const handler = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (options.isInside(target)) return;
      options.onOutside();
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  });
}
