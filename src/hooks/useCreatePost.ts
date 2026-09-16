import { useCallback, useState } from "react";
import { useHeadBoard } from "../context.js";
import { toError } from "../internal/useAsync.js";
import type { CreatePostInput, Post } from "../types.js";

/**
 * Creates a post on a board.
 *
 * Authorship is linked when a user token is set; without one the post is
 * still created, just unattributed.
 */
export function useCreatePost(boardSlug: string | undefined) {
  const client = useHeadBoard();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const createPost = useCallback(
    async (input: CreatePostInput): Promise<Post | undefined> => {
      if (!boardSlug) return undefined;
      setIsPending(true);
      setError(undefined);
      try {
        return await client.createPost(boardSlug, input);
      } catch (err) {
        setError(toError(err));
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [client, boardSlug],
  );

  return { createPost, isPending, error };
}
