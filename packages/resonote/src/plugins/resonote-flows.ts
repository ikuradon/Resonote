import type { ResonoteCoordinatorPlugin } from '../runtime.js';
import type { CommentsFlow, ContentResolutionFlow } from './built-in-plugins.js';

export const COMMENTS_FLOW = 'resonoteCommentsFlow';
export const CONTENT_RESOLUTION_FLOW = 'resonoteContentResolution';

export function createResonoteCommentsFlowPlugin(flow: CommentsFlow): ResonoteCoordinatorPlugin {
  return {
    name: 'resonoteCommentsFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(COMMENTS_FLOW, flow);
    }
  };
}

export function createResonoteContentResolutionFlowPlugin(
  flow: ContentResolutionFlow
): ResonoteCoordinatorPlugin {
  return {
    name: 'resonoteContentResolutionFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(CONTENT_RESOLUTION_FLOW, flow);
    }
  };
}
