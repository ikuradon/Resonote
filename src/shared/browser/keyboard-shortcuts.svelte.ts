export interface ShortcutActions {
  focusForm: () => void;
  switchToFlow: () => void;
  switchToShout: () => void;
  switchToInfo: () => void;
  nextComment: () => void;
  prevComment: () => void;
  replyToSelected: () => void;
  likeSelected: () => void;
  clearSelection: () => void;
  toggleBookmark: () => void;
  openShare: () => void;
  togglePlayback: () => void;
  seekBackward: () => void;
  seekForward: () => void;
  showHelp: () => void;
}

export function createKeyboardShortcuts(actions: ShortcutActions) {
  let inputFocused = false;

  function setInputFocused(focused: boolean): void {
    inputFocused = focused;
  }

  function handleKeyDown(e: KeyboardEvent): boolean {
    // Always allow Escape
    if (e.key === 'Escape') {
      actions.clearSelection();
      return true;
    }

    // Skip single-key shortcuts when typing in input/textarea
    if (inputFocused) return false;

    // Shift+S → openShare (must check before 's')
    if (e.key === 'S' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      actions.openShare();
      return true;
    }

    // ? → showHelp (Shift+/ on most keyboards)
    if (e.key === '?') {
      e.preventDefault();
      actions.showHelp();
      return true;
    }

    // Skip if any modifier is held
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    switch (e.key) {
      case 'f':
        e.preventDefault();
        actions.switchToFlow();
        return true;
      case 's':
        e.preventDefault();
        actions.switchToShout();
        return true;
      case 'i':
        e.preventDefault();
        actions.switchToInfo();
        return true;
      case 'n':
        e.preventDefault();
        actions.focusForm();
        return true;
      case 'j':
        e.preventDefault();
        actions.nextComment();
        return true;
      case 'k':
        e.preventDefault();
        actions.prevComment();
        return true;
      case 'r':
        e.preventDefault();
        actions.replyToSelected();
        return true;
      case 'l':
        e.preventDefault();
        actions.likeSelected();
        return true;
      case 'b':
        e.preventDefault();
        actions.toggleBookmark();
        return true;
      case 'p':
        e.preventDefault();
        actions.togglePlayback();
        return true;
      case 'ArrowLeft':
        e.preventDefault();
        actions.seekBackward();
        return true;
      case 'ArrowRight':
        e.preventDefault();
        actions.seekForward();
        return true;
      default:
        return false;
    }
  }

  function handler(e: KeyboardEvent): void {
    handleKeyDown(e);
  }

  window.addEventListener('keydown', handler);

  function destroy(): void {
    window.removeEventListener('keydown', handler);
  }

  return {
    handleKeyDown,
    setInputFocused,
    destroy
  };
}
