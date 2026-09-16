import { useCallback, useState } from "react";
import { useHeadBoard } from "../context.js";
import { HeadBoardError } from "../errors.js";
import { toError } from "../internal/useAsync.js";

export interface UseVoteOptions {
  /** Whether the current user has already voted. Drives the optimistic toggle. */
  hasVoted?: boolean;
  /**
   * Called with the signed vote delta (+1 / -1) as soon as the optimistic
   * update applies, and again with the inverse if the request fails. Wire it to
   * `patchPost` from `usePosts` to keep counts in sync.
   */
  onVoteChange?: (delta: number, voted: boolean) => void;
}

/**
 * Vote / unvote a post, with an optimistic toggle.
 *
 * Voting requires a user token. Without one the API returns 401 and `error`
 * will be a `HeadBoardError` with `isUnauthorized === true`.
 */
export function useVote(postId: string | undefined, options: UseVoteOptions = {}) {
  const client = useHeadBoard();
  const { onVoteChange } = options;

  const [voted, setVoted] = useState(options.hasVoted ?? false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  // `hasVoted` usually arrives with the post, one render after mount. Adjust
  // during render (the supported pattern) rather than in an effect, so the
  // button never paints a frame in the wrong state.
  const [lastHasVoted, setLastHasVoted] = useState(options.hasVoted);
  if (options.hasVoted !== undefined && options.hasVoted !== lastHasVoted) {
    setLastHasVoted(options.hasVoted);
    setVoted(options.hasVoted);
  }

  const toggle = useCallback(async () => {
    if (!postId || isPending) return;

    const next = !voted;
    const delta = next ? 1 : -1;

    // Optimistic: flip immediately, roll back if the request fails.
    setVoted(next);
    setIsPending(true);
    setError(undefined);
    onVoteChange?.(delta, next);

    try {
      if (next) {
        await client.vote(postId);
      } else {
        await client.unvote(postId);
      }
    } catch (err) {
      // 409 means the server already agrees with our optimistic state.
      if (err instanceof HeadBoardError && err.isConflict && next) {
        return;
      }
      setVoted(!next);
      onVoteChange?.(-delta, !next);
      setError(toError(err));
    } finally {
      setIsPending(false);
    }
  }, [client, postId, voted, isPending, onVoteChange]);

  return { voted, toggle, isPending, error };
}
