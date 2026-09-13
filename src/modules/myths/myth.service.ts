import { HttpError } from "../../middleware/error-handler.js";
import type { MythhClient } from "../../database/client.js";
import type { VoteValue } from "../../database/types.js";
import { uniqueSlug } from "../../utils/slug.js";
import { presentMyth, type MythRow } from "./myth.presenter.js";

const mythSelect = `
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
  creator:profiles(id, display_name, avatar_url),
  sources(id, title, url)
`;

async function loadStats(client: MythhClient, mythIds: string[]) {
  if (mythIds.length === 0) {
    return {
      votesByMyth: new Map<string, VoteValue[]>(),
      commentsByMyth: new Map<string, number>(),
    };
  }

  const [{ data: votes, error: voteError }, { data: comments, error: commentError }] =
    await Promise.all([
      client.from("votes").select("myth_id, value").in("myth_id", mythIds),
      client.from("comments").select("myth_id").eq("status", "VISIBLE").in("myth_id", mythIds),
    ]);

  if (voteError) {
    throw new HttpError(502, voteError.message, "VOTE_STATS_FAILED");
  }

  if (commentError) {
    throw new HttpError(502, commentError.message, "COMMENT_STATS_FAILED");
  }

  const votesByMyth = new Map<string, VoteValue[]>();
  const commentsByMyth = new Map<string, number>();

  for (const vote of votes ?? []) {
    const current = votesByMyth.get(vote.myth_id) ?? [];
    current.push(vote.value);
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

export async function listApprovedMyths(
  client: MythhClient,
  options: { limit: number; categorySlug?: string; q?: string; country?: string },
) {
  let query = client
    .from("myths")
    .select(mythSelect)
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
  const { votesByMyth, commentsByMyth } = await loadStats(
    client,
    myths.map((myth) => myth.id),
  );

  return myths.map((myth) =>
    presentMyth(
      myth,
      votesByMyth.get(myth.id) ?? [],
      commentsByMyth.get(myth.id) ?? 0,
    ),
  );
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeSearch(value: string) {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function getMyth(client: MythhClient, idOrSlug: string) {
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
  const { votesByMyth, commentsByMyth } = await loadStats(client, [myth.id]);

  return presentMyth(
    myth,
    votesByMyth.get(myth.id) ?? [],
    commentsByMyth.get(myth.id) ?? 0,
  );
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

export async function upsertVote(
  client: MythhClient,
  userId: string,
  mythId: string,
  value: VoteValue,
) {
  const { data, error } = await client
    .from("votes")
    .upsert(
      { myth_id: mythId, user_id: userId, value },
      { onConflict: "myth_id,user_id" },
    )
    .select("id, value")
    .single();

  if (error || !data) {
    throw new HttpError(
      400,
      error?.message ?? "Unable to save vote",
      "VOTE_FAILED",
    );
  }

  return data;
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
