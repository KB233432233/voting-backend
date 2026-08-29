import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";


const applicationRouter = Router();

import { createApplication, getApplications, deleteApplication } from "../controllers/orgApplication.controller.ts";

applicationRouter.post("/", createApplication);
applicationRouter.get("/", getApplications);
applicationRouter.delete("/:id", requireAuth, deleteApplication);

export { applicationRouter };