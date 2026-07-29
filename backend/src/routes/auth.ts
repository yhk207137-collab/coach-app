import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function makeJwt(user: { id: string; email: string; role: string; clientId?: string | null }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, clientId: user.clientId },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
  );
}

// ── Password login ────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({
      token: makeJwt(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Magic link — send ─────────────────────────────────────────────────────────
router.post('/magic', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether the email exists
      return res.json({ ok: true });
    }

    // Invalidate old unused tokens for this email
    await prisma.magicToken.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Generate a short 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store both token and OTP (OTP stored as the note field via token prefix)
    await prisma.magicToken.create({ data: { email, token: rawToken, expiresAt } });
    // Also store OTP as a separate token for code-based login
    await prisma.magicToken.create({ data: { email, token: `otp:${otp}`, expiresAt } });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${frontendUrl}/verify?token=${rawToken}`;

    // Try to send email (best-effort)
    if (process.env.SMTP_PASS) {
      const emailHtml = `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b;">כניסה למערכת ליוי שיווק ופרסום</h2>
          <p style="color: #475569;">השתמש בקוד הזה להתחברות:</p>
          <div style="background:#f1f5f9; border-radius:12px; padding:20px; text-align:center; margin:16px 0;">
            <span style="font-size:36px; font-weight:bold; letter-spacing:8px; color:#6366f1;">${otp}</span>
          </div>
          <p style="color:#475569; font-size:14px;">הקוד תקף ל-15 דקות.</p>
          <hr style="border:none; border-top:1px solid #e2e8f0; margin:20px 0;" />
          <p style="color:#94a3b8; font-size:13px;">או לחץ על הקישור לכניסה ישירה:</p>
          <a href="${link}" style="color:#6366f1; font-size:13px;">${link}</a>
        </div>
      `;
      try {
        const smtpPort = parseInt(process.env.SMTP_PORT || '587');
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.resend.com',
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: process.env.SMTP_USER || 'resend', pass: process.env.SMTP_PASS },
        });
        await transport.sendMail({
          from: `"${process.env.FROM_NAME || 'ליוי שיווק ופרסום'}" <${process.env.FROM_EMAIL || 'onboarding@resend.dev'}>`,
          to: email,
          subject: `קוד כניסה: ${otp}`,
          html: emailHtml,
        });
        console.log('[AUTH] Email sent to', email);
      } catch (emailErr: any) {
        console.error('[AUTH] SMTP error:', emailErr?.message || emailErr);
      }
    }
    console.log(`[AUTH] OTP for ${email}: ${otp}`);

    // Return OTP to frontend so user can enter it directly (no email needed)
    res.json({ ok: true, otp });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Magic link — verify ───────────────────────────────────────────────────────
router.get('/magic/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const record = await prisma.magicToken.findUnique({ where: { token: token as string } });

    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(401).json({ error: 'הקישור פג תוקף או כבר שומש. בקש קישור חדש.' });
    }

    // Mark used
    await prisma.magicToken.update({ where: { id: record.id }, data: { used: true } });

    const user = await prisma.user.findUnique({ where: { email: record.email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      token: makeJwt(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Change password ───────────────────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 4 תווים' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'משתמש לא נמצא' });

    // If user already has a password, verify current one
    if (user.password) {
      if (!currentPassword) return res.status(400).json({ error: 'הכנס סיסמה נוכחית' });
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: 'הסיסמה הנוכחית שגויה' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user!.id }, data: { password: hash } });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Current user ──────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, clientId: true },
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Client self-registration ──────────────────────────────────────────────────
router.post('/client/register', async (req, res) => {
  try {
    const { email, password, clientId } = req.body;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hash, name: client.fullName, role: 'CLIENT', clientId },
    });

    res.json({ id: user.id, email: user.email, name: user.name });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
