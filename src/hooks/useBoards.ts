import { useCallback } from "react";
import { useHeadBoard } from "../context.js";
import { useAsync } from "../internal/useAsync.js";
import type { Board } from "../types.js";

/** Lists the org's public boards. */
export function useBoards() {
  const client = useHeadBoard();
  const fetcher = useCallback((signal: AbortSignal) => client.listBoards(signal), [client]);
  const { data, error, isLoading, refetch } = useAsync<Board[]>(fetcher, [client]);
  return { boards: data ?? [], error, isLoading, refetch };
}
