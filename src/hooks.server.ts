import type { Handle } from '@sveltejs/kit';

import { app } from '$server/api/app.js';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    return app.fetch(event.request, event.platform?.env, event.platform?.context);
  }
  return resolve(event);
};
