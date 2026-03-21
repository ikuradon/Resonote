import { afterEach, describe, expect, it, vi } from 'vitest';
import { startIntervalTask } from '$shared/browser/interval-task.js';

describe('startIntervalTask', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should run the task on each interval until stopped', () => {
    vi.useFakeTimers();
    const task = vi.fn();

    const handle = startIntervalTask(task, 100);

    expect(handle.isRunning()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(task).toHaveBeenCalledTimes(2);

    handle.stop();
    expect(handle.isRunning()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('should ignore repeated stop calls', () => {
    vi.useFakeTimers();
    const task = vi.fn();

    const handle = startIntervalTask(task, 100);
    handle.stop();
    handle.stop();

    vi.advanceTimersByTime(200);
    expect(task).not.toHaveBeenCalled();
  });
});
