import { Router } from 'express';
import { getAuthUrl, getTokensFromCode, saveTokens, isCalendarConnected } from '../services/calendar';
import { requireAuth, requireCoach } from '../middleware/auth';
import crypto from 'crypto';
import { isGmailConnectState, finishGmailConnect } from '../services/gmailInbox';

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

// The callback on this same server. (GOOGLE_REDIRECT_URI once pointed to an old Railway address that no longer exists.)
const callbackUrl = (req: any) => `${req.protocol}://${req.get('host')}/api/calendar/callback`;

router.get('/connect', requireAuth, requireCoach, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(400).json({ error: 'Google OAuth not configured' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.add(state);
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);
  const url = getAuthUrl(state, callbackUrl(req));
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('No code');
  // The Gmail connection for guide requests (marketing) comes back through this same registered address.
  if (state && isGmailConnectState(String(state))) {
    const page = (title: string, text: string) => `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body dir="rtl" style="font-family:Arial;text-align:center;padding:40px 20px"><h2>${title}</h2><p>${text}</p><p><a href="/marketing/tracking" style="display:inline-block;margin-top:12px;padding:12px 22px;border-radius:12px;background:#0A1E3C;color:#fff;text-decoration:none">חזרה למעקב דיוור</a></p></body></html>`;
    try {
      await finishGmailConnect(String(code), String(state), callbackUrl(req));
      return res.send(page('✅ ג׳ימייל חובר', 'מעכשיו המערכת קוראת את בקשות המדריך ושולחת את המדריך אוטומטית.'));
    } catch (err: any) {
      return res.status(400).send(page('החיבור לא הצליח', String(err?.message || 'נסה שוב')));
    }
  }
  if (!state || !pendingStates.has(state as string)) {
    return res.status(403).send('Invalid state');
  }
  pendingStates.delete(state as string);
  try {
    const tokens = await getTokensFromCode(code as string, callbackUrl(req));
    await saveTokens(tokens);
    // The app may be open on the custom domain while Google returns to the Railway host.
    const origins = [...new Set([`${req.protocol}://${req.get('host')}`, process.env.PUBLIC_URL?.replace(/\/$/, '')].filter(Boolean))];
    res.send(`
      <html><body dir="rtl" style="font-family:Arial;text-align:center;padding:40px">
        <h2>✅ יומן גוגל חובר בהצלחה!</h2>
        <p>אפשר לסגור את החלון הזה.</p>
        <script>
          setTimeout(() => {
            if (window.opener) ${JSON.stringify(origins)}.forEach((o) => window.opener.postMessage('google-calendar-connected', o));
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
