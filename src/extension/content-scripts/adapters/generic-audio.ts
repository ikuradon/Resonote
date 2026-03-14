import type { SiteAdapter } from './types.js';

export abstract class GenericAudioAdapter implements SiteAdapter {
  abstract readonly matchPatterns: string[];
  abstract readonly platform: string;

  findMediaElement(): HTMLAudioElement | null {
    return document.querySelector<HTMLAudioElement>('audio');
  }

  seek(element: HTMLVideoElement | HTMLAudioElement, positionMs: number): void {
    element.currentTime = positionMs / 1000;
  }
}
