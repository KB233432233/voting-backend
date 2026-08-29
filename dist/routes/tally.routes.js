"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tallyRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const tallyEngine_ts_1 = require("../workers/tallyEngine.ts"); // Adjust path if needed
const tallyRouter = (0, express_1.Router)();
exports.tallyRouter = tallyRouter;
/**
 * POST /tally/run
 * Trigger tally calculation for a specific poll
 */
tallyRouter.post("/run", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tally:compute"), async (req, res) => {
    try {
        const { pollId } = req.body;
        if (!pollId || typeof pollId !== "string") {
            res.status(400).json({ error: "Missing or invalid pollId" });
            return;
        }
        const result = await (0, tallyEngine_ts_1.runTally)(pollId);
        res.status(200).json({
            success: true,
            ...result,
        });
    }
    catch (error) {
        console.error("Error running tally:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=tally.routes.js.map