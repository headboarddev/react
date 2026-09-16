import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { HeadBoardProvider } from "../src/context.js";
import { usePosts } from "../src/hooks/usePosts.js";
import { useVote } from "../src/hooks/useVote.js";
import { callAt, jsonResponse, post } from "./helpers.js";

describe("provider stability", () => {
  it("does not rebuild the client when its parent re-renders with an inline userToken", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([post("p1")]));

    function Child() {
      const { posts } = usePosts("roadmap");
      return <span>{posts.length}</span>;
    }

    // Inline arrow props, exactly as the README documents them. A new identity
    // each render must not invalidate the client.
    function App() {
      const [, setN] = useState(0);
      useEffect(() => {
        const id = setInterval(() => setN((x) => x + 1), 5);
        const stop = setTimeout(() => clearInterval(id), 100);
        return () => {
          clearInterval(id);
          clearTimeout(stop);
        };
      }, []);
      return (
        <HeadBoardProvider
          apiKey="hb"
          baseUrl="https://api.test"
          fetch={(input, init) => fetchMock(input, init)}
          userToken={() => "tok"}
        >
          <Child />
        </HeadBoardProvider>
      );
    }

    render(<App />);
    // The interval re-renders App outside React's knowledge; act() lets those
    // commits flush so the assertion sees the settled request count.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 160));
    });

    // One render storm used to produce ~23 requests here.
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it("re-reads a rotating token without remounting", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([post("p1")]));
    let token = "tok_a";

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <HeadBoardProvider apiKey="hb" baseUrl="https://api.test" fetch={fetchMock} userToken={() => token}>
          {children}
        </HeadBoardProvider>
      );
    }

    const { result } = renderHook(() => usePosts("roadmap"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(callAt(fetchMock, 0).init.headers["X-User-Token"]).toBe("tok_a");

    token = "tok_b";
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
    expect(callAt(fetchMock, 1).init.headers["X-User-Token"]).toBe("tok_b");
  });
});

describe("useVote hasVoted", () => {
  it("adopts hasVoted when it arrives after mount", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ deleted: "vote" }));
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <HeadBoardProvider apiKey="hb" baseUrl="https://api.test" fetch={fetchMock}>
          {children}
        </HeadBoardProvider>
      );
    }

    const { result, rerender } = renderHook(
      ({ hasVoted }: { hasVoted: boolean | undefined }) => useVote("p1", { hasVoted }),
      { wrapper: Wrapper, initialProps: { hasVoted: undefined as boolean | undefined } },
    );

    // Post has not loaded yet.
    expect(result.current.voted).toBe(false);

    // Post arrives saying the user already voted.
    act(() => rerender({ hasVoted: true }));
    expect(result.current.voted).toBe(true);
  });

  it("keeps a user toggle from being clobbered by an unchanged hasVoted", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ id: "v1" }, { status: 201 }));
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <HeadBoardProvider apiKey="hb" baseUrl="https://api.test" fetch={fetchMock} userToken="tok">
          {children}
        </HeadBoardProvider>
      );
    }

    const { result, rerender } = renderHook(() => useVote("p1", { hasVoted: false }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.toggle();
    });
    await waitFor(() => expect(result.current.voted).toBe(true));

    // A re-render with the same stale `hasVoted: false` must not undo it.
    rerender();
    expect(result.current.voted).toBe(true);
  });
});
