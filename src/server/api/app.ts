import { Hono } from 'hono';

import type { Bindings } from './bindings.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { oembedRoute } from './oembed.js';
import { podbeanRoute } from './podbean.js';
import { podcastRoute } from './podcast.js';
import { systemRoute } from './system.js';
import { youtubeRoute } from './youtube.js';

export type { Bindings } from './bindings.js';

const base = new Hono<{ Bindings: Bindings }>().basePath('/api');

base.onError(errorHandler);
base.use('*', rateLimitMiddleware());

const app = base
  .route('/podcast', podcastRoute)
  .route('/oembed', oembedRoute)
  .route('/youtube', youtubeRoute)
  .route('/podbean', podbeanRoute)
  .route('/system', systemRoute);

export type AppType = typeof app;
export { app };
