"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
require("dotenv/config");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_routes_ts_1 = require("./routes/auth.routes.ts");
const voting_routes_ts_1 = require("./routes/voting.routes.ts");
const candidate_routes_ts_1 = require("./routes/candidate.routes.ts");
const poll_routes_ts_1 = require("./routes/poll.routes.ts");
const user_routes_ts_1 = require("./routes/user.routes.ts");
const wallet_routes_ts_1 = require("./routes/wallet.routes.ts");
const votingToken_routes_ts_1 = require("./routes/votingToken.routes.ts");
const vote_routes_ts_1 = require("./routes/vote.routes.ts");
const transaction_routes_ts_1 = require("./routes/transaction.routes.ts");
const tallyResult_routes_ts_1 = require("./routes/tallyResult.routes.ts");
const pollCloser_ts_1 = require("./workers/pollCloser.ts");
const Applications_routes_ts_1 = require("./routes/Applications.routes.ts");
// import { startRelayerWorker } from "./workers/relayer.worker.ts";
// Load environment variables
// dotenv.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, helmet_1.default)()); // Secure HTTP headers
app.use(express_1.default.json({ limit: "5mb" })); // Parse JSON bodies (profile avatars are base64 data URLs)
app.use((0, cookie_parser_1.default)());
// Enable Cross-Origin Resource Sharing
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));
// Basic Route for Health Check
app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});
app.use("/auth", auth_routes_ts_1.authRouter);
app.use("/voting", voting_routes_ts_1.votingRouter);
app.use('/polls', poll_routes_ts_1.pollRouter);
app.use("/candidates", candidate_routes_ts_1.candidateRouter);
app.use("/users", user_routes_ts_1.userRouter);
app.use("/wallets", wallet_routes_ts_1.walletRouter);
app.use("/voting-tokens", votingToken_routes_ts_1.votingTokenRouter);
app.use("/votes", vote_routes_ts_1.voteRouter);
app.use("/transactions", transaction_routes_ts_1.transactionRouter);
app.use("/tally-results", tallyResult_routes_ts_1.tallyResultRouter);
app.use("/applications", Applications_routes_ts_1.applicationRouter);
// Error Handling Middleware
app.use((err, req, res, next) => {
    if (err?.type === "entity.too.large") {
        res.status(413).json({ error: "Request body too large. Keep uploaded images under 500KB." });
        return;
    }
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});
(0, pollCloser_ts_1.startPollCloser)();
// Start the relayer worker (broadcasts queued votes to the chain).
// A misconfigured RELAYER_PRIVATE_KEY must not prevent the API from booting.
// try {
//   void startRelayerWorker().catch((err: Error) => {
//     console.error(`[relayer] Failed to start relayer worker: ${err.message}`);
//   });
// } catch (err: any) {
//   console.error(`[relayer] Failed to start relayer worker: ${err?.message}`);
// }
// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
exports.default = app;
//# sourceMappingURL=app.js.map