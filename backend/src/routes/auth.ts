import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/email';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const SESSION_DAYS = 90;
const CODE_TTL_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

type TokenUser = { id: string; email: string; name: string; role: string; clientId?: string | null };

function makeJwt(user: TokenUser) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, clientId: user.clientId },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: `${SESSION_DAYS}d` }
  );
}

function session(user: TokenUser) {
  return {
    token: makeJwt(user),
    user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId },
  };
}

const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const otpKey = (email: string, code: string) => `otp:${email.toLowerCase()}:${code}`;

function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
}

async function sendCodeEmail(to: string, code: string, link: string) {
  await sendEmail(
    to,
    `קוד כניסה: ${code}`,
    `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e293b;">ליוי שיווק ופרסום</h2>
        <p style="color: #475569;">הקוד שלך לכניסה או לאיפוס סיסמה:</p>
        <div style="background:#f1f5f9; border-radius:12px; padding:20px; text-align:center; margin:16px 0;">
          <span style="font-size:36px; font-weight:bold; letter-spacing:8px; color:#6366f1;">${code}</span>
        </div>
        <p style="color:#475569; font-size:14px;">הקוד תקף ל-15 דקות. אם לא ביקשת אותו — אפשר להתעלם מהמייל.</p>
        <hr style="border:none; border-top:1px solid #e2e8f0; margin:20px 0;" />
        <p style="color:#94a3b8; font-size:13px;">או כניסה ישירה בלחיצה:</p>
        <a href="${link}" style="color:#6366f1; font-size:13px;">${link}</a>
      </div>
    `
  );
}

async function consumeCode(email: string, code: string) {
  const record = await prisma.magicToken.findUnique({ where: { token: otpKey(email, code) } });
  if (!record || record.used || record.expiresAt < new Date()) return false;
  await prisma.magicToken.updateMany({ where: { email: record.email, used: false }, data: { used: true } });
  return true;
}

// ── Password login ────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const password = String(req.body.password ?? '');
    if (!email || !password) return res.status(400).json({ error: 'יש להזין מייל וסיסמה' });

    const user = await findUserByEmail(email);
    const valid = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !valid) return res.status(401).json({ error: 'מייל או סיסמה שגויים' });

    res.json(session(user));
  } catch (e) {
    console.error('[AUTH] login error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ── Send login / reset code by email ─────────────────────────────────────────
router.post('/magic', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    if (!email) return res.status(400).json({ error: 'יש להזין מייל' });

    const user = await findUserByEmail(email);
    if (!user) return res.json({ ok: true });

    await prisma.magicToken.updateMany({ where: { email: user.email, used: false }, data: { used: true } });

    const code = crypto.randomInt(100000, 1000000).toString();
    const linkToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await prisma.magicToken.create({ data: { email: user.email, token: linkToken, expiresAt } });
    await prisma.magicToken.create({ data: { email: user.email, token: otpKey(user.email, code), expiresAt } });

    // Railway routes by Host, so the request origin is always one of this service's own domains.
    const frontendUrl = `${req.protocol}://${req.get('host')}`;
    try {
      await sendCodeEmail(user.email, code, `${frontendUrl}/verify?token=${linkToken}`);
      console.log('[AUTH] Code email sent to', user.email);
    } catch (err: any) {
      console.error('[AUTH] SMTP error:', err?.message || err);
      return res.status(503).json({ error: 'לא הצלחנו לשלוח מייל כרגע. נסה שוב בעוד דקה.' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[AUTH] magic error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ── Login with emailed code ──────────────────────────────────────────────────
router.post('/otp/verify', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const code = String(req.body.code ?? '').trim();
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'קוד לא תקין' });

    const user = await findUserByEmail(email);
    if (!user || !(await consumeCode(user.email, code))) {
      return res.status(400).json({ error: 'הקוד שגוי או שפג תוקפו. בקש קוד חדש.' });
    }
    res.json(session(user));
  } catch (e) {
    console.error('[AUTH] otp verify error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ── Login with emailed link ──────────────────────────────────────────────────
router.get('/magic/verify', async (req, res) => {
  try {
    const token = String(req.query.token ?? '');
    if (!token || token.startsWith('otp:')) return res.status(400).json({ error: 'קישור לא תקין' });

    const record = await prisma.magicToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'הקישור פג תוקף או כבר שומש. בקש קישור חדש.' });
    }
    await prisma.magicToken.updateMany({ where: { email: record.email, used: false }, data: { used: true } });

    const user = await findUserByEmail(record.email);
    if (!user) return res.status(404).json({ error: 'משתמש לא נמצא' });
    res.json(session(user));
  } catch (e) {
    console.error('[AUTH] magic verify error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ── Forgot password: emailed code + new password ─────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const code = String(req.body.code ?? '').trim();
    const newPassword = String(req.body.newPassword ?? '');
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'קוד לא תקין' });
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים` });
    }

    const user = await findUserByEmail(email);
    if (!user || !(await consumeCode(user.email, code))) {
      return res.status(400).json({ error: 'הקוד שגוי או שפג תוקפו. בקש קוד חדש.' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    console.log('[AUTH] Password reset via email code:', user.email);
    res.json(session(user));
  } catch (e) {
    console.error('[AUTH] reset-password error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ── Change password (logged in) ──────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים` });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'משתמש לא נמצא' });

    if (user.password) {
      if (!currentPassword) return res.status(400).json({ error: 'הכנס סיסמה נוכחית' });
      const valid = await bcrypt.compare(String(currentPassword), user.password);
      if (!valid) {
        return res.status(400).json({ error: 'הסיסמה הנוכחית שגויה. שכחת? צא מהמערכת ולחץ "שכחתי סיסמה".' });
      }
    }

    const hash = await bcrypt.hash(String(newPassword), 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    res.json({ ok: true });
  } catch (e) {
    console.error('[AUTH] change-password error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ── Current user (also renews the session) ───────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json(session(user));
  } catch (e) {
    console.error('[AUTH] me error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ── Client self-registration ──────────────────────────────────────────────────
router.post('/client/register', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const { password, clientId } = req.body;
    if (!email || !password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `יש להזין מייל וסיסמה של לפחות ${MIN_PASSWORD_LENGTH} תווים` });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const existing = await findUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(String(password), 12);
    const user = await prisma.user.create({
      data: { email, password: hash, name: client.fullName, role: 'CLIENT', clientId },
    });

    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (e) {
    console.error('[AUTH] client register error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
