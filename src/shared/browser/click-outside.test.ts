import { describe, expect, it } from 'vitest';
import { isNodeInsideElements } from '$shared/browser/click-outside.js';

function createFakeNode(children: unknown[] = []): Node {
  return {
    contains(target: unknown) {
      return children.includes(target);
    }
  } as Node;
}

describe('isNodeInsideElements', () => {
  it('should return true when the target is inside one of the elements', () => {
    const child = createFakeNode();
    const container = createFakeNode([child]);

    expect(isNodeInsideElements(child, [container])).toBe(true);
  });

  it('should return false when the target is outside all elements', () => {
    const outside = createFakeNode();
    const container = createFakeNode();

    expect(isNodeInsideElements(outside, [container])).toBe(false);
  });

  it('should ignore missing elements', () => {
    const node = createFakeNode();

    expect(isNodeInsideElements(node, [undefined, null])).toBe(false);
  });
});
