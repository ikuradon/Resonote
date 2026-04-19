## 2026-04-19 Task1 auth/session hydrate centralization

- `initSession(pubkey)` に `fetchProfile(pubkey)` を追加し、current-user kind:0 hydration を auth/session ライフサイクルで実行するようにした。
- `onLogin(pubkey)` は既存どおり `await initSession(pubkey)` を通るため、interactive login と session restore（`nlAuth` login/signup 再通知）で同一路径になる。
- `login-button-view-model.svelte.ts` から eager `fetchProfile` 副作用を削除し、表示系 (`getProfileDisplay`) を side-effect free のまま維持した。
- 回帰防止として `init-session.test.ts` に `fetchProfile` 呼び出しと失敗時の非致命動作を追加し、`login-button-view-model.test.ts` に「view-model 作成で profile fetch を起こさない」ことを追加した。

## Task 2: Navbar Avatar Hydration

- Added `data-testid` support to `UserAvatar.svelte` to allow deterministic selectors for testing.
- Added `data-testid="navbar-profile-link"`, `data-testid="navbar-avatar-image"`, and `data-testid="navbar-avatar-fallback"` to `+layout.svelte` and `UserAvatar.svelte`.
- Updated `app-shell-view-model.svelte.test.ts` to verify that `profileDisplay` updates when `auth.pubkey` changes, ensuring no stale avatar.
- Updated `profile.svelte.test.ts` to verify that `getProfileDisplay` returns the hydrated picture when available, and falls back to `undefined` when missing or invalid.
- Kept `app-shell-view-model` and `getProfileDisplay()` side-effect free.

## 2026-04-19 Task3 central regression coverage

- `init-session.test.ts` で `initSession(pubkey)` がログイン切替ごとに `fetchProfile` を再実行することを追加し、current-user hydration が中央経路に固定されていることを明示した。
- `app-shell-view-model.svelte.test.ts` で navbar が `getProfileDisplay` の hydrated `picture` を消費し、`picture` 欠落/invalid sanitize 済みケースでは `undefined` を返して fallback に委ねることを追加した。
- `app-shell-view-model.svelte.test.ts` と `login-button-view-model.test.ts` の両方で account-switch と logout 時の `picture` 退避を検証し、stale avatar が残らないことを回帰保証にした。
- `profile.svelte.test.ts` で `clearProfiles()` 後と別アカウント未画像時の `getProfileDisplay(...).picture === undefined` を追加し、プロファイル層の fallback semantics を明確化した。

## Task 4: E2E Proof for Navbar Avatar Hydration

- Added E2E tests in `e2e/auth-flows.test.ts` to verify navbar avatar hydration after login.
- Used `page.route` to intercept the image request and return a valid 1x1 PNG buffer. This is necessary because `sanitizeUrl` only allows `http:` and `https:` protocols, rejecting `data:` URIs, and a real URL would fail to load in the test environment, triggering the `onerror` fallback.
- Verified that the happy path correctly displays `[data-testid="navbar-avatar-image"]` with the metadata picture.
- Verified that the fallback path correctly displays `[data-testid="navbar-avatar-fallback"]` when the metadata picture is missing.
