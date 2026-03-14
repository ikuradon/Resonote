import { GenericVideoAdapter } from './generic-video.js';

export class PrimeVideoAdapter extends GenericVideoAdapter {
  readonly matchPatterns = ['*://*.amazon.co.jp/*', '*://*.amazon.com/*', '*://*.primevideo.com/*'];
  readonly platform = 'prime-video';
}

export const primeVideoAdapter = new PrimeVideoAdapter();
