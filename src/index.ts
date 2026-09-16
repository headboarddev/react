export { HeadBoardClient, type HeadBoardClientOptions } from "./client.js";
export { HeadBoardProvider, useHeadBoard, type HeadBoardProviderProps } from "./context.js";
export { HeadBoardError, isHeadBoardError } from "./errors.js";

export { useBoards } from "./hooks/useBoards.js";
export { useBoard } from "./hooks/useBoard.js";
export { usePosts, type UsePostsOptions } from "./hooks/usePosts.js";
export { usePost } from "./hooks/usePost.js";
export { useComments, type UseCommentsOptions } from "./hooks/useComments.js";
export { useVote, type UseVoteOptions } from "./hooks/useVote.js";
export { useCreatePost } from "./hooks/useCreatePost.js";
export { useCreateComment } from "./hooks/useCreateComment.js";
export { useIdentify } from "./hooks/useIdentify.js";

export type {
  ApiResponse,
  Board,
  Comment,
  CreateCommentInput,
  CreatePostInput,
  EndUser,
  ErrorCode,
  IdentifyInput,
  ListParams,
  Page,
  Pagination,
  Post,
  PostStatus,
  Vote,
} from "./types.js";
