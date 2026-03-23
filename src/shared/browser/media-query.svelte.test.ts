import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { createMediaQuery } from './media-query.svelte.js';

describe('createMediaQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an object with a boolean matches property', () => {
    const mq = createMediaQuery('(min-width: 768px)');

    expect(mq).toBeDefined();
    expect(typeof mq.matches).toBe('boolean');
  });

  it('returns matches=true as default $state before effect runs', () => {
    // $state(true) is the initial value; $effect updates it after scheduling.
    // This is stable because vitest runs outside a Svelte component context,
    // so $effect never executes and the initial $state value is deterministic.
    const mq = createMediaQuery('(min-width: 768px)');

    expect(mq.matches).toBe(true);
  });

  it('exposes matches via a getter', () => {
    const mq = createMediaQuery('(prefers-color-scheme: dark)');

    const descriptor = Object.getOwnPropertyDescriptor(mq, 'matches');

    expect(descriptor?.get).toBeDefined();
  });
});
