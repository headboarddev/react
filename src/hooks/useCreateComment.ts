import { useCallback, useState } from "react";
import { useHeadBoard } from "../context.js";
import { toError } from "../internal/useAsync.js";
import type { Comment, CreateCommentInput } from "../types.js";

/** Adds a comment to a post. */
export function useCreateComment(postId: string | undefined) {
  const client = useHeadBoard();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const createComment = useCallback(
    async (input: CreateCommentInput): Promise<Comment | undefined> => {
      if (!postId) return undefined;
      setIsPending(true);
      setError(undefined);
      try {
        return await client.createComment(postId, input);
      } catch (err) {
        setError(toError(err));
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [client, postId],
  );

  return { createComment, isPending, error };
}
