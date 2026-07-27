import { Router } from 'express';
import { getAuthUrl, getTokensFromCode, saveTokens } from '../services/calendar';
import { requireAuth, requireCoach } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();
const pendingStates = new Set<string>();

router.get('/connect', requireAuth, requireCoach, (_, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.add(state);
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000); // expire after 10min
  const url = getAuthUrl(state);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('No code');
  if (!state || !pendingStates.has(state as string)) {
    return res.status(403).send('Invalid state — possible CSRF attempt');
  }
  pendingStates.delete(state as string);
  try {
    const tokens = await getTokensFromCode(code as string);
    await saveTokens(tokens);
    res.send('<script>window.close();</script><p>Google Calendar connected. You can close this window.</p>');
  } catch {
    res.status(500).send('Failed to connect Google Calendar');
  }
});

export default router;
