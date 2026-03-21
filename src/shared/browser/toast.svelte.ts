export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

const TOAST_DURATION_MS = 4000;
const MAX_TOASTS = 3;

let nextId = 0;
let toasts = $state<Toast[]>([]);
let timers = new Map<number, ReturnType<typeof setTimeout>>();

function add(message: string, type: ToastType): void {
  const id = nextId++;
  const prev = toasts;
  const evicted = prev.length >= MAX_TOASTS ? prev.slice(0, prev.length - MAX_TOASTS + 1) : [];
  for (const toast of evicted) {
    const timer = timers.get(toast.id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(toast.id);
    }
  }
  toasts = [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type }];

  const timer = setTimeout(() => {
    dismiss(id);
  }, TOAST_DURATION_MS);
  timers.set(id, timer);
}

export function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts = toasts.filter((toast) => toast.id !== id);
}

export function toastSuccess(message: string): void {
  add(message, 'success');
}

export function toastError(message: string): void {
  add(message, 'error');
}

export function toastInfo(message: string): void {
  add(message, 'info');
}

export function getToasts(): Toast[] {
  return toasts;
}
