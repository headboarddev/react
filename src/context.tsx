import { createContext, createElement, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { HeadBoardClient, type HeadBoardClientOptions } from "./client.js";

const HeadBoardContext = createContext<HeadBoardClient | null>(null);

export interface HeadBoardProviderProps extends Partial<HeadBoardClientOptions> {
  /** Supply a pre-built client instead of the individual options. */
  client?: HeadBoardClient;
  children: ReactNode;
}

/**
 * Provides a `HeadBoardClient` to the hooks below.
 *
 * ```tsx
 * <HeadBoardProvider apiKey="hb_live_..." userToken={() => session.token}>
 *   <App />
 * </HeadBoardProvider>
 * ```
 */
export function HeadBoardProvider({
  client,
  apiKey,
  userToken,
  baseUrl,
  fetch: fetchImpl,
  children,
}: HeadBoardProviderProps) {
  // `userToken` and `fetch` are read through refs rather than captured in the
  // memo below. Both are commonly passed as inline arrows, and a new identity
  // on every render would rebuild the client, which would in turn invalidate
  // every hook's fetcher and restart all of their requests — a refetch storm.
  //
  // The refs are updated in an effect, per React's guidance on latest-value
  // refs. They are only ever read when a request is made, which is after
  // effects have flushed, so the committed value is the one that gets used.
  const userTokenRef = useRef(userToken);
  const fetchRef = useRef(fetchImpl);
  useEffect(() => {
    userTokenRef.current = userToken;
    fetchRef.current = fetchImpl;
  });

  const value = useMemo(() => {
    if (client) return client;
    if (!apiKey) throw new Error("HeadBoardProvider: pass either `client` or `apiKey`");

    // The two closures below capture the refs but only dereference them when a
    // request is made, never during render — which the rule cannot see.
    // eslint-disable-next-line react-hooks/refs
    return new HeadBoardClient({
      apiKey,
      baseUrl,
      // Resolved per request, so a rotating token needs no remount.
      userToken: () => {
        const token = userTokenRef.current;
        return typeof token === "function" ? token() : token;
      },
      fetch: (input, init) => {
        const impl = fetchRef.current;
        return impl ? impl(input, init) : globalThis.fetch(input, init);
      },
    });
  }, [client, apiKey, baseUrl]);

  return createElement(HeadBoardContext.Provider, { value }, children);
}

/** Returns the client from context. Throws if no provider is mounted. */
export function useHeadBoard(): HeadBoardClient {
  const client = useContext(HeadBoardContext);
  if (!client) {
    throw new Error("useHeadBoard: no <HeadBoardProvider> found in the tree");
  }
  return client;
}
