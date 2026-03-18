{#if import.meta.env.DEV}
  {#await import('./PlaybookContent.svelte') then { default: PlaybookContent }}
    <PlaybookContent />
  {:catch e}
    <p class="text-red-500">PlaybookContent の読み込みに失敗しました: {e?.message}</p>
  {/await}
{/if}
