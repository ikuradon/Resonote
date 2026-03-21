// @public — Stable API for route/component/feature consumers
/**
 * Small wrapper around setInterval so components use a typed stop handle
 * instead of owning raw timer ids directly.
 */

export interface IntervalTaskHandle {
  isRunning(): boolean;
  stop(): void;
}

export function startIntervalTask(task: () => void, intervalMs: number): IntervalTaskHandle {
  let running = true;

  const intervalId = setInterval(() => {
    if (!running) return;
    task();
  }, intervalMs);

  return {
    isRunning(): boolean {
      return running;
    },
    stop(): void {
      if (!running) return;
      running = false;
      clearInterval(intervalId);
    }
  };
}
