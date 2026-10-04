import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during SSR and until React has hydrated this component on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
