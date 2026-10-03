import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import teamsRouter from './routes/teams';
import workItemsRouter from './routes/workItems';
import { startWorker } from './lib/worker';

const app = express();
const server = http.createServer(app);

// ─── Socket.io ───────────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Clients join a room per work item to receive targeted updates
  socket.on('join:work-item', (workItemId: string) => {
    socket.join(workItemId);
  });
  socket.on('leave:work-item', (workItemId: string) => {
    socket.leave(workItemId);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Make io available to route handlers
app.set('io', io);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/teams', teamsRouter);
app.use('/work-items', workItemsRouter);

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  // Don't leak stack traces in production
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000');

async function start() {
  try {
    await startWorker();
  } catch (err) {
    console.warn('⚠️  Notification worker failed to start (Redis may be unavailable):', (err as Error).message);
  }

  server.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
  });
}

start();

export { app, server, io };
