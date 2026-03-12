import type { Observable, Subscription } from 'rxjs';

export function toState<T>(
  obs: Observable<T>,
  initial: T
): { readonly current: T; destroy: () => void } {
  let current = $state(initial);
  let subscription: Subscription | undefined;

  subscription = obs.subscribe((value) => {
    current = value;
  });

  return {
    get current() {
      return current;
    },
    destroy() {
      subscription?.unsubscribe();
      subscription = undefined;
    }
  };
}
