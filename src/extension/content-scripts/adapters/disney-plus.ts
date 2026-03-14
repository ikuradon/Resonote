import { GenericVideoAdapter } from './generic-video.js';

export class DisneyPlusAdapter extends GenericVideoAdapter {
  readonly matchPatterns = ['*://*.disneyplus.com/*'];
  readonly platform = 'disney-plus';
}

export const disneyPlusAdapter = new DisneyPlusAdapter();
