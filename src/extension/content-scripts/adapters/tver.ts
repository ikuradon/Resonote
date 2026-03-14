import { GenericVideoAdapter } from './generic-video.js';

export class TverAdapter extends GenericVideoAdapter {
  readonly matchPatterns = ['*://*.tver.jp/*'];
  readonly platform = 'tver';
}

export const tverAdapter = new TverAdapter();
