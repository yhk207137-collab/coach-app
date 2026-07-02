import { Router } from 'express';
import { getAuthUrl, getTokensFromCode, saveTokens } from '../services/calendar';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();

router.get('/connect', requireAuth, requireCoach, (_, res) => {
  const url = getAuthUrl();
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code');
  try {
    const tokens = await getTokensFromCode(code as string);
    await saveTokens(tokens);
    res.send('<script>window.close();</script><p>Google Calendar connected. You can close this window.</p>');
  } catch {
    res.status(500).send('Failed to connect Google Calendar');
  }
});

export default router;
