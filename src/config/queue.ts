import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const relayerQueue = new Queue('vote-relayer', {
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

export const relayerQueueEvents = new QueueEvents('vote-relayer', {
  connection: redisConnection,
});

relayerQueueEvents.on('completed', ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
  console.info(`[relayer] Job ${jobId} completed successfully`);
});

relayerQueueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
  console.error(`[relayer] Job ${jobId} failed: ${failedReason}`);
});

export { redisConnection };