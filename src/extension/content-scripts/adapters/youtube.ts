import { GenericVideoAdapter } from './generic-video.js';

export class YouTubeAdapter extends GenericVideoAdapter {
  readonly matchPatterns = ['*://*.youtube.com/*'];
  readonly platform = 'youtube';
  protected override selector = 'video.html5-main-video';

  override findMediaElement(): HTMLVideoElement | null {
    const specific = document.querySelector<HTMLVideoElement>(this.selector);
    if (specific) return specific;
    return super.findMediaElement();
  }
}

export const youtubeAdapter = new YouTubeAdapter();
