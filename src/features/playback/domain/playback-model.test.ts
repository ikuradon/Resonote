import { describe, it, expect } from 'vitest';
import { SEEK_EVENT_NAME } from './playback-model.js';

describe('SEEK_EVENT_NAME', () => {
  it('should equal "resonote:seek"', () => {
    expect(SEEK_EVENT_NAME).toBe('resonote:seek');
  });

  it('should be a string', () => {
    expect(typeof SEEK_EVENT_NAME).toBe('string');
  });
});
