import { unsafeSetAllowPrivateIPs } from './url-validation.js';

interface EnvWithSSRFBypass {
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
}

/**
 * Higher-order function that wraps a Pages Function handler to enable
 * SSRF bypass when UNSAFE_ALLOW_PRIVATE_IPS env var is set.
 *
 * WARNING: UNSAFE_ALLOW_PRIVATE_IPS must NEVER be set in production.
 * It is only for E2E testing with localhost mock servers.
 */
export function withSsrfBypass<E extends EnvWithSSRFBypass>(
  handler: (context: EventContext<E, string, unknown>) => Promise<Response>
): PagesFunction<E> {
  return async (context) => {
    unsafeSetAllowPrivateIPs(!!context.env.UNSAFE_ALLOW_PRIVATE_IPS);
    try {
      return await handler(context);
    } finally {
      unsafeSetAllowPrivateIPs(false);
    }
  };
}
