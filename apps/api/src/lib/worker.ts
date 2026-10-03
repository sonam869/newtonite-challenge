import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import redis from './redis';
import { NotificationJob } from './queue';

// Use Ethereal (fake SMTP) if no SMTP env vars set — great for development
async function createTransport() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // Ethereal test account for dev
  const account = await nodemailer.createTestAccount();
  console.log('📧 Ethereal SMTP account:', account.user);
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: account.user, pass: account.pass },
  });
}

export async function startWorker() {
  const transport = await createTransport();

  const worker = new Worker<NotificationJob>(
    'notifications',
    async (job) => {
      const { type, workItemTitle, actorName, recipientEmail, payload } = job.data;

      let subject = '';
      let text = '';

      switch (type) {
        case 'work_item_created':
          subject = `[Newtonite] New item: ${workItemTitle}`;
          text = `${actorName} created a new work item: "${workItemTitle}".`;
          break;
        case 'work_item_assigned':
          subject = `[Newtonite] Item assigned to you: ${workItemTitle}`;
          text = `${actorName} assigned "${workItemTitle}" to you.`;
          break;
        case 'work_item_status_changed':
          subject = `[Newtonite] Status changed: ${workItemTitle}`;
          text = `${actorName} changed the status of "${workItemTitle}" from ${payload.from} to ${payload.to}.`;
          break;
        case 'comment_added':
          subject = `[Newtonite] New comment on: ${workItemTitle}`;
          text = `${actorName} commented on "${workItemTitle}": ${payload.body}`;
          break;
      }

      if (recipientEmail) {
        const info = await transport.sendMail({
          from: '"Newtonite" <noreply@newtonite.com>',
          to: recipientEmail,
          subject,
          text,
        });
        // Log Ethereal preview URL in development
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          console.log(`📧 Email preview: ${previewUrl}`);
        }
      }

      console.log(`✉️  Notification processed: ${type} for "${workItemTitle}"`);
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err.message);
  });

  console.log('📬 Notification worker started');
  return worker;
}
