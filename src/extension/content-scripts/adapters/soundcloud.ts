import { GenericAudioAdapter } from './generic-audio.js';

export class SoundCloudAdapter extends GenericAudioAdapter {
  readonly matchPatterns = ['*://*.soundcloud.com/*'];
  readonly platform = 'soundcloud';
}

export const soundcloudAdapter = new SoundCloudAdapter();
