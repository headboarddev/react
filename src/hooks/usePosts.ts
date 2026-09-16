import { useCallback, useEffect, useRef, useState } from "react";
import { useHeadBoard } from "../context.js";
import { toError } from "../internal/useAsync.js";
import type { Post } from "../types.js";

export interface UsePostsOptions {
  /** Page size. Server default is 20, max 100. */
  limit?: number;
}

/**
 * Lists a board's posts with cursor pagination.
 *
 * `posts` accumulates across pages; `loadMore()` appends the next one.
 */
export function usePosts(boardSlug: string | undefined, options: UsePostsOptions = {}) {
  const client = useHeadBoard();
  const { limit } = options;

  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(Boolean(boardSlug));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  // Guards against a stale page landing after the board changed.
  const runIdRef = useRef(0);

  const loadFirstPage = useCallback(() => {
    // The idle case is derived on the way out, so no state is written here.
    if (!boardSlug) return () => {};

    const runId = ++runIdRef.current;
    const controller = new AbortController();
    setIsLoading(true);
    setError(undefined);

    client
      .listPosts(boardSlug, { limit, signal: controller.signal })
      .then((page) => {
        if (runId !== runIdRef.current) return;
        setPosts(page.items);
        setCursor(page.pagination?.next_cursor);
        setHasMore(page.pagination?.has_more ?? false);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (runId !== runIdRef.current || controller.signal.aborted) return;
        setError(toError(err));
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [client, boardSlug, limit]);

  // Entering the loading state is the one unavoidable synchronous write: the
  // request starts inside loadFirstPage, so nothing earlier can know about it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => loadFirstPage(), [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!boardSlug || !hasMore || isLoadingMore || !cursor) return;
    const runId = runIdRef.current;
    setIsLoadingMore(true);
    try {
      const page = await client.listPosts(boardSlug, { cursor, limit });
      if (runId !== runIdRef.current) return;
      // De-dupe: a post created between pages can shift the cursor window.
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
      });
      setCursor(page.pagination?.next_cursor);
      setHasMore(page.pagination?.has_more ?? false);
    } catch (err) {
      if (runId === runIdRef.current) setError(toError(err));
    } finally {
      if (runId === runIdRef.current) setIsLoadingMore(false);
    }
  }, [client, boardSlug, cursor, hasMore, isLoadingMore, limit]);

  /** Applies a local change to one post — used for optimistic vote counts. */
  const patchPost = useCallback((postId: string, patch: Partial<Post>) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
  }, []);

  const enabled = Boolean(boardSlug);
  return {
    posts: enabled ? posts : [],
    error: enabled ? error : undefined,
    isLoading: enabled ? isLoading : false,
    isLoadingMore,
    hasMore: enabled ? hasMore : false,
    loadMore,
    patchPost,
    refetch: loadFirstPage,
  };
}
