import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
}

/**
 * Runs `fn` on mount and whenever `deps` change, with the in-flight request
 * aborted on change/unmount so a slow first response cannot overwrite a fast
 * second one.
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): AsyncState<T> & { refetch: () => void } {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    error: undefined,
    isLoading: enabled,
  });
  const [nonce, setNonce] = useState(0);

  // Keep the latest fn without making it a dependency of the effect.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    // Disabled is derived on the way out rather than written here, so this
    // effect never triggers a cascading render just to clear state.
    if (!enabled) return;

    const controller = new AbortController();
    let active = true;
    // Entering the loading state is the one unavoidable synchronous write:
    // the request starts here, so nothing earlier can know about it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

    fnRef
      .current(controller.signal)
      .then((data) => {
        if (active) setState({ data, error: undefined, isLoading: false });
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState({ data: undefined, error: toError(err), isLoading: false });
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const disabled = { data: undefined, error: undefined, isLoading: false } as AsyncState<T>;
  return { ...(enabled ? state : disabled), refetch };
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
