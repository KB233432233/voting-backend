"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTally = runTally;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const snowflake_ts_1 = require("../utils/snowflake.ts");
const voteEncryption_ts_1 = require("../utils/voteEncryption.ts");
/**
 * Run Instant Runoff Voting (IRV/RCV) tally for a specific poll
 *
 * IRV Algorithm:
 * 1. Count first-preference votes for each candidate
 * 2. If a candidate has >50% votes, they win
 * 3. If no winner, eliminate the candidate with lowest votes
 * 4. Redistribute votes from eliminated candidate to next preferences
 * 5. Repeat until a winner is found
 *
 * Tie-breaking: Lowest candidate ID wins (survives elimination)
 *
 * @param pollID - The poll ID as string
 * @returns TallyResult with winners and round details
 */
async function runTally(pollID) {
    // Array to store results of each IRV round
    const rounds = [];
    // Convert pollID to BigInt for Prisma query
    const pollId = BigInt(pollID);
    // Fetch all revealed votes for this poll, ordered by vote timestamp (oldest first)
    // This ensures deterministic tallying when votes are tied
    const revealedVotes = await db_ts_1.default.revealedVote.findMany({
        where: { pollId },
        select: {
            id: true, // Vote ID
            rankings: true, // Encrypted rankings (base64 string)
            vote: {
                select: {
                    castedAt: true, // Timestamp when vote was cast
                },
            },
        },
        orderBy: {
            vote: {
                castedAt: "asc", // Order by vote timestamp ascending
            },
        },
    });
    // Handle edge case: No votes to tally
    if (revealedVotes.length === 0) {
        const result = { winnerIds: [], rounds: [] };
        // Update poll status and create empty tally result in a transaction
        await db_ts_1.default.$transaction(async (tx) => {
            // Mark poll as tallied
            await tx.poll.update({
                where: { id: pollId },
                data: { status: "tallied" },
            });
            // Create tally result with empty winners and rounds
            await tx.tallyResult.create({
                data: {
                    id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(), // Generate unique snowflake ID
                    pollId, // Link to poll
                    resultsData: { winners: [], rounds: [] }, // Empty results (cast to any for Prisma Json)
                    totalVotes: 0, // No votes
                },
            });
        });
        return result;
    }
    // Fetch all candidates for this poll
    const candidates = await db_ts_1.default.candidate.findMany({
        where: { pollId },
        select: { id: true, name: true },
        orderBy: { id: "asc" }, // Deterministic ordering by ID
    });
    // Edge case: No candidates exist (should not happen in normal flow)
    if (candidates.length === 0) {
        throw new Error("No candidates found for poll");
    }
    // Calculate majority threshold: need >50% to win
    // Example: 5 votes -> need 3 votes to win (floor(5/2) + 1)
    const threshold = Math.floor(revealedVotes.length / 2) + 1;
    // Set of active candidate IDs (those not yet eliminated)
    // Using Set for efficient lookup and deletion
    const activeCandidateIds = new Set(candidates.map((c) => c.id.toString()));
    // Decrypt and convert rankings from database format to usable ballot format
    const ballots = revealedVotes.map((v) => {
        // Decrypt returns object: { candidateId: BigInt, rank: number }[]
        const rankingsRaw = (0, voteEncryption_ts_1.decryptRankings)(v.rankings);
        return {
            voteId: v.id, // Unique vote ID
            rankings: rankingsRaw, // Sorted list of preferences
        };
    });
    // IRV round counter
    let roundNumber = 0;
    // Array to store winning candidate IDs
    let winners = [];
    // Main IRV loop: continue until we find a winner or no candidates left
    while (activeCandidateIds.size > 0) {
        roundNumber++;
        // Initialize vote counts for all active candidates
        const counts = {};
        // Set all active candidates to 0 votes initially
        for (const cid of activeCandidateIds) {
            counts[cid] = 0;
        }
        // Count first-preference votes for each active candidate
        for (const ballot of ballots) {
            for (const candidateId of ballot.rankings) {
                // Only count if this candidate is still active (not eliminated)
                if (activeCandidateIds.has(candidateId.toString())) {
                    const cidStr = candidateId.toString();
                    counts[cidStr] = (counts[cidStr] || 0) + 1;
                    // Stop at first valid preference (ballot is sorted by rank)
                    break;
                }
            }
        }
        // Check if any candidate has majority (>50%) votes
        let roundWinner = null;
        for (const [cid, count] of Object.entries(counts)) {
            if (count >= threshold) {
                roundWinner = cid;
                break;
            }
        }
        // Edge case: Only one candidate left, they win by default
        if (!roundWinner && activeCandidateIds.size === 1) {
            roundWinner = Array.from(activeCandidateIds)[0];
        }
        // Record this round's results
        rounds.push({
            round: roundNumber,
            counts,
            eliminated: null,
            winner: roundWinner,
        });
        // If we found a winner, add to winners array and exit loop
        if (roundWinner) {
            winners.push(roundWinner);
            break;
        }
        // Find the minimum vote count (for elimination)
        let minCount = Infinity;
        for (const count of Object.values(counts)) {
            if (count < minCount) {
                minCount = count;
            }
        }
        // Get all candidates with the minimum count (tie for elimination)
        const lowestCandidates = Object.entries(counts)
            .filter(([, count]) => count === minCount)
            .map(([id]) => id)
            .sort((a, b) => a.localeCompare(b)); // Sort by ID for deterministic tie-breaking
        // Tie-breaking rule: Highest ID is eliminated, lowest ID survives
        // This ensures "lowest ID wins" as required
        const toEliminate = lowestCandidates[lowestCandidates.length - 1];
        if (!toEliminate) {
            throw new Error("Unexpected error: no candidate to eliminate");
        }
        // Remove eliminated candidate from active set
        activeCandidateIds.delete(toEliminate);
        // Update the last round to record which candidate was eliminated
        rounds[rounds.length - 1].eliminated = toEliminate;
        // Safety check: if no candidates left, exit loop
        if (activeCandidateIds.size === 0) {
            break;
        }
    }
    // Save final results to database in a transaction
    await db_ts_1.default.$transaction(async (tx) => {
        // Update poll status to tallied
        await tx.poll.update({
            where: { id: pollId },
            data: { status: "tallied" },
        });
        // Create tally result record with winners and round details
        await tx.tallyResult.create({
            data: {
                id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(), // Unique ID for tally result
                pollId, // Link to poll
                resultsData: {
                    winners, // Array of winner IDs
                    rounds: rounds.map((r) => ({
                        round: r.round, // Round number
                        counts: r.counts, // Vote counts per candidate
                        eliminated: r.eliminated, // Eliminated candidate ID
                        winner: r.winner, // Winner ID (if any)
                    })),
                }, // Cast to any for Prisma Json type compatibility
                totalVotes: revealedVotes.length, // Total number of votes counted
            },
        });
    });
    // Return tally result with winners and round details
    return { winnerIds: winners, rounds };
}
//# sourceMappingURL=tallyEngine.js.map