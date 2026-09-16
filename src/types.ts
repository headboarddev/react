/**
 * API model and envelope types.
 * Mirrors the HeadBoard API spec (`docs/api-spec.md`) exactly.
 */

export interface Board {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export type PostStatus = "open" | "planned" | "in_progress" | "complete" | "closed";

export interface Post {
  id: string;
  board_id: string;
  author_id?: string;
  title: string;
  body?: string;
  /** Server default is `open`. Custom statuses are possible, so this stays widenable. */
  status: PostStatus | (string & {});
  category?: string;
  vote_count: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  /** Set when the comment came from an identified end user. */
  author_id?: string;
  /** Set when the comment came from an org member (an admin reply). */
  member_id?: string;
  body: string;
  created_at: string;
}

export interface Vote {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface EndUser {
  id: string;
  org_id: string;
  external_id: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

/** Cursor pagination, returned on list endpoints. */
export interface Pagination {
  /** Last item ID of this page. Only meaningful when `has_more` is true. */
  next_cursor?: string;
  has_more: boolean;
}

export interface ResponseMeta {
  request_id: string;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: Pagination;
  meta: ResponseMeta;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
  meta: ResponseMeta;
}

/** Error codes the API is documented to return. */
export type ErrorCode =
  | "bad_request"
  | "validation_error"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "internal"
  | "unavailable";

export interface ListParams {
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Posts: default 20, max 100. Comments: default 50, max 100. */
  limit?: number;
  signal?: AbortSignal;
}

export interface IdentifyInput {
  external_id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

export interface CreatePostInput {
  title: string;
  body?: string;
}

export interface CreateCommentInput {
  body: string;
}

export interface Page<T> {
  items: T[];
  pagination?: Pagination;
}
