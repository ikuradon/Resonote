import { GenericVideoAdapter } from './generic-video.js';

export class NetflixAdapter extends GenericVideoAdapter {
  readonly matchPatterns = ['*://*.netflix.com/*'];
  readonly platform = 'netflix';
}

export const netflixAdapter = new NetflixAdapter();
