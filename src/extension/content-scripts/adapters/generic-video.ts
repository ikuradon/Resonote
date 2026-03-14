import type { SiteAdapter } from './types.js';

export abstract class GenericVideoAdapter implements SiteAdapter {
  abstract readonly matchPatterns: string[];
  abstract readonly platform: string;

  protected selector = 'video';

  findMediaElement(): HTMLVideoElement | null {
    const videos = document.querySelectorAll<HTMLVideoElement>(this.selector);
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    let best: HTMLVideoElement | null = null;
    let bestScore = -1;
    for (const video of videos) {
      let score = video.clientWidth * video.clientHeight;
      if (!video.paused) score += 1_000_000;
      if (score > bestScore) {
        bestScore = score;
        best = video;
      }
    }
    return best;
  }

  seek(element: HTMLVideoElement | HTMLAudioElement, positionMs: number): void {
    element.currentTime = positionMs / 1000;
  }
}
