import { GenericAudioAdapter } from './generic-audio.js';

export class AppleMusicAdapter extends GenericAudioAdapter {
  readonly matchPatterns = ['*://music.apple.com/*'];
  readonly platform = 'apple-music';
}

export const appleMusicAdapter = new AppleMusicAdapter();
