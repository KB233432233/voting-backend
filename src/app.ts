import express from "express";
import type { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import "dotenv/config";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes.ts";
import { votingRouter } from "./routes/voting.routes.ts";
import { candidateRouter } from "./routes/candidate.routes.ts";
import { pollRouter } from "./routes/poll.routes.ts";
import { userRouter } from "./routes/user.routes.ts";
import { walletRouter } from "./routes/wallet.routes.ts";
import { votingTokenRouter } from "./routes/votingToken.routes.ts";
import { voteRouter } from "./routes/vote.routes.ts";
import { transactionRouter } from "./routes/transaction.routes.ts";
import { tallyResultRouter } from "./routes/tallyResult.routes.ts";
import { startPollCloser } from './workers/pollCloser.ts';
// import { startRelayerWorker } from "./workers/relayer.worker.ts";

// Load environment variables
// dotenv.config();

const app: Application = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Secure HTTP headers
app.use(express.json({ limit: "5mb" })); // Parse JSON bodies (profile avatars are base64 data URLs)
app.use(cookieParser());
// Enable Cross-Origin Resource Sharing
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

// Basic Route for Health Check
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.use("/auth", authRouter);
app.use("/voting", votingRouter);

app.use('/polls', pollRouter);
app.use("/candidates", candidateRouter);
app.use("/users", userRouter);
app.use("/wallets", walletRouter);
app.use("/voting-tokens", votingTokenRouter);
app.use("/votes", voteRouter);
app.use("/transactions", transactionRouter);
app.use("/tally-results", tallyResultRouter);

// Error Handling Middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if ((err as any)?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large. Keep uploaded images under 500KB." });
    return;
  }
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});
startPollCloser();
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

export default app;
