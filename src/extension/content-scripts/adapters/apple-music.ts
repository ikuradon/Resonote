import type { SiteAdapter } from './types.js';

export class AppleMusicAdapter implements SiteAdapter {
  readonly matchPatterns = ['*://music.apple.com/*'];
  readonly platform = 'apple-music';

  findMediaElement(): HTMLAudioElement | null {
    return document.querySelector<HTMLAudioElement>('audio');
  }

  seek(element: HTMLAudioElement, positionMs: number): void {
    element.currentTime = positionMs / 1000;
  }
}

export const appleMusicAdapter = new AppleMusicAdapter();
