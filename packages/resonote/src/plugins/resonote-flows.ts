import type { AuftaktRuntimePlugin } from '@auftakt/runtime';

import type { CommentsFlow, ContentResolutionFlow } from './built-in-plugins.js';
export type { CommentsFlow, ContentResolutionFlow } from './built-in-plugins.js';

export const COMMENTS_FLOW = 'resonoteCommentsFlow';
export const CONTENT_RESOLUTION_FLOW = 'resonoteContentResolution';

export function createResonoteCommentsFlowPlugin(flow: CommentsFlow): AuftaktRuntimePlugin {
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
): AuftaktRuntimePlugin {
  return {
    name: 'resonoteContentResolutionFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(CONTENT_RESOLUTION_FLOW, flow);
    }
  };
}
