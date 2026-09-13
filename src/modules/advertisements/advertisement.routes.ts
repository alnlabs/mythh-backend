import { Router } from "express";

import { createAnonClient } from "../../database/client.js";
import { HttpError } from "../../middleware/error-handler.js";

export const advertisementRouter = Router();

advertisementRouter.get("/advertisements", async (_req, res, next) => {
  try {
    const { data, error } = await createAnonClient()
      .from("advertisements")
      .select("id, title, body, image_url, link_url")
      .eq("is_active", true);

    if (error) {
      throw new HttpError(502, error.message, "AD_LIST_FAILED");
    }

    res.json({
      advertisements: (data ?? []).map((ad) => ({
        id: ad.id,
        title: ad.title,
        body: ad.body,
        imageUrl: ad.image_url,
        linkUrl: ad.link_url,
      })),
    });
  } catch (error) {
    next(error);
  }
});
