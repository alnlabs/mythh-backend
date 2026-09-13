import { Router } from "express";

import { createAnonClient } from "../../database/client.js";
import { HttpError } from "../../middleware/error-handler.js";
import { listApprovedMyths } from "../myths/myth.service.js";

export const categoryRouter = Router();

categoryRouter.get("/categories", async (_req, res, next) => {
  try {
    const { data, error } = await createAnonClient()
      .from("categories")
      .select("id, name, slug, description")
      .order("name", { ascending: true });

    if (error) {
      throw new HttpError(502, error.message, "CATEGORY_LIST_FAILED");
    }

    res.json({ categories: data ?? [] });
  } catch (error) {
    next(error);
  }
});

categoryRouter.get("/categories/:slug", async (req, res, next) => {
  try {
    const { data, error } = await createAnonClient()
      .from("categories")
      .select("id, name, slug, description")
      .eq("slug", String(req.params.slug ?? ""))
      .maybeSingle();

    if (error) {
      throw new HttpError(502, error.message, "CATEGORY_LOOKUP_FAILED");
    }

    if (!data) {
      throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }

    const myths = await listApprovedMyths(createAnonClient(), {
      limit: 200,
      categorySlug: data.slug,
    });

    res.json({ category: data, myths });
  } catch (error) {
    next(error);
  }
});
