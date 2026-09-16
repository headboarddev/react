import { HeadBoardError } from "./errors.js";
import type {
  ApiErrorBody,
  ApiResponse,
  Board,
  Comment,
  CreateCommentInput,
  CreatePostInput,
  EndUser,
  IdentifyInput,
  ListParams,
  Page,
  Post,
  Vote,
} from "./types.js";

export interface HeadBoardClientOptions {
  /** Public API key (`hb_...`). Safe to ship in browser code. */
  apiKey: string;
  /**
   * HMAC user token identifying the current end user.
   *
   * Minted by YOUR backend — never in the browser, since signing needs the API
   * key secret. Required to vote; optional elsewhere (it links authorship).
   * Pass a function to re-read a token that refreshes over time.
   */
  userToken?: string | (() => string | undefined);
  /** API base URL. Defaults to the hosted API. */
  baseUrl?: string;
  /** Injected for tests or non-browser runtimes. Defaults to global `fetch`. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = "https://api.headboard.dev";

/**
 * Framework-agnostic HeadBoard API client.
 *
 * The React hooks wrap this; you can also use it directly on a server or in a
 * non-React app.
 */
export class HeadBoardClient {
  readonly #apiKey: string;
  readonly #userToken?: string | (() => string | undefined);
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HeadBoardClientOptions) {
    if (!options.apiKey) {
      throw new Error("HeadBoard: `apiKey` is required");
    }
    this.#apiKey = options.apiKey;
    this.#userToken = options.userToken;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error(
        "HeadBoard: no `fetch` available. Pass `fetch` explicitly on older runtimes.",
      );
    }
    // Unbound `globalThis.fetch` throws "Illegal invocation" in browsers.
    this.#fetch = f.bind(globalThis);
  }

  /** Resolves the current user token, calling the getter if one was supplied. */
  get userToken(): string | undefined {
    return typeof this.#userToken === "function" ? this.#userToken() : this.#userToken;
  }

  async #request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, string | number | undefined>; signal?: AbortSignal } = {},
  ): Promise<ApiResponse<T>> {
    const url = new URL(this.#baseUrl + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { "X-API-Key": this.#apiKey };
    const token = this.userToken;
    if (token) headers["X-User-Token"] = token;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await this.#fetch(url.toString(), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (cause) {
      // Let abort propagate untouched so callers can ignore it as normal.
      // Not all runtimes throw a DOMException here, so match on the name.
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new HeadBoardError({
        message: cause instanceof Error ? cause.message : "network request failed",
        status: 0,
        code: "network_error",
      });
    }

    // 204 and other empty bodies would blow up JSON.parse.
    const text = await res.text();
    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new HeadBoardError({
          message: `invalid JSON response (status ${res.status})`,
          status: res.status,
          code: "internal",
        });
      }
    }

    if (!res.ok) {
      const body = parsed as ApiErrorBody | undefined;
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      throw new HeadBoardError({
        message: body?.error?.message ?? `request failed with status ${res.status}`,
        status: res.status,
        code: body?.error?.code ?? "internal",
        requestId: body?.meta?.request_id,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
      });
    }

    return parsed as ApiResponse<T>;
  }

  async #list<T>(path: string, params: ListParams = {}): Promise<Page<T>> {
    const res = await this.#request<T[]>("GET", path, {
      query: { cursor: params.cursor, limit: params.limit },
      signal: params.signal,
    });
    return { items: res.data ?? [], pagination: res.pagination };
  }

  // --- Identity -----------------------------------------------------------

  /** Create or update the end user for `external_id`. Upserts on (org, external_id). */
  async identify(input: IdentifyInput, signal?: AbortSignal): Promise<EndUser> {
    const res = await this.#request<EndUser>("POST", "/api/v1/identify", { body: input, signal });
    return res.data;
  }

  // --- Boards -------------------------------------------------------------

  async listBoards(signal?: AbortSignal): Promise<Board[]> {
    const res = await this.#request<Board[]>("GET", "/api/v1/boards", { signal });
    return res.data ?? [];
  }

  async getBoard(boardSlug: string, signal?: AbortSignal): Promise<Board> {
    const res = await this.#request<Board>("GET", `/api/v1/boards/${encodeURIComponent(boardSlug)}`, { signal });
    return res.data;
  }

  // --- Posts --------------------------------------------------------------

  /** List a board's posts. Default limit 20, max 100. */
  listPosts(boardSlug: string, params?: ListParams): Promise<Page<Post>> {
    return this.#list<Post>(`/api/v1/boards/${encodeURIComponent(boardSlug)}/posts`, params);
  }

  async getPost(postId: string, signal?: AbortSignal): Promise<Post> {
    const res = await this.#request<Post>("GET", `/api/v1/posts/${encodeURIComponent(postId)}`, { signal });
    return res.data;
  }

  /** Create a post. Authorship is linked when a valid user token is set. */
  async createPost(boardSlug: string, input: CreatePostInput, signal?: AbortSignal): Promise<Post> {
    const res = await this.#request<Post>(
      "POST",
      `/api/v1/boards/${encodeURIComponent(boardSlug)}/posts`,
      { body: input, signal },
    );
    return res.data;
  }

  // --- Votes --------------------------------------------------------------

  /** Vote on a post. Requires a user token. Throws 409 `conflict` if already voted. */
  async vote(postId: string, signal?: AbortSignal): Promise<Vote> {
    const res = await this.#request<Vote>("POST", `/api/v1/posts/${encodeURIComponent(postId)}/votes`, { signal });
    return res.data;
  }

  /** Remove a vote. Requires a user token. */
  async unvote(postId: string, signal?: AbortSignal): Promise<void> {
    await this.#request<{ deleted: string }>("DELETE", `/api/v1/posts/${encodeURIComponent(postId)}/votes`, { signal });
  }

  // --- Comments -----------------------------------------------------------

  /** List a post's comments. Default limit 50, max 100. */
  listComments(postId: string, params?: ListParams): Promise<Page<Comment>> {
    return this.#list<Comment>(`/api/v1/posts/${encodeURIComponent(postId)}/comments`, params);
  }

  /** Add a comment. Authorship is linked when a valid user token is set. */
  async createComment(postId: string, input: CreateCommentInput, signal?: AbortSignal): Promise<Comment> {
    const res = await this.#request<Comment>(
      "POST",
      `/api/v1/posts/${encodeURIComponent(postId)}/comments`,
      { body: input, signal },
    );
    return res.data;
  }
}
