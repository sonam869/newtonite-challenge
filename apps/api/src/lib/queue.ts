import { Queue } from 'bullmq';
import redis from './redis';

export interface NotificationJob {
  type: 'work_item_created' | 'work_item_assigned' | 'work_item_status_changed' | 'comment_added';
  workItemId: string;
  workItemTitle: string;
  actorName: string;
  recipientEmail?: string;
  payload: Record<string, unknown>;
}

export const notificationQueue = new Queue<NotificationJob>('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export async function enqueueNotification(job: NotificationJob): Promise<void> {
  // If Redis is not connected / ready, log simulated notification and don't block
  if (redis.status !== 'ready') {
    console.log(`[Simulated Notification Worker] Enqueued ${job.type} for "${job.workItemTitle}"`);
    return;
  }
  try {
    await notificationQueue.add(job.type, job);
  } catch (err) {
    // Non-fatal — main operation already succeeded
    console.warn('Failed to enqueue notification:', err);
  }
}
