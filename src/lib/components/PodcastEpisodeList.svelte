<script lang="ts">
  import type { ContentId } from '$lib/content/types.js';

  interface Props {
    contentId: ContentId;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let { contentId }: Props = $props();
</script>

<div class="rounded-2xl border border-border-subtle bg-surface-secondary p-4">
  <p class="text-text-secondary">エピソード一覧を読み込み中...</p>
</div>
