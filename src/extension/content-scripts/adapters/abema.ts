import { GenericVideoAdapter } from './generic-video.js';

export class AbemaAdapter extends GenericVideoAdapter {
  readonly matchPatterns = ['*://abema.tv/*'];
  readonly platform = 'abema';
}

export const abemaAdapter = new AbemaAdapter();
