import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
const audioStorage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => cb(null, `audio-${uuidv4()}${path.extname(file.originalname)}`),
});
const audioUpload = multer({ storage: audioStorage, limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/transcribe', requireAuth, requireCoach, audioUpload.single('audio'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: 'he',
    });

    fs.unlinkSync(req.file.path);

    res.json({ text: transcription.text });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message || 'Transcription failed' });
  }
});

router.post('/summarize', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { transcript, clientName, meetingDate } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript required' });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `אתה עוזר מאמן עסקי מקצועי. להלן תמלול פגישת אימון עסקי עם הלקוח ${clientName || 'הלקוח'} מתאריך ${meetingDate || 'לא ידוע'}.

נתח את התמלול וצור סיכום מקצועי מובנה בעברית עם הסעיפים הבאים:

1. **מטרת הפגישה** - מה היה המוקד המרכזי
2. **התקדמות מהפגישה הקודמת** - מה הושג מאז הפגישה הקודמת
3. **אתגרים** - אתגרים שעלו בשיחה
4. **החלטות** - החלטות שהתקבלו
5. **מסקנות** - תובנות מרכזיות
6. **משימות לביצוע** - רשימת משימות ברורה עם תאריכי יעד אם הוזכרו
7. **הערות נוספות** - כל מה שחשוב לשמור

תמלול:
${transcript}

ענה בפורמט JSON:
{
  "goal": "...",
  "progress": "...",
  "challenges": "...",
  "decisions": "...",
  "conclusions": "...",
  "notes": "...",
  "tasks": [{"title": "...", "description": "...", "dueDate": null}]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Summarization failed' });
  }
});

export default router;
