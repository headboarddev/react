import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { HeadBoardProvider, useHeadBoard } from "../src/context.js";
import { useComments } from "../src/hooks/useComments.js";
import { useIdentify } from "../src/hooks/useIdentify.js";
import { usePosts } from "../src/hooks/usePosts.js";
import { useVote } from "../src/hooks/useVote.js";
import { at, callAt, errorResponse, jsonResponse, post } from "./helpers.js";

function wrapperWith(fetchImpl: typeof globalThis.fetch, userToken?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HeadBoardProvider apiKey="hb_test" baseUrl="https://api.test" fetch={fetchImpl} userToken={userToken}>
        {children}
      </HeadBoardProvider>
    );
  };
}

describe("HeadBoardProvider", () => {
  it("throws a clear error when no provider is mounted", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Bare() {
      useHeadBoard();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/no <HeadBoardProvider>/);
    spy.mockRestore();
  });

  it("requires apiKey or client", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <HeadBoardProvider>
          <div />
        </HeadBoardProvider>,
      ),
    ).toThrow(/`client` or `apiKey`/);
    spy.mockRestore();
  });

  it("provides a working client to children", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([post("p1")]));
    function Boards() {
      const client = useHeadBoard();
      return <span>{client.userToken ?? "anon"}</span>;
    }
    render(<Boards />, { wrapper: wrapperWith(fetchMock, "tok_x") });
    expect(screen.getByText("tok_x")).toBeDefined();
  });
});

describe("usePosts", () => {
  it("loads the first page", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => 
      jsonResponse([post("p1"), post("p2")], { pagination: { has_more: false } }),
    );
    const { result } = renderHook(() => usePosts("roadmap"), { wrapper: wrapperWith(fetchMock) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.posts.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("stays idle when boardSlug is undefined", async () => {
    const fetchMock = vi.fn();
    const { result } = renderHook(() => usePosts(undefined), { wrapper: wrapperWith(fetchMock) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.posts).toEqual([]);
  });

  it("appends the next page and de-dupes overlaps", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse([post("p1"), post("p2")], { pagination: { next_cursor: "p2", has_more: true } }))
      .mockImplementationOnce(async () => jsonResponse([post("p2"), post("p3")], { pagination: { has_more: false } }));

    const { result } = renderHook(() => usePosts("roadmap"), { wrapper: wrapperWith(fetchMock) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.posts.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("does not fetch more when hasMore is false", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([post("p1")], { pagination: { has_more: false } }));
    const { result } = renderHook(() => usePosts("roadmap"), { wrapper: wrapperWith(fetchMock) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces errors", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => errorResponse(404, "not_found", "board not found"));
    const { result } = renderHook(() => usePosts("nope"), { wrapper: wrapperWith(fetchMock) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe("board not found");
  });

  it("patchPost applies a local vote-count change", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([post("p1", { vote_count: 3 })]));
    const { result } = renderHook(() => usePosts("roadmap"), { wrapper: wrapperWith(fetchMock) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.patchPost("p1", { vote_count: 4 }));
    expect(at(result.current.posts, 0).vote_count).toBe(4);
  });
});

describe("useVote", () => {
  it("optimistically flips then confirms", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ id: "v1", post_id: "p1", user_id: "u1" }, { status: 201 }));
    const onVoteChange = vi.fn();
    const { result } = renderHook(() => useVote("p1", { onVoteChange }), {
      wrapper: wrapperWith(fetchMock, "tok"),
    });

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.voted).toBe(true);
    expect(onVoteChange).toHaveBeenCalledWith(1, true);
    expect(result.current.error).toBeUndefined();
  });

  it("rolls back on failure", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => errorResponse(401, "unauthorized", "user token required to vote"));
    const onVoteChange = vi.fn();
    const { result } = renderHook(() => useVote("p1", { onVoteChange }), { wrapper: wrapperWith(fetchMock) });

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.voted).toBe(false);
    expect(onVoteChange).toHaveBeenNthCalledWith(1, 1, true);
    expect(onVoteChange).toHaveBeenNthCalledWith(2, -1, false);
    expect(result.current.error).toBeDefined();
  });

  it("keeps the optimistic state on a 409 already-voted", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => errorResponse(409, "conflict", "already voted"));
    const { result } = renderHook(() => useVote("p1"), { wrapper: wrapperWith(fetchMock, "tok") });

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.voted).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it("unvotes when already voted", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ deleted: "vote" }));
    const { result } = renderHook(() => useVote("p1", { hasVoted: true }), {
      wrapper: wrapperWith(fetchMock, "tok"),
    });

    await act(async () => {
      await result.current.toggle();
    });

    expect(callAt(fetchMock, 0).init.method).toBe("DELETE");
    expect(result.current.voted).toBe(false);
  });
});

describe("useComments", () => {
  it("appends a new comment locally", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([{ id: "c1", post_id: "p1", body: "hi", created_at: "x" }]));
    const { result } = renderHook(() => useComments("p1"), { wrapper: wrapperWith(fetchMock) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.appendComment({ id: "c2", post_id: "p1", body: "yo", created_at: "y" }));
    expect(result.current.comments.map((c) => c.id)).toEqual(["c1", "c2"]);

    // Idempotent on the same id.
    act(() => result.current.appendComment({ id: "c2", post_id: "p1", body: "yo", created_at: "y" }));
    expect(result.current.comments).toHaveLength(2);
  });
});

describe("useIdentify", () => {
  it("identifies on mount when a user is supplied", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ id: "u1", external_id: "user_1" }));
    const { result } = renderHook(() => useIdentify({ external_id: "user_1" }), {
      wrapper: wrapperWith(fetchMock),
    });

    await waitFor(() => expect(result.current.endUser?.external_id).toBe("user_1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-identify when passed an equal object literal", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ id: "u1", external_id: "user_1" }));
    const { rerender } = renderHook(({ id }: { id: string }) => useIdentify({ external_id: id }), {
      wrapper: wrapperWith(fetchMock),
      initialProps: { id: "user_1" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ id: "user_1" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ id: "user_2" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("does nothing without an external_id", async () => {
    const fetchMock = vi.fn();
    renderHook(() => useIdentify(undefined), { wrapper: wrapperWith(fetchMock) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
