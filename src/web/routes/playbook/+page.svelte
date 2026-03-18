{#if import.meta.env.DEV}
  {#await import('./PlaybookContent.svelte') then { default: PlaybookContent }}
    <PlaybookContent />
  {/await}
{/if}
