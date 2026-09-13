import type { MythhClient } from "../../database/client.js";
import type {
  CommentStatus,
  MythStatus,
  MythVerdict,
  ReportStatus,
  UserRole,
  UserStatus,
} from "../../database/types.js";
import { HttpError } from "../../middleware/error-handler.js";

async function countRows(
  client: MythhClient,
  table:
    | "myths"
    | "comments"
    | "reports"
    | "profiles"
    | "advertisements"
    | "votes",
  column?: string,
  value?: string,
) {
  let query = client.from(table).select("id", { count: "exact", head: true });

  if (column && value) {
    query = query.eq(column, value);
  }

  const { count, error } = await query;

  if (error) {
    throw new HttpError(502, error.message, "ADMIN_COUNT_FAILED");
  }

  return count ?? 0;
}

export async function getDashboard(client: MythhClient) {
  const [
    pendingMyths,
    approvedMyths,
    rejectedMyths,
    comments,
    openReports,
    users,
    ads,
    votes,
  ] = await Promise.all([
    countRows(client, "myths", "status", "PENDING"),
    countRows(client, "myths", "status", "APPROVED"),
    countRows(client, "myths", "status", "REJECTED"),
    countRows(client, "comments"),
    countRows(client, "reports", "status", "OPEN"),
    countRows(client, "profiles"),
    countRows(client, "advertisements"),
    countRows(client, "votes"),
  ]);

  return {
    myths: {
      pending: pendingMyths,
      approved: approvedMyths,
      rejected: rejectedMyths,
    },
    comments,
    openReports,
    users,
    advertisements: ads,
    votes,
  };
}

export async function listMythsByStatus(client: MythhClient, status: MythStatus) {
  const { data, error } = await client
    .from("myths")
    .select(
      "id, title, slug, verdict, explanation, status, created_at, category:categories(id, name, slug), creator:profiles(id, display_name, email)",
    )
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(502, error.message, "ADMIN_MYTH_LIST_FAILED");
  }

  return data ?? [];
}

export async function setMythStatus(
  client: MythhClient,
  id: string,
  status: Exclude<MythStatus, "PENDING">,
) {
  const { data, error } = await client
    .from("myths")
    .update({ status })
    .eq("id", id)
    .select("id, slug, status")
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_MYTH_STATUS_FAILED");
  }

  if (!data) {
    throw new HttpError(404, "Myth not found", "MYTH_NOT_FOUND");
  }

  return data;
}

export async function updateMyth(
  client: MythhClient,
  id: string,
  input: {
    title?: string;
    explanation?: string;
    verdict?: MythVerdict;
    categoryId?: string;
    status?: MythStatus;
  },
) {
  const { data, error } = await client
    .from("myths")
    .update({
      ...(input.title ? { title: input.title } : {}),
      ...(input.explanation ? { explanation: input.explanation } : {}),
      ...(input.verdict ? { verdict: input.verdict } : {}),
      ...(input.categoryId ? { category_id: input.categoryId } : {}),
      ...(input.status ? { status: input.status } : {}),
    })
    .eq("id", id)
    .select("id, slug, status, title, verdict")
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_MYTH_UPDATE_FAILED");
  }

  if (!data) {
    throw new HttpError(404, "Myth not found", "MYTH_NOT_FOUND");
  }

  return data;
}

export async function deleteMyth(client: MythhClient, id: string) {
  const { error } = await client.from("myths").delete().eq("id", id);

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_MYTH_DELETE_FAILED");
  }
}

export async function listComments(client: MythhClient) {
  const { data, error } = await client
    .from("comments")
    .select(
      "id, content, status, created_at, myth_id, user:profiles(id, display_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new HttpError(502, error.message, "ADMIN_COMMENT_LIST_FAILED");
  }

  return data ?? [];
}

export async function setCommentStatus(
  client: MythhClient,
  id: string,
  status: CommentStatus,
) {
  const { data, error } = await client
    .from("comments")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_COMMENT_UPDATE_FAILED");
  }

  if (!data) {
    throw new HttpError(404, "Comment not found", "COMMENT_NOT_FOUND");
  }

  return data;
}

export async function deleteComment(client: MythhClient, id: string) {
  const { error } = await client.from("comments").delete().eq("id", id);

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_COMMENT_DELETE_FAILED");
  }
}

export async function listReports(client: MythhClient) {
  const { data, error } = await client
    .from("reports")
    .select(
      "id, target, reason, status, myth_id, comment_id, created_at, reporter:profiles(id, display_name, email)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(502, error.message, "ADMIN_REPORT_LIST_FAILED");
  }

  return data ?? [];
}

export async function setReportStatus(
  client: MythhClient,
  id: string,
  status: ReportStatus,
) {
  const { data, error } = await client
    .from("reports")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_REPORT_UPDATE_FAILED");
  }

  if (!data) {
    throw new HttpError(404, "Report not found", "REPORT_NOT_FOUND");
  }

  return data;
}

export async function listUsers(client: MythhClient) {
  const { data, error } = await client
    .from("profiles")
    .select("id, email, display_name, avatar_url, role, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(502, error.message, "ADMIN_USER_LIST_FAILED");
  }

  return data ?? [];
}

export async function updateUser(
  client: MythhClient,
  id: string,
  input: { status?: UserStatus; role?: UserRole },
) {
  const { data, error } = await client
    .from("profiles")
    .update({
      ...(input.status ? { status: input.status } : {}),
      ...(input.role ? { role: input.role } : {}),
    })
    .eq("id", id)
    .select("id, email, role, status")
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_USER_UPDATE_FAILED");
  }

  if (!data) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }

  return data;
}

export async function listAdvertisements(client: MythhClient) {
  const { data, error } = await client
    .from("advertisements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(502, error.message, "ADMIN_AD_LIST_FAILED");
  }

  return data ?? [];
}

export async function createAdvertisement(
  client: MythhClient,
  input: {
    title: string;
    body?: string;
    imageUrl?: string;
    linkUrl?: string;
    isActive?: boolean;
    startsAt?: string;
    endsAt?: string;
  },
) {
  const { data, error } = await client
    .from("advertisements")
    .insert({
      title: input.title,
      body: input.body ?? null,
      image_url: input.imageUrl ?? null,
      link_url: input.linkUrl ?? null,
      is_active: input.isActive ?? false,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(
      400,
      error?.message ?? "Unable to create advertisement",
      "ADMIN_AD_CREATE_FAILED",
    );
  }

  return data;
}

export async function updateAdvertisement(
  client: MythhClient,
  id: string,
  input: {
    title?: string;
    body?: string | null;
    imageUrl?: string | null;
    linkUrl?: string | null;
    isActive?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
  },
) {
  const { data, error } = await client
    .from("advertisements")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.imageUrl !== undefined ? { image_url: input.imageUrl } : {}),
      ...(input.linkUrl !== undefined ? { link_url: input.linkUrl } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_AD_UPDATE_FAILED");
  }

  if (!data) {
    throw new HttpError(404, "Advertisement not found", "AD_NOT_FOUND");
  }

  return data;
}

export async function deleteAdvertisement(client: MythhClient, id: string) {
  const { error } = await client.from("advertisements").delete().eq("id", id);

  if (error) {
    throw new HttpError(400, error.message, "ADMIN_AD_DELETE_FAILED");
  }
}
