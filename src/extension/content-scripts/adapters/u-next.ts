import { GenericVideoAdapter } from './generic-video.js';

export class UNextAdapter extends GenericVideoAdapter {
  readonly matchPatterns = ['*://video.unext.jp/*'];
  readonly platform = 'u-next';
}

export const unextAdapter = new UNextAdapter();
