import type { VoteValue } from "../../database/types.js";
import { isAdultSlug } from "./adult-slugs.js";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type SourceRow = {
  id: string;
  title: string | null;
  url: string;
};

export type MythRow = {
  id: string;
  title: string;
  slug: string;
  verdict: string;
  explanation: string;
  status: string;
  country_code: string | null;
  created_at: string;
  updated_at: string;
  category: CategoryRow | CategoryRow[] | null;
  creator: ProfileRow | ProfileRow[] | null;
  sources?: SourceRow[] | null;
};

export function presentStats(
  votes: Array<{ value: VoteValue; user_id?: string | null }>,
  commentCount: number,
) {
  const trueCount = votes.filter((vote) => vote.value === "TRUE").length;
  const falseCount = votes.filter((vote) => vote.value === "FALSE").length;
  const total = trueCount + falseCount;
  const authenticatedCount = votes.filter((vote) => Boolean(vote.user_id)).length;

  return {
    trueCount,
    falseCount,
    truePercent: total === 0 ? 0 : Math.round((trueCount / total) * 100),
    falsePercent: total === 0 ? 0 : Math.round((falseCount / total) * 100),
    responseCount: total,
    authenticatedCount,
    anonymousCount: total - authenticatedCount,
    commentCount,
  };
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function presentMyth(
  myth: MythRow,
  votes: Array<{ value: VoteValue; user_id?: string | null }>,
  commentCount: number,
  myVote: VoteValue | null = null,
) {
  const category = unwrap(myth.category);
  const creator = unwrap(myth.creator);

  return {
    id: myth.id,
    title: myth.title,
    slug: myth.slug,
    verdict: myth.verdict,
    explanation: myth.explanation,
    status: myth.status,
    createdAt: myth.created_at,
    updatedAt: myth.updated_at,
    countryCode: myth.country_code,
    isAdult: isAdultSlug(myth.slug),
    category: category
      ? { id: category.id, name: category.name, slug: category.slug }
      : null,
    creator: creator
      ? {
          id: creator.id,
          displayName: creator.display_name ?? "MYTHH",
          avatarUrl: creator.avatar_url,
        }
      : { id: null, displayName: "MYTHH", avatarUrl: null },
    sources: (myth.sources ?? []).map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
    })),
    stats: presentStats(votes, commentCount),
    myVote,
  };
}
