import { HttpError } from "../../middleware/error-handler.js";
import type { MythhClient } from "../../database/client.js";
import type { VoteValue } from "../../database/types.js";
import { uniqueSlug } from "../../utils/slug.js";
import { presentMyth, type MythRow } from "./myth.presenter.js";

export type VoteIdentity = {
  userId?: string | null;
  anonymousId?: string | null;
};

const mythCardSelect = `
  id,
  title,
  slug,
  verdict,
  explanation,
  status,
  country_code,
  created_at,
  updated_at,
  category:categories(id, name, slug),
  creator:profiles(id, display_name, avatar_url)
`;

const mythSelect = `
  ${mythCardSelect},
  sources(id, title, url)
`;

type VoteStatRow = { myth_id: string; value: VoteValue; user_id: string | null };

async function loadStats(client: MythhClient, mythIds: string[]) {
  if (mythIds.length === 0) {
    return {
      votesByMyth: new Map<string, VoteStatRow[]>(),
      commentsByMyth: new Map<string, number>(),
    };
  }

  const [{ data: votes, error: voteError }, { data: comments, error: commentError }] =
    await Promise.all([
      client.from("votes").select("myth_id, value, user_id").in("myth_id", mythIds),
      client.from("comments").select("myth_id").eq("status", "VISIBLE").in("myth_id", mythIds),
    ]);

  if (voteError) {
    throw new HttpError(502, voteError.message, "VOTE_STATS_FAILED");
  }

  if (commentError) {
    throw new HttpError(502, commentError.message, "COMMENT_STATS_FAILED");
  }

  const votesByMyth = new Map<string, VoteStatRow[]>();
  const commentsByMyth = new Map<string, number>();

  for (const vote of votes ?? []) {
    const current = votesByMyth.get(vote.myth_id) ?? [];
    current.push(vote);
    votesByMyth.set(vote.myth_id, current);
  }

  for (const comment of comments ?? []) {
    commentsByMyth.set(
      comment.myth_id,
      (commentsByMyth.get(comment.myth_id) ?? 0) + 1,
    );
  }

  return { votesByMyth, commentsByMyth };
}

async function loadMyVotes(
  client: MythhClient,
  mythIds: string[],
  identity: VoteIdentity = {},
) {
  const mine = new Map<string, VoteValue>();
  if (mythIds.length === 0) return mine;

  const filters = [
    identity.userId ? `user_id.eq.${identity.userId}` : "",
    identity.anonymousId ? `anonymous_id.eq.${identity.anonymousId}` : "",
  ].filter(Boolean);

  if (filters.length === 0) return mine;

  const { data, error } = await client
    .from("votes")
    .select("myth_id, value, user_id")
    .in("myth_id", mythIds)
    .or(filters.join(","));

  if (error) {
    throw new HttpError(502, error.message, "MY_VOTE_LOOKUP_FAILED");
  }

  for (const vote of data ?? []) {
    if (identity.userId && vote.user_id === identity.userId) {
      mine.set(vote.myth_id, vote.value);
    } else if (!mine.has(vote.myth_id)) {
      mine.set(vote.myth_id, vote.value);
    }
  }

  return mine;
}

