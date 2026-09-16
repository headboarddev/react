import { useCallback, useEffect, useRef, useState } from "react";
import { useHeadBoard } from "../context.js";
import { toError } from "../internal/useAsync.js";
import type { EndUser, IdentifyInput } from "../types.js";

/**
 * Upserts the current end user.
 *
 * Pass a user to identify on mount, or call `identify()` yourself after login.
 * Re-identifies whenever `external_id` or the profile fields change.
 */
export function useIdentify(user?: IdentifyInput) {
  const client = useHeadBoard();
  const [endUser, setEndUser] = useState<EndUser | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [isPending, setIsPending] = useState(false);

  const identify = useCallback(
    async (input: IdentifyInput): Promise<EndUser | undefined> => {
      setIsPending(true);
      setError(undefined);
      try {
        const result = await client.identify(input);
        setEndUser(result);
        return result;
      } catch (err) {
        setError(toError(err));
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [client],
  );

  // Fire on mount and whenever the identity actually changes, not on every
  // new object literal the caller passes in.
  const key = user ? `${user.external_id}|${user.email ?? ""}|${user.name ?? ""}|${user.avatar_url ?? ""}` : "";
  const identifyRef = useRef(identify);
  useEffect(() => {
    identifyRef.current = identify;
  });

  useEffect(() => {
    if (!user?.external_id) return;
    void identifyRef.current(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { endUser, identify, isPending, error };
}
