import fs from 'fs';
import path from 'path';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
