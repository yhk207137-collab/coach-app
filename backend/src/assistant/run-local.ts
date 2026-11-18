// Runs the assistant on its own, on the owner's computer (trial stage).
// Started by personal-assistant/start.ps1, which also starts its local database.
import express from 'express';
import { mountAssistant } from './index';

const app = express();
const port = Number(process.env.ASSISTANT_PORT || 4790);
mountAssistant(app, { localChat: true });
app.listen(port, '127.0.0.1', () => console.log(`[ASSISTANT] ready: http://localhost:${port}/`));
