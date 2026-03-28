import { hc } from 'hono/client';

import type { AppType } from '$server/api/app.js';

export const apiClient = hc<AppType>(typeof window !== 'undefined' ? window.location.origin : '');
