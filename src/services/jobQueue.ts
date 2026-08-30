import { getRedisClient } from '../handlers/redis';

const QUEUE_KEY = 'airlink:queue:jobs';
const QUEUE_PENDING_KEY = 'airlink:queue:jobs:pending';

export interface Job {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export async function enqueueJob(
  type: string,
  payload: unknown,
): Promise<string> {
  const redis = getRedisClient();
  const id = `${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const job: Job = {
    id,
    type,
    payload,
    createdAt: Date.now(),
    status: 'pending',
  };
  await redis.hset(QUEUE_KEY, id, JSON.stringify(job));
  await redis.zadd(QUEUE_PENDING_KEY, Date.now(), id);
  return id;
}

export async function processNextJob(
  processor: (job: Job) => Promise<unknown>,
): Promise<Job | null> {
  const redis = getRedisClient();
  const result = await redis.zpopmin(QUEUE_PENDING_KEY);
  if (!result || result.length === 0) {
    return null;
  }
  const first = result[0];
  if (!first) {
    return null;
  }
  const id = first[0] as string;
  const raw = await redis.hget(QUEUE_KEY, id);
  if (!raw) {
    return null;
  }
  const job: Job = JSON.parse(raw) as Job;
  job.status = 'processing';
  await redis.hset(QUEUE_KEY, id, JSON.stringify(job));
  try {
    job.result = await processor(job);
    job.status = 'completed';
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
  }
  await redis.hset(QUEUE_KEY, id, JSON.stringify(job));
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  const redis = getRedisClient();
  const raw = await redis.hget(QUEUE_KEY, id);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as Job;
}

export async function removeJob(id: string): Promise<boolean> {
  const redis = getRedisClient();
  await redis.zrem(QUEUE_PENDING_KEY, id);
  const deleted = await redis.hdel(QUEUE_KEY, id);
  return deleted > 0;
}
