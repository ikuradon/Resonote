import { describe, expect, it, vi } from 'vitest';

import { isNodeInsideElements } from '$shared/browser/click-outside.js';

function createFakeNode(children: unknown[] = []): Node {
  return {
    contains(target: unknown) {
      return target === this || children.includes(target);
    }
  } as Node;
}

describe('isNodeInsideElements', () => {
  it('returns true when the target is inside one of the elements', () => {
    const child = createFakeNode();
    const container = createFakeNode([child]);

    expect(isNodeInsideElements(child, [container])).toBe(true);
  });

  it('returns true when the target is the element itself', () => {
    const node = createFakeNode();
    expect(isNodeInsideElements(node, [node])).toBe(true);
  });

  it('returns true when target is inside any of multiple elements', () => {
    const child = createFakeNode();
    const containerA = createFakeNode();
    const containerB = createFakeNode([child]);

    expect(isNodeInsideElements(child, [containerA, containerB])).toBe(true);
  });

  it('returns false when the target is outside all elements', () => {
    const outside = createFakeNode();
    const container = createFakeNode();

    expect(isNodeInsideElements(outside, [container])).toBe(false);
  });

  it('returns false when target is null', () => {
    const container = createFakeNode();
    expect(isNodeInsideElements(null, [container])).toBe(false);
  });

  it('returns false when elements array is empty', () => {
    const node = createFakeNode();
    expect(isNodeInsideElements(node, [])).toBe(false);
  });

  it('ignores null and undefined elements in the array', () => {
    const node = createFakeNode();
    expect(isNodeInsideElements(node, [undefined, null])).toBe(false);
  });

  it('finds match among null/undefined and valid elements', () => {
    const child = createFakeNode();
    const container = createFakeNode([child]);
    expect(isNodeInsideElements(child, [null, undefined, container])).toBe(true);
  });
});

describe('manageClickOutside handler logic', () => {
  // $effect is unavailable in vitest, so we test the inner handler logic directly.

  function simulateHandler(
    isInside: (target: Node | null) => boolean,
    onOutside: () => void,
    eventTarget: Node | null
  ) {
    // Mirrors the handler inside manageClickOutside
    if (isInside(eventTarget)) return;
    onOutside();
  }

  it('triggers onOutside when click is outside target', () => {
    const onOutside = vi.fn();
    const outsideNode = createFakeNode();
    const container = createFakeNode();

    simulateHandler((target) => isNodeInsideElements(target, [container]), onOutside, outsideNode);

    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does not trigger when click is inside target', () => {
    const onOutside = vi.fn();
    const child = createFakeNode();
    const container = createFakeNode([child]);

    simulateHandler((target) => isNodeInsideElements(target, [container]), onOutside, child);

    expect(onOutside).not.toHaveBeenCalled();
  });

  it('does not trigger when click is on excluded element', () => {
    const onOutside = vi.fn();
    const excludedChild = createFakeNode();
    const mainContainer = createFakeNode();
    const excludedContainer = createFakeNode([excludedChild]);

    simulateHandler(
      (target) => isNodeInsideElements(target, [mainContainer, excludedContainer]),
      onOutside,
      excludedChild
    );

    expect(onOutside).not.toHaveBeenCalled();
  });

  it('triggers onOutside when target is null (non-Node click)', () => {
    const onOutside = vi.fn();

    simulateHandler((target) => isNodeInsideElements(target, [createFakeNode()]), onOutside, null);

    expect(onOutside).toHaveBeenCalledTimes(1);
  });
});