export async function listApprovedMyths(
  client: MythhClient,
  options: { limit: number; categorySlug?: string; q?: string; country?: string },
  identity: VoteIdentity = {},
) {
  let query = client
    .from("myths")
    .select(mythCardSelect)
    .eq("status", "APPROVED")
    .order("created_at", { ascending: false })
    .limit(options.limit);

  if (options.country) {
    query = query.or(`country_code.eq.${options.country},country_code.is.null`);
  }

  if (options.categorySlug) {
    const { data: category, error } = await client
      .from("categories")
      .select("id")
      .eq("slug", options.categorySlug)
      .maybeSingle();

    if (error) {
      throw new HttpError(502, error.message, "CATEGORY_LOOKUP_FAILED");
    }

    if (!category) {
      return [];
    }

    query = query.eq("category_id", category.id);
  }

  if (options.q) {
    const q = sanitizeSearch(options.q);
    if (q) {
      query = query.or(`title.ilike.%${q}%,explanation.ilike.%${q}%`);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new HttpError(502, error.message, "MYTH_LIST_FAILED");
  }

  const myths = (data ?? []) as unknown as MythRow[];
  const ids = myths.map((myth) => myth.id);
  const [{ votesByMyth, commentsByMyth }, myVotes] = await Promise.all([
    loadStats(client, ids),
    loadMyVotes(client, ids, identity),
  ]);

  return myths.map((myth) =>
    presentMyth(
      myth,
      votesByMyth.get(myth.id) ?? [],
      commentsByMyth.get(myth.id) ?? 0,
      myVotes.get(myth.id) ?? null,
    ),
  );
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeSearch(value: string) {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

const SEARCH_STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "are",
  "was",
  "were",
  "not",
  "but",
  "you",
  "your",
  "our",
  "its",
  "must",
  "can",
  "should",
  "would",
  "could",
  "will",
  "just",
  "than",
  "then",
  "them",
  "they",
  "their",
  "been",
  "have",
  "has",
  "had",
  "does",
  "did",
  "into",
  "over",
  "only",
  "also",
  "more",
  "some",
  "any",
  "all",
  "each",
  "very",
  "too",
  "a",
  "an",
  "of",
  "in",
  "on",
  "to",
  "is",
  "it",
  "or",
  "as",
  "at",
  "by",
  "be",
]);

function relatedTokens(q: string) {
  return sanitizeSearch(q)
    .toLowerCase()
    .split(" ")
    .filter((token) => token.length >= 3 && !SEARCH_STOP.has(token))
    .slice(0, 5);
}

function titleWords(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function relatedScore(title: string, query: string) {
  const queryWords = titleWords(query);
  const normalizedTitle = titleWords(title).join(" ");
  const normalizedQuery = queryWords.join(" ");
  if (!normalizedTitle || !normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return 1000;
  if (
    queryWords.length >= 2 &&
    (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle))
  ) {
    return 800;
  }
  const tokens = relatedTokens(query);
  if (!tokens.length) return 0;
  const words = titleWords(title);
  const hits = tokens.filter((token) =>
    words.some((word) => word === token || (token.length >= 4 && word.startsWith(token))),
  ).length;
  return hits * 20 + Math.round((hits / tokens.length) * 40);
}

export async function listRelatedMyths(client: MythhClient, q: string, limit = 5) {
  const phrase = sanitizeSearch(q).toLowerCase();
  if (phrase.length < 4) return [];
  const tokens = relatedTokens(q);
  const longest = [...tokens].sort((left, right) => right.length - left.length)[0];
  const needles = [
    ...new Set(
      [tokens.length > 0 ? phrase : null, longest].filter(
        (needle): needle is string =>
          Boolean(needle && needle.length >= 3 && !SEARCH_STOP.has(needle)),
      ),
    ),
  ];
  if (needles.length === 0) return [];

  const batches = await Promise.all(
    needles.map(async (needle) => {
      const { data, error } = await client
        .from("myths")
        .select("id, title, slug, status, category:categories(id, name, slug)")
        .eq("status", "APPROVED")
        .ilike("title", `%${needle}%`)
        .limit(12);
      if (error) {
        throw new HttpError(502, error.message, "RELATED_MYTHS_FAILED");
      }
      return data ?? [];
    }),
  );

  const seen = new Map<string, (typeof batches)[number][number]>();
  for (const batch of batches) {
    for (const row of batch) {
      seen.set(row.id, row);
    }
  }

  const minScore = tokens.length >= 2 ? 50 : 20;

  return [...seen.values()]
    .map((row) => {
      const category = Array.isArray(row.category) ? row.category[0] : row.category;
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        score: relatedScore(row.title, q),
        category: category
          ? { id: category.id, name: category.name, slug: category.slug }
          : null,
      };
    })
    .filter((row) => row.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(limit, 8))
    .map(({ score: _score, ...myth }) => myth);
}

export async function getMyth(
  client: MythhClient,
  idOrSlug: string,
  identity: VoteIdentity = {},
) {
  const isUuid = uuidPattern.test(idOrSlug);

  const { data, error } = await client
    .from("myths")
    .select(mythSelect)
    .eq(isUuid ? "id" : "slug", idOrSlug)
    .maybeSingle();

  if (error) {
    throw new HttpError(502, error.message, "MYTH_LOOKUP_FAILED");
  }

  if (!data) {
    throw new HttpError(404, "Myth not found", "MYTH_NOT_FOUND");
  }

  const myth = data as unknown as MythRow;
  const [{ votesByMyth, commentsByMyth }, myVotes] = await Promise.all([
    loadStats(client, [myth.id]),
    loadMyVotes(client, [myth.id], identity),
  ]);

  return presentMyth(
    myth,
    votesByMyth.get(myth.id) ?? [],
    commentsByMyth.get(myth.id) ?? 0,
    myVotes.get(myth.id) ?? null,
  );
}

export async function pickApprovedMythSlug(
  client: MythhClient,
  options: { categorySlug?: string; country?: string } = {},
) {
  let query = client
    .from("myths")
    .select("slug, country_code")
    .eq("status", "APPROVED")
    .order("created_at", { ascending: false })
    .limit(24);

  if (options.country) {
    query = query.or(`country_code.eq.${options.country},country_code.is.null`);
  }

  if (options.categorySlug) {
    const { data: category, error } = await client
      .from("categories")
      .select("id")
      .eq("slug", options.categorySlug)
      .maybeSingle();

    if (error) {
      throw new HttpError(502, error.message, "CATEGORY_LOOKUP_FAILED");
    }
    if (!category) return null;
    query = query.eq("category_id", category.id);
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError(502, error.message, "MYTH_PICK_FAILED");
  }

  const rows = data ?? [];
  if (rows.length === 0) return null;
  const local = options.country
    ? rows.filter((row) => row.country_code === options.country)
    : rows;
  const pool = local.length ? local : rows;
  return pool[Math.floor(Math.random() * pool.length)]?.slug ?? pool[0]?.slug ?? null;
}

export async function listMythComments(client: MythhClient, mythId: string) {
  const { data, error } = await client
    .from("comments")
    .select(
      "id, content, created_at, user:profiles(id, display_name, avatar_url)",
    )
    .eq("myth_id", mythId)
    .eq("status", "VISIBLE")
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(502, error.message, "COMMENT_LIST_FAILED");
  }

  return (data ?? []).map((comment) => {
    const user = Array.isArray(comment.user) ? comment.user[0] : comment.user;

    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.created_at,
      author: {
        id: user?.id ?? null,
        displayName: user?.display_name ?? "MYTHH member",
        avatarUrl: user?.avatar_url ?? null,
      },
    };
  });
}

