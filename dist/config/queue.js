"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = exports.relayerQueueEvents = exports.relayerQueue = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const redisConnection = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});
exports.redisConnection = redisConnection;
exports.relayerQueue = new bullmq_1.Queue('vote-relayer', {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
    },
});
exports.relayerQueueEvents = new bullmq_1.QueueEvents('vote-relayer', {
    connection: redisConnection,
});
exports.relayerQueueEvents.on('completed', ({ jobId, returnvalue }) => {
    console.info(`[relayer] Job ${jobId} completed successfully`);
});
exports.relayerQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[relayer] Job ${jobId} failed: ${failedReason}`);
});
//# sourceMappingURL=queue.js.map