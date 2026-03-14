import type { SiteAdapter } from './types.js';

export class SoundCloudAdapter implements SiteAdapter {
  readonly matchPatterns = ['*://*.soundcloud.com/*'];
  readonly platform = 'soundcloud';

  findMediaElement(): HTMLAudioElement | null {
    return document.querySelector<HTMLAudioElement>('audio');
  }

  seek(element: HTMLAudioElement, positionMs: number): void {
    element.currentTime = positionMs / 1000;
  }
}

export const soundcloudAdapter = new SoundCloudAdapter();