export async function listMythSources(client: MythhClient, mythId: string) {
  const { data, error } = await client
    .from("sources")
    .select("id, title, url, created_at")
    .eq("myth_id", mythId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new HttpError(502, error.message, "SOURCE_LIST_FAILED");
  }

  return data ?? [];
}

export async function createMyth(
  client: MythhClient,
  input: {
    title: string;
    explanation: string;
    categoryId: string;
    countryCode?: string | null;
    verdict?: "TRUE" | "FALSE" | "PARTIALLY_TRUE" | "UNCERTAIN";
    sources?: { title?: string; url: string }[];
  },
) {
  const { data, error } = await client
    .from("myths")
    .insert({
      title: input.title,
      slug: uniqueSlug(input.title),
      explanation: input.explanation,
      category_id: input.categoryId,
      country_code: input.countryCode ?? null,
      verdict: input.verdict ?? "UNCERTAIN",
    })
    .select("id, slug, status")
    .single();

  if (error || !data) {
    throw new HttpError(
      400,
      error?.message ?? "Unable to submit myth",
      "MYTH_CREATE_FAILED",
    );
  }

  if (input.sources?.length) {
    const { error: sourceError } = await client.from("sources").insert(
      input.sources.map((source) => ({
        myth_id: data.id,
        title: source.title ?? null,
        url: source.url,
      })),
    );

    if (sourceError) {
      throw new HttpError(400, sourceError.message, "SOURCE_CREATE_FAILED");
    }
  }

  return data;
}

export async function listMyMyths(client: MythhClient, userId: string) {
  const { data, error } = await client
    .from("myths")
    .select("id, title, slug, verdict, status, created_at")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(502, error.message, "MY_MYTH_LIST_FAILED");
  }

  return data ?? [];
}

export async function castVote(
  client: MythhClient,
  mythId: string,
  value: VoteValue,
  anonymousId: string | null,
) {
  const { data, error } = await client.rpc("cast_vote", {
    p_myth_id: mythId,
    p_value: value,
    p_anonymous_id: anonymousId,
  });

  if (error) {
    if (error.code === "P0002") {
      throw new HttpError(404, "Myth not found", "MYTH_NOT_FOUND");
    }
    if (error.code === "22023") {
      throw new HttpError(400, "A voting identity is required", "MISSING_VOTE_IDENTITY");
    }
    if (error.code === "23505") {
      throw new HttpError(409, "Already answered", "ALREADY_ANSWERED");
    }
    throw new HttpError(400, error.message, "VOTE_FAILED");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new HttpError(400, "Unable to save vote", "VOTE_FAILED");
  }

  const result = {
    vote: { id: row.vote_id, value: row.vote_value },
    isCorrect: row.is_correct,
    correctAnswer: row.correct_answer === "TRUE" || row.correct_answer === "FALSE" ? row.correct_answer : null,
    alreadyAnswered: row.already_answered,
  };

  return result;
}

export async function claimAnonymousVotes(client: MythhClient, anonymousId: string | null) {
  if (!anonymousId) return 0;
  const { data, error } = await client.rpc("claim_anonymous_votes", {
    p_anonymous_id: anonymousId,
  });
  if (error) {
    throw new HttpError(400, error.message, "VOTE_CLAIM_FAILED");
  }
  return typeof data === "number" ? data : 0;
}

export async function createComment(
  client: MythhClient,
  mythId: string,
  content: string,
) {
  const { data, error } = await client
    .from("comments")
    .insert({ myth_id: mythId, content })
    .select("id, content, created_at")
    .single();

  if (error || !data) {
    throw new HttpError(
      400,
      error?.message ?? "Unable to add comment",
      "COMMENT_CREATE_FAILED",
    );
  }

  return data;
}

export async function createReport(
  client: MythhClient,
  input: {
    target: "MYTH" | "COMMENT";
    mythId: string;
    commentId?: string;
    reason: string;
  },
) {
  const { data, error } = await client
    .from("reports")
    .insert({
      target: input.target,
      myth_id: input.mythId,
      comment_id: input.commentId ?? null,
      reason: input.reason,
    })
    .select("id, target, status, created_at")
    .single();

  if (error || !data) {
    throw new HttpError(
      400,
      error?.message ?? "Unable to submit report",
      "REPORT_CREATE_FAILED",
    );
  }

  return data;
}
