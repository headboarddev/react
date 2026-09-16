import { useCallback, useEffect, useRef, useState } from "react";
import { useHeadBoard } from "../context.js";
import { toError } from "../internal/useAsync.js";
import type { Comment } from "../types.js";

export interface UseCommentsOptions {
  /** Page size. Server default is 50, max 100. */
  limit?: number;
}

/** Lists a post's comments with cursor pagination. */
export function useComments(postId: string | undefined, options: UseCommentsOptions = {}) {
  const client = useHeadBoard();
  const { limit } = options;

  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const runIdRef = useRef(0);

  const loadFirstPage = useCallback(() => {
    // The idle case is derived on the way out, so no state is written here.
    if (!postId) return () => {};

    const runId = ++runIdRef.current;
    const controller = new AbortController();
    setIsLoading(true);
    setError(undefined);

    client
      .listComments(postId, { limit, signal: controller.signal })
      .then((page) => {
        if (runId !== runIdRef.current) return;
        setComments(page.items);
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
  }, [client, postId, limit]);

  // Entering the loading state is the one unavoidable synchronous write: the
  // request starts inside loadFirstPage, so nothing earlier can know about it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => loadFirstPage(), [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!postId || !hasMore || isLoadingMore || !cursor) return;
    const runId = runIdRef.current;
    setIsLoadingMore(true);
    try {
      const page = await client.listComments(postId, { cursor, limit });
      if (runId !== runIdRef.current) return;
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
      });
      setCursor(page.pagination?.next_cursor);
      setHasMore(page.pagination?.has_more ?? false);
    } catch (err) {
      if (runId === runIdRef.current) setError(toError(err));
    } finally {
      if (runId === runIdRef.current) setIsLoadingMore(false);
    }
  }, [client, postId, cursor, hasMore, isLoadingMore, limit]);

  /** Appends a comment locally, so a new one shows without a refetch. */
  const appendComment = useCallback((comment: Comment) => {
    setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
  }, []);

  const enabled = Boolean(postId);
  return {
    comments: enabled ? comments : [],
    error: enabled ? error : undefined,
    isLoading: enabled ? isLoading : false,
    isLoadingMore,
    hasMore: enabled ? hasMore : false,
    loadMore,
    appendComment,
    refetch: loadFirstPage,
  };
}
