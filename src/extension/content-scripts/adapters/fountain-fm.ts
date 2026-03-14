import { GenericAudioAdapter } from './generic-audio.js';

export class FountainFmAdapter extends GenericAudioAdapter {
  readonly matchPatterns = ['*://*.fountain.fm/*'];
  readonly platform = 'fountain-fm';
}

export const fountainFmAdapter = new FountainFmAdapter();
