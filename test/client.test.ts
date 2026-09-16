import { describe, expect, it, vi } from "vitest";
import { HeadBoardClient } from "../src/client.js";
import { HeadBoardError } from "../src/errors.js";
import { board, callAt, errorResponse, jsonResponse, post, rejection } from "./helpers.js";

function makeClient(fetchImpl: typeof globalThis.fetch, opts: Record<string, unknown> = {}) {
  return new HeadBoardClient({
    apiKey: "hb_test",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    ...opts,
  });
}

describe("HeadBoardClient", () => {
  it("requires an apiKey", () => {
    expect(() => new HeadBoardClient({ apiKey: "" })).toThrow(/apiKey/);
  });

  it("sends the API key and omits the user token when absent", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([board]));
    await makeClient(fetchMock).listBoards();

    const { url, init } = callAt(fetchMock, 0);
    expect(url).toBe("https://api.test/api/v1/boards");
    expect(init.headers["X-API-Key"]).toBe("hb_test");
    expect(init.headers["X-User-Token"]).toBeUndefined();
  });

  it("sends the user token when provided", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([board]));
    await makeClient(fetchMock, { userToken: "tok_123" }).listBoards();
    expect(callAt(fetchMock, 0).init.headers["X-User-Token"]).toBe("tok_123");
  });

  it("re-reads a function user token on every request", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([board]));
    let token = "tok_a";
    const client = makeClient(fetchMock, { userToken: () => token });

    await client.listBoards();
    token = "tok_b";
    await client.listBoards();

    expect(callAt(fetchMock, 0).init.headers["X-User-Token"]).toBe("tok_a");
    expect(callAt(fetchMock, 1).init.headers["X-User-Token"]).toBe("tok_b");
  });

  it("strips a trailing slash from baseUrl", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([board]));
    await makeClient(fetchMock, { baseUrl: "https://api.test/" }).listBoards();
    expect(callAt(fetchMock, 0).url).toBe("https://api.test/api/v1/boards");
  });

  it("url-encodes path segments", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(board));
    await makeClient(fetchMock).getBoard("a b/c");
    expect(callAt(fetchMock, 0).url).toBe("https://api.test/api/v1/boards/a%20b%2Fc");
  });

  it("passes cursor and limit as query params", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([post("p1")]));
    await makeClient(fetchMock).listPosts("roadmap", { cursor: "c1", limit: 50 });
    const url = new URL(callAt(fetchMock, 0).url);
    expect(url.searchParams.get("cursor")).toBe("c1");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("omits undefined query params", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([post("p1")]));
    await makeClient(fetchMock).listPosts("roadmap", {});
    expect(new URL(callAt(fetchMock, 0).url).search).toBe("");
  });

  it("returns items and pagination from list endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => 
      jsonResponse([post("p1"), post("p2")], { pagination: { next_cursor: "p2", has_more: true } }),
    );
    const page = await makeClient(fetchMock).listPosts("roadmap");
    expect(page.items).toHaveLength(2);
    expect(page.pagination).toEqual({ next_cursor: "p2", has_more: true });
  });

  it("maps an error body to HeadBoardError", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => errorResponse(404, "not_found", "board not found"));
    await expect(makeClient(fetchMock).getBoard("nope")).rejects.toMatchObject({
      name: "HeadBoardError",
      status: 404,
      code: "not_found",
      message: "board not found",
      requestId: "req-err",
    });
  });

  it("parses Retry-After on a 429", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => errorResponse(429, "too_many_requests", "too many requests", { "Retry-After": "30" }));
    const err = await rejection<HeadBoardError>(makeClient(fetchMock).createPost("roadmap", { title: "x" }));
    expect(err).toBeInstanceOf(HeadBoardError);
    expect(err.isRateLimited).toBe(true);
    expect(err.retryAfter).toBe(30);
  });

  it("flags 409 conflict on a duplicate vote", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => errorResponse(409, "conflict", "already voted"));
    const err = await rejection<HeadBoardError>(makeClient(fetchMock).vote("p1"));
    expect(err.isConflict).toBe(true);
  });

  it("flags 401 when voting without a user token", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => errorResponse(401, "unauthorized", "user token required to vote"));
    const err = await rejection<HeadBoardError>(makeClient(fetchMock).vote("p1"));
    expect(err.isUnauthorized).toBe(true);
  });

  it("wraps a network failure as status 0", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await rejection<HeadBoardError>(makeClient(fetchMock).listBoards());
    expect(err).toBeInstanceOf(HeadBoardError);
    expect(err.status).toBe(0);
    expect(err.code).toBe("network_error");
  });

  it("handles an empty body without throwing", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("", { status: 200 }));
    await expect(makeClient(fetchMock).unvote("p1")).resolves.toBeUndefined();
  });

  it("does not send a body or Content-Type on GET", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([board]));
    await makeClient(fetchMock).listBoards();
    const { init } = callAt(fetchMock, 0);
    expect(init.body).toBeUndefined();
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("sends a JSON body on identify", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ id: "u1", external_id: "user_1" }));
    await makeClient(fetchMock).identify({ external_id: "user_1", email: "a@b.com" });
    const { init } = callAt(fetchMock, 0);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ external_id: "user_1", email: "a@b.com" });
  });
});
