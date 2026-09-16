import type { MythVerdict, VoteValue } from "../../database/types.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && uuidPattern.test(value));
}

export function canWriteComment(userId: string | null | undefined) {
  return Boolean(userId);
}

export function parseVoteValue(value: unknown): VoteValue | null {
  return value === "TRUE" || value === "FALSE" ? value : null;
}

export function voteOutcome(verdict: MythVerdict | string, selected: VoteValue) {
  const correctAnswer = verdict === "TRUE" || verdict === "FALSE" ? verdict : null;
  return {
    isCorrect:
      (selected === "TRUE" && verdict === "TRUE") ||
      (selected === "FALSE" && verdict === "FALSE"),
    correctAnswer,
  };
}

export function preferAccountVote<T>(accountVote: T | null | undefined, anonymousVote: T | null | undefined) {
  return accountVote ?? anonymousVote ?? null;
}

export function pickAnonymousId(cookieValue?: string | null, headerValue?: string | null) {
  if (isUuid(cookieValue)) return cookieValue;
  if (isUuid(headerValue)) return headerValue;
  return null;
}
