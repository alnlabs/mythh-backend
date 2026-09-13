import { Router } from "express";

import { adminRouter } from "../modules/admin/admin.routes.js";
import { advertisementRouter } from "../modules/advertisements/advertisement.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { categoryRouter } from "../modules/categories/category.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { mythRouter } from "../modules/myths/myth.routes.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(categoryRouter);
apiRouter.use(mythRouter);
apiRouter.use(advertisementRouter);
apiRouter.use(adminRouter);
