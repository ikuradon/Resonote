export type MaterializerPriority = 'critical' | 'high' | 'normal' | 'background';

export interface MaterializerTask {
  readonly priority: MaterializerPriority;
  run(): Promise<void>;
}

const rank: Record<MaterializerPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  background: 3
};

export function createMaterializerQueue() {
  const tasks: MaterializerTask[] = [];
  let draining = false;

  return {
    enqueue(task: MaterializerTask): void {
      tasks.push(task);
      tasks.sort((left, right) => rank[left.priority] - rank[right.priority]);
    },
    async drain(): Promise<void> {
      if (draining) return;
      draining = true;
      try {
        while (tasks.length > 0) {
          const task = tasks.shift();
          if (task) await task.run();
        }
      } finally {
        draining = false;
      }
    },
    size(): number {
      return tasks.length;
    }
  };
}
