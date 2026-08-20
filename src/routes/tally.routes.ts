import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/requirePermission.ts";
import { runTally } from "../workers/tallyEngine.ts"; // Adjust path if needed

const tallyRouter = Router();

/**
 * POST /tally/run
 * Trigger tally calculation for a specific poll
 */
tallyRouter.post(
  "/run", 
  requireAuth, 
  requirePermission("tally:compute"), 
  async (req, res) => {
    try {
      const { pollId } = req.body;

      if (!pollId || typeof pollId !== "string") {
        res.status(400).json({ error: "Missing or invalid pollId" });
        return;
      }

      const result = await runTally(pollId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error("Error running tally:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { tallyRouter };