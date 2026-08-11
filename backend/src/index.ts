import 'dotenv/config';
import { execSync } from 'child_process';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import meetingRoutes from './routes/meetings';
import summaryRoutes from './routes/summaries';
import taskRoutes from './routes/tasks';
import paymentRoutes from './routes/payments';
import documentRoutes from './routes/documents';
import searchRoutes from './routes/search';
import aiRoutes from './routes/ai';
import calendarRoutes from './routes/calendar';
import dashboardRoutes from './routes/dashboard';
import backupRoutes from './routes/backup';

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'יותר מדי ניסיונות התחברות, נסה שוב בעוד 15 דקות' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: { error: 'יותר מדי בקשות, נסה שוב בעוד דקה' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'מגבלת AI הושגה, נסה שוב בעוד דקה' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/', apiLimiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve built frontend (production)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/backup', backupRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(200).json({ ok: true, note: 'Frontend not built yet' });
  });
});

async function bootstrap() {
  try {
    console.log('[STARTUP] Running prisma db push...');
    execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' });
    console.log('[STARTUP] DB schema synced');
  } catch (e) {
    console.error('[STARTUP] prisma db push failed:', e);
  }

  try {
    const { PrismaClient } = await import('@prisma/client');
    const bcrypt = await import('bcryptjs');
    const prisma = new PrismaClient();
    const email = process.env.COACH_EMAIL;
    const password = process.env.COACH_PASSWORD;
    if (email && password) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        const name = process.env.COACH_NAME || 'המאמן';
        const hash = await bcrypt.hash(password, 12);
        await prisma.user.create({ data: { email, password: hash, name, role: 'COACH' } });
        console.log('[STARTUP] Coach user created:', email);
      } else {
        console.log('[STARTUP] Coach user already exists');
      }
    } else {
      console.log('[STARTUP] COACH_EMAIL/COACH_PASSWORD not set, skipping seed');
    }
    await prisma.$disconnect();
  } catch (e) {
    console.error('[STARTUP] Seed failed:', e);
  }

  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

bootstrap();
