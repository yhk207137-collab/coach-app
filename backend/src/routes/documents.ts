import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') },
  fileFilter: (_, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm',
      'video/mp4', 'video/webm',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post('/upload', requireAuth, requireCoach, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { clientId, summaryId } = req.body;

    const doc = await prisma.document.create({
      data: {
        clientId,
        summaryId: summaryId || undefined,
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
        size: req.file.size,
      },
    });

    res.status(201).json(doc);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/client/:clientId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { clientId } = req.params;
    if (req.user?.role === 'CLIENT' && req.user.clientId !== clientId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const docs = await prisma.document.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const filePath = path.join(uploadDir, path.basename(doc.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
