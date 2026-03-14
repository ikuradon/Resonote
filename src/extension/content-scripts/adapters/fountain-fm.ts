import type { SiteAdapter } from './types.js';

export class FountainFmAdapter implements SiteAdapter {
  readonly matchPatterns = ['*://*.fountain.fm/*'];
  readonly platform = 'fountain-fm';

  findMediaElement(): HTMLAudioElement | null {
    return document.querySelector<HTMLAudioElement>('audio');
  }

  seek(element: HTMLAudioElement, positionMs: number): void {
    element.currentTime = positionMs / 1000;
  }
}

export const fountainFmAdapter = new FountainFmAdapter();
