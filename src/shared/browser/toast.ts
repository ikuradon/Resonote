// @public — Stable API for route/component/feature consumers
/**
 * Toast bridge — shared browser entry point for transient UI notifications.
 */

export {
  dismiss,
  getToasts,
  type Toast,
  toastError,
  toastInfo,
  toastSuccess,
  type ToastType
} from './toast.svelte.js';
