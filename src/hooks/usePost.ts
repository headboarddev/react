import { useCallback } from "react";
import { useHeadBoard } from "../context.js";
import { useAsync } from "../internal/useAsync.js";
import type { Post } from "../types.js";

/** Fetches a single post by ID. */
export function usePost(postId: string | undefined) {
  const client = useHeadBoard();
  const fetcher = useCallback(
    (signal: AbortSignal) => client.getPost(postId as string, signal),
    [client, postId],
  );
  const { data, error, isLoading, refetch } = useAsync<Post>(fetcher, [client, postId], {
    enabled: Boolean(postId),
  });
  return { post: data, error, isLoading, refetch };
}
