<script lang="ts">
  import { t } from '../i18n/t.js';

  interface Props {
    sending?: boolean;
    flying?: boolean;
    disabled?: boolean;
    type?: 'submit' | 'button';
    onclick?: () => void;
  }

  let {
    sending = false,
    flying = false,
    disabled = false,
    type = 'submit',
    onclick
  }: Props = $props();
</script>

<div class="relative">
  {#if flying}
    <svg
      aria-hidden="true"
      class="plane-fly pointer-events-none absolute bottom-full left-3 h-5 w-5 text-accent"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  {/if}
  <button
    {type}
    {onclick}
    disabled={sending || flying || disabled}
    class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
  >
    {#if sending}
      <svg
        aria-hidden="true"
        class="h-4 w-4 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      {t('send.sending')}
    {:else}
      <svg
        aria-hidden="true"
        class="h-4 w-4 {flying ? 'btn-icon-fade-out' : ''}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
      {t('send.send')}
    {/if}
  </button>
</div>

<style>
  .plane-fly {
    animation: fly-away 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  @keyframes fly-away {
    0% {
      transform: translate(0, 0) rotate(0deg) scale(1);
      opacity: 1;
    }
    50% {
      opacity: 1;
    }
    100% {
      transform: translate(60px, -80px) rotate(-20deg) scale(0.3);
      opacity: 0;
    }
  }

  .btn-icon-fade-out {
    animation: icon-fade 400ms ease-out forwards;
  }

  @keyframes icon-fade {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0.2;
    }
  }
</style>
