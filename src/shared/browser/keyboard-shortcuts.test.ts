import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createKeyboardShortcuts, type ShortcutActions } from './keyboard-shortcuts.svelte.js';

// Stub window.addEventListener/removeEventListener for tests
const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
vi.stubGlobal('window', {
  addEventListener: (type: string, fn: (...args: unknown[]) => void) => {
    listeners[type] ??= [];
    listeners[type].push(fn);
  },
  removeEventListener: (type: string, fn: (...args: unknown[]) => void) => {
    listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
  }
});

describe('createKeyboardShortcuts', () => {
  let actions: ShortcutActions;
  let shortcuts: ReturnType<typeof createKeyboardShortcuts>;

  beforeEach(() => {
    actions = {
      focusForm: vi.fn(),
      switchToFlow: vi.fn(),
      switchToShout: vi.fn(),
      switchToInfo: vi.fn(),
      nextComment: vi.fn(),
      prevComment: vi.fn(),
      replyToSelected: vi.fn(),
      likeSelected: vi.fn(),
      clearSelection: vi.fn(),
      toggleBookmark: vi.fn(),
      openShare: vi.fn(),
      togglePlayback: vi.fn(),
      seekBackward: vi.fn(),
      seekForward: vi.fn(),
      showHelp: vi.fn()
    };
    shortcuts = createKeyboardShortcuts(actions);
  });

  afterEach(() => {
    shortcuts.destroy();
  });

  function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): boolean {
    const event = {
      key,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      ...opts
    } as unknown as KeyboardEvent;
    return shortcuts.handleKeyDown(event);
  }

  it('dispatches f to switchToFlow', () => {
    fireKey('f');
    expect(actions.switchToFlow).toHaveBeenCalledOnce();
  });

  it('dispatches s to switchToShout', () => {
    fireKey('s');
    expect(actions.switchToShout).toHaveBeenCalledOnce();
  });

  it('dispatches i to switchToInfo', () => {
    fireKey('i');
    expect(actions.switchToInfo).toHaveBeenCalledOnce();
  });

  it('dispatches n to focusForm', () => {
    fireKey('n');
    expect(actions.focusForm).toHaveBeenCalledOnce();
  });

  it('dispatches j to nextComment', () => {
    fireKey('j');
    expect(actions.nextComment).toHaveBeenCalledOnce();
  });

  it('dispatches k to prevComment', () => {
    fireKey('k');
    expect(actions.prevComment).toHaveBeenCalledOnce();
  });

  it('dispatches r to replyToSelected', () => {
    fireKey('r');
    expect(actions.replyToSelected).toHaveBeenCalledOnce();
  });

  it('dispatches l to likeSelected', () => {
    fireKey('l');
    expect(actions.likeSelected).toHaveBeenCalledOnce();
  });

  it('dispatches Escape to clearSelection', () => {
    fireKey('Escape');
    expect(actions.clearSelection).toHaveBeenCalledOnce();
  });

  it('dispatches b to toggleBookmark', () => {
    fireKey('b');
    expect(actions.toggleBookmark).toHaveBeenCalledOnce();
  });

  it('dispatches Shift+S to openShare', () => {
    fireKey('S', { shiftKey: true });
    expect(actions.openShare).toHaveBeenCalledOnce();
  });

  it('dispatches p to togglePlayback', () => {
    fireKey('p');
    expect(actions.togglePlayback).toHaveBeenCalledOnce();
  });

  it('dispatches ArrowLeft to seekBackward', () => {
    fireKey('ArrowLeft');
    expect(actions.seekBackward).toHaveBeenCalledOnce();
  });

  it('dispatches ArrowRight to seekForward', () => {
    fireKey('ArrowRight');
    expect(actions.seekForward).toHaveBeenCalledOnce();
  });

  it('dispatches ? to showHelp', () => {
    fireKey('?', { shiftKey: true });
    expect(actions.showHelp).toHaveBeenCalledOnce();
  });

  it('ignores single keys when input is focused', () => {
    shortcuts.setInputFocused(true);
    fireKey('f');
    expect(actions.switchToFlow).not.toHaveBeenCalled();
  });

  it('allows Escape when input is focused', () => {
    shortcuts.setInputFocused(true);
    fireKey('Escape');
    expect(actions.clearSelection).toHaveBeenCalledOnce();
  });

  it('does not dispatch s when Shift+S is pressed', () => {
    fireKey('S', { shiftKey: true });
    expect(actions.switchToShout).not.toHaveBeenCalled();
    expect(actions.openShare).toHaveBeenCalledOnce();
  });

  it('ignores keys with ctrl modifier', () => {
    fireKey('f', { ctrlKey: true });
    expect(actions.switchToFlow).not.toHaveBeenCalled();
  });

  it('ignores keys with meta modifier', () => {
    fireKey('f', { metaKey: true });
    expect(actions.switchToFlow).not.toHaveBeenCalled();
  });

  it('ignores unknown keys', () => {
    const handled = fireKey('z');
    expect(handled).toBe(false);
  });
});
