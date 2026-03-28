/**
 * DEV-only test content provider for `/test/test/test` route.
 * Used for visual testing of comment UI and E2E test fixtures.
 */
import type { ContentId, ContentProvider } from '$shared/content/types.js';

export class TestProvider implements ContentProvider {
  readonly platform = 'test';
  readonly displayName = 'Test';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    if (url.includes('test/test/test')) {
      return { platform: 'test', type: 'test', id: 'test' };
    }
    return null;
  }

  toNostrTag(): [string, string] {
    return ['test:test:test', ''];
  }

  contentKind(): string {
    return 'test:test';
  }

  embedUrl(): string | null {
    return null;
  }

  openUrl(): string {
    return '#';
  }
}

export const testProvider = new TestProvider();
