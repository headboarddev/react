import type { ApiResponse } from "../src/types.js";

export function jsonResponse<T>(data: T, init: { status?: number; pagination?: ApiResponse<T>["pagination"] } = {}) {
  const body: ApiResponse<T> = {
    data,
    ...(init.pagination ? { pagination: init.pagination } : {}),
    meta: { request_id: "req-test" },
  };
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return new Response(
    JSON.stringify({ error: { code, message }, meta: { request_id: "req-err" } }),
    { status, headers: { "Content-Type": "application/json", ...headers } },
  );
}

export const board = {
  id: "b1",
  org_id: "o1",
  name: "Roadmap",
  slug: "roadmap",
  is_public: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export function post(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    board_id: "b1",
    title: `Post ${id}`,
    status: "open",
    vote_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

interface FetchCall {
  url: string;
  init: { method?: string; body?: string; headers: Record<string, string> };
}

/** Reads a recorded fetch call, keeping `noUncheckedIndexedAccess` happy. */
export function callAt(mock: { mock: { calls: unknown[][] } }, index: number): FetchCall {
  const call = mock.mock.calls[index];
  if (!call) throw new Error(`no fetch call at index ${index}`);
  return { url: call[0] as string, init: call[1] as FetchCall["init"] };
}

/** Awaits a promise expected to reject, returning the typed error. */
export async function rejection<E = Error>(promise: Promise<unknown>): Promise<E> {
  try {
    await promise;
  } catch (err) {
    return err as E;
  }
  throw new Error("expected promise to reject, but it resolved");
}

/** Reads an array element, keeping `noUncheckedIndexedAccess` happy. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no element at index ${index}`);
  return item;
}
