import { describe, expect, it } from 'vitest';

import {
  createSeekEvent,
  isExtensionFrameMessage,
  isExtensionRuntimeOrigin,
  parseSeekEvent
} from './bridge-events.js';

describe('isExtensionRuntimeOrigin', () => {
  it('returns true for chrome-extension:// origin', () => {
    expect(isExtensionRuntimeOrigin('chrome-extension://abcdef123456')).toBe(true);
  });

  it('returns true for moz-extension:// origin', () => {
    expect(isExtensionRuntimeOrigin('moz-extension://abcdef123456')).toBe(true);
  });

  it('returns false for https:// origin', () => {
    expect(isExtensionRuntimeOrigin('https://example.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isExtensionRuntimeOrigin('')).toBe(false);
  });
});

describe('isExtensionFrameMessage', () => {
  describe('resonote:extension-mode', () => {
    it('returns true for valid extension-mode message', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:extension-mode' })).toBe(true);
    });

    it('returns true even with extra properties', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:extension-mode', extra: 'ignored' })).toBe(
        true
      );
    });
  });

  describe('resonote:update-playback', () => {
    it('returns true for valid update-playback message', () => {
      expect(
        isExtensionFrameMessage({
          type: 'resonote:update-playback',
          position: 12345,
          duration: 300000,
          isPaused: false
        })
      ).toBe(true);
    });

    it('returns false when position is missing', () => {
      expect(
        isExtensionFrameMessage({
          type: 'resonote:update-playback',
          duration: 300000,
          isPaused: false
        })
      ).toBe(false);
    });

    it('returns false when duration is missing', () => {
      expect(
        isExtensionFrameMessage({
          type: 'resonote:update-playback',
          position: 0,
          isPaused: true
        })
      ).toBe(false);
    });

    it('returns false when isPaused is missing', () => {
      expect(
        isExtensionFrameMessage({
          type: 'resonote:update-playback',
          position: 0,
          duration: 100
        })
      ).toBe(false);
    });

    it('returns false when isPaused is a string instead of boolean', () => {
      expect(
        isExtensionFrameMessage({
          type: 'resonote:update-playback',
          position: 0,
          duration: 100,
          isPaused: 'false'
        })
      ).toBe(false);
    });
  });

  describe('resonote:navigate', () => {
    it('returns true for valid navigate message with / path', () => {
      expect(
        isExtensionFrameMessage({ type: 'resonote:navigate', path: '/spotify/track/abc' })
      ).toBe(true);
    });

    it('returns false when path does not start with /', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:navigate', path: 'no-slash' })).toBe(false);
    });

    it('returns false when path is missing', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:navigate' })).toBe(false);
    });

    it('returns false when path is a number', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:navigate', path: 42 })).toBe(false);
    });
  });

  describe('resonote:seek-request', () => {
    it('returns true for valid seek-request message', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:seek-request', position: 5000 })).toBe(true);
    });

    it('returns true when position is 0', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:seek-request', position: 0 })).toBe(true);
    });

    it('returns false when position is missing', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:seek-request' })).toBe(false);
    });

    it('returns false when position is a string', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:seek-request', position: '5000' })).toBe(
        false
      );
    });
  });

  describe('unknown / invalid values', () => {
    it('returns false for null', () => {
      expect(isExtensionFrameMessage(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isExtensionFrameMessage('string')).toBe(false);
      expect(isExtensionFrameMessage(42)).toBe(false);
    });

    it('returns false for object without type', () => {
      expect(isExtensionFrameMessage({ position: 0 })).toBe(false);
    });

    it('returns false for unknown type', () => {
      expect(isExtensionFrameMessage({ type: 'resonote:unknown' })).toBe(false);
    });

    it('returns false for object with numeric type', () => {
      expect(isExtensionFrameMessage({ type: 123 })).toBe(false);
    });
  });
});

describe('createSeekEvent', () => {
  it('creates a CustomEvent with the resonote:seek type', () => {
    const event = createSeekEvent(3000);
    expect(event.type).toBe('resonote:seek');
  });

  it('stores positionMs in detail', () => {
    const event = createSeekEvent(12345);
    expect(event.detail.positionMs).toBe(12345);
  });

  it('works with zero', () => {
    const event = createSeekEvent(0);
    expect(event.detail.positionMs).toBe(0);
  });
});

describe('parseSeekEvent', () => {
  it('extracts positionMs from a valid seek CustomEvent', () => {
    const event = new CustomEvent('resonote:seek', { detail: { positionMs: 5000 } });
    expect(parseSeekEvent(event)).toBe(5000);
  });

  it('returns null when detail is missing', () => {
    const event = new Event('resonote:seek');
    expect(parseSeekEvent(event)).toBeNull();
  });

  it('returns null when positionMs is a string', () => {
    const event = new CustomEvent('resonote:seek', { detail: { positionMs: '5000' } });
    expect(parseSeekEvent(event)).toBeNull();
  });

  it('returns null when detail is null', () => {
    const event = new CustomEvent('resonote:seek', { detail: null });
    expect(parseSeekEvent(event)).toBeNull();
  });

  it('returns 0 when positionMs is 0', () => {
    const event = new CustomEvent('resonote:seek', { detail: { positionMs: 0 } });
    expect(parseSeekEvent(event)).toBe(0);
  });
});
