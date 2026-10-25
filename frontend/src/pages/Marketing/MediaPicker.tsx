import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Upload, Loader2, Trash2, ImagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { MediaItem } from './shared';

const MAX_WIDTH = 1200;

// Large photos make emails slow and spam-prone, so images are downscaled in the browser before upload.
async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number; name: string }> {
  if (file.type === 'image/gif') {
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = URL.createObjectURL(file);
    });
    return { blob: file, width: dims.w, height: dims.h, name: file.name };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const keepPng = file.type === 'image/png';
  if (!keepPng) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  const type = keepPng ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), type, 0.85));
  const name = file.name.replace(/\.[^.]+$/, '') + (keepPng ? '.png' : '.jpg');
  return { blob, width, height, name };
}

export async function uploadImage(file: File): Promise<MediaItem> {
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new Error('אפשר להעלות רק תמונות JPG, PNG, GIF או WEBP');
  const prepared = await prepareImage(file);
  if (prepared.blob.size > 5 * 1024 * 1024) throw new Error('התמונה גדולה מדי (מעל 5MB)');
  const form = new FormData();
  form.append('file', prepared.blob, prepared.name);
  form.append('name', prepared.name);
  form.append('width', String(prepared.width));
  form.append('height', String(prepared.height));
  const { data } = await api.post('/marketing/media', form);
  return data;
}

interface Props {
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
}

export default function MediaPicker({ onClose, onSelect }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { data: items = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ['marketing-media'],
    queryFn: () => api.get('/marketing/media').then((r) => r.data),
  });

  const handleFiles = async (fileList: FileList | null) => {
    // Copy first: clearing the input afterwards empties the live FileList.
    const files = Array.from(fileList || []).slice(0, 10);
    if (files.length === 0) return;
    setUploading(true);
    try {
      let last: MediaItem | null = null;
      for (const file of files) last = await uploadImage(file);
      await qc.invalidateQueries({ queryKey: ['marketing-media'] });
      if (last && files.length === 1) {
        onSelect(last);
        onClose();
      } else {
        toast.success('התמונות הועלו');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'ההעלאה נכשלה');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: MediaItem) => {
    if (!confirm('למחוק את התמונה מהספרייה? מיילים שכבר נשלחו איתה יציגו תמונה שבורה.')) return;
    await api.delete(`/marketing/media/${item.id}`);
    qc.invalidateQueries({ queryKey: ['marketing-media'] });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">בחירת תמונה</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50'}`}
          >
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-medium text-slate-700">גררו תמונה לכאן או לחצו לבחירה</p>
                <p className="text-xs text-slate-400 mt-1">JPG, PNG, GIF · התמונה תוקטן אוטומטית לגודל שמתאים למייל</p>
              </>
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">הספרייה שלי</h3>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : items.length === 0 ? (
              <div className="text-center text-slate-400 py-8 text-sm"><ImagePlus className="w-8 h-8 mx-auto mb-2 opacity-40" />עדיין אין תמונות בספרייה</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {items.map((item) => (
                  <div key={item.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                    <button type="button" onClick={() => { onSelect(item); onClose(); }} className="w-full h-full">
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                    <button type="button" onClick={() => remove(item)} title="מחיקה מהספרייה"
                      className="absolute top-1.5 left-1.5 p-1.5 rounded-lg bg-white/90 text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
