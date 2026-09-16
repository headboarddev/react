# @headboarddev/react

React SDK for [HeadBoard](https://headboard.dev) — SDK-first product feedback boards.

Headless hooks, not a widget. You bring the components; the SDK handles identity, fetching, pagination, optimistic voting, and typed errors.

- Zero runtime dependencies
- Full TypeScript types, generated from the API spec
- React 18 and 19, ESM + CJS
- ~19 kB unminified, tree-shakeable

```bash
npm install @headboarddev/react
```

## Quick start

```tsx
import { HeadBoardProvider, usePosts, useVote } from "@headboarddev/react";

function App() {
  return (
    <HeadBoardProvider apiKey="hb_live_..." userToken={userToken}>
      <Roadmap />
    </HeadBoardProvider>
  );
}

function Roadmap() {
  const { posts, isLoading, hasMore, loadMore, patchPost } = usePosts("roadmap");

  if (isLoading) return <Spinner />;

  return (
    <>
      {posts.map((post) => (
        <PostRow key={post.id} post={post} patchPost={patchPost} />
      ))}
      {hasMore && <button onClick={loadMore}>Load more</button>}
    </>
  );
}

function PostRow({ post, patchPost }) {
  const { voted, toggle, isPending } = useVote(post.id, {
    onVoteChange: (delta) => patchPost(post.id, { vote_count: post.vote_count + delta }),
  });

  return (
    <article>
      <button onClick={toggle} disabled={isPending} aria-pressed={voted}>
        ▲ {post.vote_count}
      </button>
      <h3>{post.title}</h3>
    </article>
  );
}
```

## Authentication

Two credentials, and the difference matters:

| | What it is | Where it lives |
| --- | --- | --- |
| `apiKey` | Public org identifier (`hb_...`) | Safe in browser code |
| `userToken` | HMAC token identifying one end user | **Minted on your server** |

The API key alone gets you read access. To vote — or to attribute posts and
comments to a real person — you need a user token.

### Minting a user token

The token is signed with your API key **secret**, which must never reach the
browser. Mint it in your backend and hand it to your frontend:

```ts
// Your server. NOT the browser.
import { createHmac } from "node:crypto";

function mintUserToken(secret: string, user: { id: string; email?: string; name?: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      external_id: user.id,
      email: user.email,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    }),
  ).toString("base64url");

  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
```

Then pass it to the provider. If your token refreshes, pass a getter — it is
re-read on every request, so you never have to remount the provider:

```tsx
<HeadBoardProvider apiKey="hb_live_..." userToken={() => session.headboardToken}>
```

Without a user token, reads and post/comment creation still work — they are
just anonymous. Voting returns `401`.

## Hooks

### Reading

| Hook | Returns |
| --- | --- |
| `useBoards()` | `{ boards, isLoading, error, refetch }` |
| `useBoard(slug)` | `{ board, isLoading, error, refetch }` |
| `usePosts(slug, { limit })` | `{ posts, hasMore, loadMore, isLoadingMore, patchPost, … }` |
| `usePost(id)` | `{ post, isLoading, error, refetch }` |
| `useComments(id, { limit })` | `{ comments, hasMore, loadMore, appendComment, … }` |

Pass `undefined` as the id to keep a hook idle — useful while a route param is
still resolving. No request fires, and nothing is stale when it resumes.

### Writing

| Hook | Returns |
| --- | --- |
| `useVote(id, { hasVoted, onVoteChange })` | `{ voted, toggle, isPending, error }` |
| `useCreatePost(slug)` | `{ createPost, isPending, error }` |
| `useCreateComment(id)` | `{ createComment, isPending, error }` |
| `useIdentify(user?)` | `{ endUser, identify, isPending, error }` |

`useVote` is optimistic: it flips immediately and rolls back if the request
fails. A `409 already voted` is treated as success, since the server already
agrees with the optimistic state.

Wire `onVoteChange` to `patchPost` (from `usePosts`) so the count moves with
the button:

```tsx
const { voted, toggle } = useVote(post.id, {
  onVoteChange: (delta) => patchPost(post.id, { vote_count: post.vote_count + delta }),
});
```

> **Known limitation:** the API does not yet report whether the current user has
> already voted on a post, so `useVote` starts at `voted: false`. If you track
> it yourself, pass `hasVoted` — it is adopted when it arrives, so a value that
> loads a render later still sets the button correctly. Otherwise expect a
> `409` to correct the state on the first click. The fix is a `has_voted` field
> on `Post` when a user token is present.

### Identity

```tsx
// Identify on mount, re-identifying only when the identity actually changes.
useIdentify({ external_id: user.id, email: user.email, name: user.name });

// Or imperatively, after login.
const { identify } = useIdentify();
await identify({ external_id: user.id, email: user.email });
```

Passing a fresh object literal each render is fine — re-identification is keyed
on the field values, not object identity.

## Errors

Everything rejects with a `HeadBoardError`:

```tsx
import { HeadBoardError, isHeadBoardError } from "@headboarddev/react";

if (isHeadBoardError(error)) {
  error.status;         // HTTP status, or 0 if the request never left
  error.code;           // "unauthorized" | "not_found" | "conflict" | …
  error.requestId;      // quote this when reporting a bug
  error.retryAfter;     // seconds, on a 429
  error.isUnauthorized; // needs a user token
  error.isRateLimited;
  error.isConflict;     // already voted
  error.isNotFound;
}
```

Network failures surface as `status: 0` with code `network_error`, so you can
tell "offline" apart from "the API said no".

## Using the client directly

The hooks wrap a framework-agnostic client you can use on a server or outside
React:

```ts
import { HeadBoardClient } from "@headboarddev/react";

const client = new HeadBoardClient({ apiKey: process.env.HEADBOARD_API_KEY! });
const { items, pagination } = await client.listPosts("roadmap", { limit: 50 });
```

Every method takes an optional `AbortSignal`.

## Configuration

```tsx
<HeadBoardProvider
  apiKey="hb_live_..."
  userToken={tokenOrGetter}   // optional
  baseUrl="https://api.headboard.dev"  // optional, for self-hosted
  fetch={customFetch}         // optional, for tests or odd runtimes
/>
```

## Contributing

```bash
npm install
npm test
npm run type-check
npm run lint
npm run build
```

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
