import { untrack } from 'svelte';
import { fetchProfiles } from '$shared/browser/profile.js';
import type { Comment } from '../domain/comment-model.js';

export function useCommentProfilePreload(getComments: () => Comment[]) {
  $effect(() => {
    const pubkeys = [...new Set(getComments().map((comment) => comment.pubkey))];
    if (pubkeys.length === 0) return;
    untrack(() => fetchProfiles(pubkeys));
  });
}
