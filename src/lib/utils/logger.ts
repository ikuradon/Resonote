type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const MIN_LEVEL: LogLevel = import.meta.env.DEV ? 'debug' : 'warn';

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/** Truncate a hex string (pubkey, event ID) for log output. */
export function shortHex(hex: string, len = 8): string {
  return hex.slice(0, len);
}

export function createLogger(module: string): Logger {
  function log(level: LogLevel, message: string, data?: unknown) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

    const prefix = `[${module}]`;
    const fn =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'info'
            ? console.info
            : console.debug;

    if (data !== undefined) {
      fn(prefix, message, data);
    } else {
      fn(prefix, message);
    }
  }

  return {
    debug: (msg, data?) => log('debug', msg, data),
    info: (msg, data?) => log('info', msg, data),
    warn: (msg, data?) => log('warn', msg, data),
    error: (msg, data?) => log('error', msg, data)
  };
}
