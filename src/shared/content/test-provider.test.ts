import { describe, expect, it } from 'vitest';

import { TestProvider, testProvider } from '$shared/content/test-provider.js';

describe('TestProvider', () => {
  describe('ContentProvider interface properties', () => {
    it('platform should be "test"', () => {
      expect(testProvider.platform).toBe('test');
    });

    it('displayName should be "Test"', () => {
      expect(testProvider.displayName).toBe('Test');
    });

    it('requiresExtension should be false', () => {
      expect(testProvider.requiresExtension).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should return ContentId for URL containing test/test/test', () => {
      const result = testProvider.parseUrl('http://localhost:5173/test/test/test');
      expect(result).toEqual({ platform: 'test', type: 'test', id: 'test' });
    });

    it('should match URL with test/test/test anywhere in path', () => {
      const result = testProvider.parseUrl('https://example.com/some/test/test/test/path');
      expect(result).toEqual({ platform: 'test', type: 'test', id: 'test' });
    });

    it('should return null for URL without test/test/test', () => {
      expect(testProvider.parseUrl('https://example.com/other')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(testProvider.parseUrl('')).toBeNull();
    });

    it('should return null for partial match', () => {
      expect(testProvider.parseUrl('https://example.com/test/test')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should return ["test:test:test", ""]', () => {
      const tag = testProvider.toNostrTag();
      expect(tag).toEqual(['test:test:test', '']);
    });
  });

  describe('contentKind', () => {
    it('should return "test:test"', () => {
      const kind = testProvider.contentKind();
      expect(kind).toBe('test:test');
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      const url = testProvider.embedUrl();
      expect(url).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return "#"', () => {
      const url = testProvider.openUrl();
      expect(url).toBe('#');
    });
  });

  describe('singleton export', () => {
    it('testProvider should be an instance of TestProvider', () => {
      expect(testProvider).toBeInstanceOf(TestProvider);
    });
  });
});
