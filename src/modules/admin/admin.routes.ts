import { Router } from "express";
import { z } from "zod";

import type { MythhClient } from "../../database/client.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireAdmin } from "../../middleware/require-admin.js";
import {
  createAdvertisement,
  deleteAdvertisement,
  deleteComment,
  deleteMyth,
  getDashboard,
  listAdvertisements,
  listComments,
  listMythsByStatus,
  listReports,
  listUsers,
  setCommentStatus,
  setMythStatus,
  setReportStatus,
  updateAdvertisement,
  updateMyth,
  updateUser,
} from "./admin.service.js";

export const adminRouter = Router();

adminRouter.use("/admin", ...requireAdmin());

const mythUpdateSchema = z.object({
  title: z.string().trim().min(8).max(200).optional(),
  explanation: z.string().trim().min(20).max(5000).optional(),
  verdict: z.enum(["TRUE", "FALSE", "PARTIALLY_TRUE", "UNCERTAIN"]).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

const userUpdateSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
  })
  .refine((value) => value.status || value.role, {
    message: "status or role is required",
  });

const reportUpdateSchema = z.object({
  status: z.enum(["OPEN", "REVIEWED", "DISMISSED"]),
});

const advertisementSchema = z.object({
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

const advertisementUpdateSchema = advertisementSchema.partial();

function requireClient(req: { supabase?: MythhClient }): MythhClient {
  if (!req.supabase) {
    throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  }

  return req.supabase;
}

adminRouter.get("/admin/dashboard", async (req, res, next) => {
  try {
    const stats = await getDashboard(requireClient(req));
    res.json({ stats, admin: req.profile ?? null });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/myths/pending", async (req, res, next) => {
  try {
    const myths = await listMythsByStatus(requireClient(req), "PENDING");
    res.json({ myths });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/myths/:id/approve", async (req, res, next) => {
  try {
    const myth = await setMythStatus(
      requireClient(req),
      String(req.params.id ?? ""),
      "APPROVED",
    );
    res.json({ myth });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/myths/:id/reject", async (req, res, next) => {
  try {
    const myth = await setMythStatus(
      requireClient(req),
      String(req.params.id ?? ""),
      "REJECTED",
    );
    res.json({ myth });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/myths/:id", async (req, res, next) => {
  try {
    const body = mythUpdateSchema.parse(req.body);
    const myth = await updateMyth(requireClient(req), String(req.params.id ?? ""), {
      ...(body.title ? { title: body.title } : {}),
      ...(body.explanation ? { explanation: body.explanation } : {}),
      ...(body.verdict ? { verdict: body.verdict } : {}),
      ...(body.categoryId ? { categoryId: body.categoryId } : {}),
      ...(body.status ? { status: body.status } : {}),
    });
    res.json({ myth });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/myths/:id", async (req, res, next) => {
  try {
    await deleteMyth(requireClient(req), String(req.params.id ?? ""));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/comments", async (req, res, next) => {
  try {
    const comments = await listComments(requireClient(req));
    res.json({ comments });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/comments/:id", async (req, res, next) => {
  try {
    const body = z
      .object({ status: z.enum(["VISIBLE", "HIDDEN"]) })
      .parse(req.body);
    const comment = await setCommentStatus(
      requireClient(req),
      String(req.params.id ?? ""),
      body.status,
    );
    res.json({ comment });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/comments/:id", async (req, res, next) => {
  try {
    await deleteComment(requireClient(req), String(req.params.id ?? ""));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/reports", async (req, res, next) => {
  try {
    const reports = await listReports(requireClient(req));
    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/reports/:id", async (req, res, next) => {
  try {
    const body = reportUpdateSchema.parse(req.body);
    const report = await setReportStatus(
      requireClient(req),
      String(req.params.id ?? ""),
      body.status,
    );
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/users", async (req, res, next) => {
  try {
    const users = await listUsers(requireClient(req));
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/users/:id/status", async (req, res, next) => {
  try {
    const body = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }).parse(req.body);
    const user = await updateUser(requireClient(req), String(req.params.id ?? ""), {
      status: body.status,
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/users/:id", async (req, res, next) => {
  try {
    const body = userUpdateSchema.parse(req.body);
    const user = await updateUser(requireClient(req), String(req.params.id ?? ""), {
      ...(body.status ? { status: body.status } : {}),
      ...(body.role ? { role: body.role } : {}),
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/advertisements", async (req, res, next) => {
  try {
    const advertisements = await listAdvertisements(requireClient(req));
    res.json({ advertisements });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/admin/advertisements", async (req, res, next) => {
  try {
    const body = advertisementSchema.parse(req.body);
    const advertisement = await createAdvertisement(requireClient(req), {
      title: body.title,
      ...(body.body ? { body: body.body } : {}),
      ...(body.imageUrl ? { imageUrl: body.imageUrl } : {}),
      ...(body.linkUrl ? { linkUrl: body.linkUrl } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.startsAt ? { startsAt: body.startsAt } : {}),
      ...(body.endsAt ? { endsAt: body.endsAt } : {}),
    });
    res.status(201).json({ advertisement });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/admin/advertisements/:id", async (req, res, next) => {
  try {
    const body = advertisementUpdateSchema.parse(req.body);
    const advertisement = await updateAdvertisement(
      requireClient(req),
      String(req.params.id ?? ""),
      {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
        ...(body.linkUrl !== undefined ? { linkUrl: body.linkUrl } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
      },
    );
    res.json({ advertisement });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/advertisements/:id", async (req, res, next) => {
  try {
    await deleteAdvertisement(requireClient(req), String(req.params.id ?? ""));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
