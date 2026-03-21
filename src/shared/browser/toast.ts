// @public — Stable API for route/component/feature consumers
/**
 * Toast bridge — shared browser entry point for transient UI notifications.
 */

export {
  getToasts,
  dismiss,
  toastSuccess,
  toastError,
  toastInfo,
  type Toast,
  type ToastType
} from './toast.svelte.js';
