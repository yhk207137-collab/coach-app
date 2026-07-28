import { Router } from 'express';
import { getAuthUrl, getTokensFromCode, saveTokens, isCalendarConnected } from '../services/calendar';
import { requireAuth, requireCoach } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();
const pendingStates = new Set<string>();

router.get('/status', requireAuth, requireCoach, async (_req, res) => {
  try {
    const connected = await isCalendarConnected();
    res.json({ connected });
  } catch {
    res.json({ connected: false });
  }
});

router.get('/connect', requireAuth, requireCoach, (_, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(400).json({ error: 'Google OAuth not configured' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.add(state);
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);
  const url = getAuthUrl(state);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('No code');
  if (!state || !pendingStates.has(state as string)) {
    return res.status(403).send('Invalid state');
  }
  pendingStates.delete(state as string);
  try {
    const tokens = await getTokensFromCode(code as string);
    await saveTokens(tokens);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.send(`
      <html><body dir="rtl" style="font-family:Arial;text-align:center;padding:40px">
        <h2>✅ יומן גוגל חובר בהצלחה!</h2>
        <p>אפשר לסגור את החלון הזה.</p>
        <script>
          setTimeout(() => {
            window.opener && window.opener.postMessage('google-calendar-connected', '${frontendUrl}');
            window.close();
          }, 1500);
        </script>
      </body></html>
    `);
  } catch (err: any) {
    res.status(500).send('Failed to connect: ' + err.message);
  }
});

export default router;
