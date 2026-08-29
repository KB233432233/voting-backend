import { Router } from "express";
import { requireAuth } from "../middleware/auth";


const applicationRouter = Router();

import { createApplication, getApplications, deleteApplication } from "../controllers/orgApplication.controller";

applicationRouter.post("/", createApplication);
applicationRouter.get("/", getApplications);
applicationRouter.delete("/:id", requireAuth, deleteApplication);

export { applicationRouter };