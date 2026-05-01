import type { EventParameters } from 'nostr-typedef';

export const NIP14_TEXT_EVENT_KIND = 1;
export const NIP14_SUBJECT_TAG = 'subject';
export const NIP14_RECOMMENDED_MAX_SUBJECT_LENGTH = 80;

export function buildNip14SubjectTag(subject: string): string[] {
  const normalized = normalizeNip14Subject(subject);
  return [NIP14_SUBJECT_TAG, normalized];
}

export function buildNip14ReplySubjectTag(subject: string): string[] {
  return buildNip14SubjectTag(deriveNip14ReplySubject(subject));
}

export function parseNip14Subject(event: Pick<EventParameters, 'tags'>): string | null {
  const subject = event.tags?.find((tag) => tag[0] === NIP14_SUBJECT_TAG)?.[1]?.trim();
  return subject ? subject : null;
}

export function hasNip14Subject(event: Pick<EventParameters, 'tags'>): boolean {
  return parseNip14Subject(event) !== null;
}

export function isNip14SubjectTextEvent(event: Pick<EventParameters, 'kind' | 'tags'>): boolean {
  return event.kind === NIP14_TEXT_EVENT_KIND && hasNip14Subject(event);
}

export function deriveNip14ReplySubject(subject: string): string {
  const normalized = normalizeNip14Subject(subject);
  return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`;
}

export function isNip14SubjectLikelyTooLong(
  subject: string,
  maxLength = NIP14_RECOMMENDED_MAX_SUBJECT_LENGTH
): boolean {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) {
    throw new Error('NIP-14 subject max length must be a positive integer');
  }
  return normalizeNip14Subject(subject).length > maxLength;
}

export function appendNip14SubjectTag(
  tags: readonly (readonly string[])[],
  subject: string
): string[][] {
  const subjectTag = buildNip14SubjectTag(subject);
  return [...tags.filter((tag) => tag[0] !== NIP14_SUBJECT_TAG).map((tag) => [...tag]), subjectTag];
}

export function withNip14SubjectTag(event: EventParameters, subject: string): EventParameters {
  return {
    ...event,
    tags: appendNip14SubjectTag(event.tags ?? [], subject)
  };
}

function normalizeNip14Subject(subject: string): string {
  const normalized = subject.trim();
  if (!normalized) {
    throw new Error('NIP-14 subject must not be empty');
  }
  return normalized;
}
