import type { CustomEmojiDiagnostics } from '$shared/browser/custom-emoji-diagnostics.js';

export type DeveloperEmojiDiagnosticsTranslator = (key: 'dev.emoji.cache_only_caveat') => string;

export interface TruncatedRefs {
  visible: readonly string[];
  hiddenCount: number;
}

export interface CopiedFeedbackTimerApi<TTimer> {
  setTimer: (callback: () => void, delayMs: number) => TTimer;
  clearTimer: (timer: TTimer) => void;
}

export type EmojiDiagnosticsCopyInput = Pick<
  CustomEmojiDiagnostics,
  | 'dbCounts'
  | 'summary'
  | 'listEvent'
  | 'sets'
  | 'missingRefs'
  | 'invalidRefs'
  | 'sourceMode'
  | 'warnings'
>;

export function truncateRefs(refs: readonly string[], limit = 20): TruncatedRefs {
  return {
    visible: refs.slice(0, limit),
    hiddenCount: Math.max(0, refs.length - limit)
  };
}

export function cacheOnlyCaveat(
  sourceMode: CustomEmojiDiagnostics['sourceMode'],
  unresolvedRefs: readonly string[],
  translate?: DeveloperEmojiDiagnosticsTranslator
): string | null {
  if (sourceMode !== 'cache-only' || unresolvedRefs.length === 0) return null;
  return translate
    ? translate('dev.emoji.cache_only_caveat')
    : 'Some refs were unresolved in local sources. Relay existence was not verified.';
}

export function diagnosticRefRowKey(ref: string, index: number): string {
  return `${index}:${ref}`;
}

export function replaceCopiedFeedbackTimer<TTimer>(
  previousTimer: TTimer | null,
  hideFeedback: () => void,
  timerApi: CopiedFeedbackTimerApi<TTimer>,
  delayMs = 2000
): TTimer {
  if (previousTimer !== null) {
    timerApi.clearTimer(previousTimer);
  }
  return timerApi.setTimer(hideFeedback, delayMs);
}

export function buildEmojiDiagnosticsCopyPayload(input: EmojiDiagnosticsCopyInput): string {
  return JSON.stringify(
    {
      dbCounts: input.dbCounts,
      summary: input.summary,
      listEvent: input.listEvent,
      sets: input.sets,
      missingRefs: input.missingRefs,
      invalidRefs: input.invalidRefs,
      sourceMode: input.sourceMode,
      warnings: input.warnings
    },
    null,
    2
  );
}
