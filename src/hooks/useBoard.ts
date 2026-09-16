import { useCallback } from "react";
import { useHeadBoard } from "../context.js";
import { useAsync } from "../internal/useAsync.js";
import type { Board } from "../types.js";

/** Fetches one public board by slug. */
export function useBoard(boardSlug: string | undefined) {
  const client = useHeadBoard();
  const fetcher = useCallback(
    (signal: AbortSignal) => client.getBoard(boardSlug as string, signal),
    [client, boardSlug],
  );
  const { data, error, isLoading, refetch } = useAsync<Board>(fetcher, [client, boardSlug], {
    enabled: Boolean(boardSlug),
  });
  return { board: data, error, isLoading, refetch };
}
