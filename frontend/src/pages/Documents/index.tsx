import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Upload, FolderOpen, Trash2, FileText, Image, Table, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { Client, Document } from '../../types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image className="w-5 h-5 text-purple-500" />;
  if (mime.includes('excel') || mime.includes('spreadsheet')) return <Table className="w-5 h-5 text-emerald-500" />;
  return <FileText className="w-5 h-5 text-blue-500" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedClient, setSelectedClient] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then(r => r.data),
  });

  const { data: docs = [], isLoading } = useQuery<Document[]>({
    queryKey: ['documents', selectedClient],
    queryFn: () => api.get(`/documents/client/${selectedClient}`).then(r => r.data),
    enabled: !!selectedClient,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedClient) return;
    const file = e.target.files[0];
    const form = new FormData();
    form.append('file', file);
    form.append('clientId', selectedClient);
    setUploading(true);
    try {
      await api.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: ['documents', selectedClient] });
      toast.success('קובץ הועלה');
    } catch { toast.error('שגיאה בהעלאה'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm('למחוק מסמך זה?')) return;
    try {
      await api.delete(`/documents/${id}`);
      qc.invalidateQueries({ queryKey: ['documents', selectedClient] });
      toast.success('מסמך נמחק');
    } catch { toast.error('שגיאה'); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">מסמכים</h1>
          <p className="page-subtitle">קבצים ומסמכים ללקוחות</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <select className="input max-w-xs" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
          <option value="">בחר לקוח...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
        </select>

        {selectedClient && (
          <label className={`btn-primary cursor-pointer ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            העלה קובץ
            <input type="file" className="sr-only" onChange={handleUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp" />
          </label>
        )}
      </div>

      {!selectedClient ? (
        <div className="card text-center py-16 text-slate-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>בחר לקוח לצפייה במסמכים</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : docs.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין מסמכים ללקוח זה</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">שם הקובץ</th>
                <th className="table-header hidden md:table-cell">גודל</th>
                <th className="table-header">תאריך</th>
                <th className="table-header w-8" />
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc.id} className="table-row">
                  <td className="table-cell">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary-600 transition-colors">
                      <FileIcon mime={doc.mimeType} />
                      <span className="font-medium">{doc.name}</span>
                    </a>
                  </td>
                  <td className="table-cell hidden md:table-cell text-slate-500">{formatBytes(doc.size)}</td>
                  <td className="table-cell text-slate-500">{format(new Date(doc.createdAt), 'd/M/yyyy')}</td>
                  <td className="table-cell">
                    <button onClick={() => deleteDoc(doc.id)} className="btn-ghost p-1.5 text-slate-300 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
