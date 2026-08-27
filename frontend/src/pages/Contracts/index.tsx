import { useState, useEffect } from 'react';
import { Plus, FileSignature, Edit2, Trash2, Send, CheckCircle, Clock, XCircle, Eye, Copy, X, Link } from 'lucide-react';
import api from '../../services/api';
import ContractModal from './ContractModal';
import ContractView from './ContractView';
import toast from 'react-hot-toast';

export type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'EXPIRED';

export interface Contract {
  id: string;
  title: string;
  content: string;
  status: ContractStatus;
  signedAt?: string;
  signerName?: string;
  signatureData?: string;
  validUntil?: string;
  createdAt: string;
  client: { id: string; fullName: string; businessName?: string; email: string };
}

const statusLabel: Record<ContractStatus, string> = {
  DRAFT: 'טיוטה', SENT: 'נשלח', SIGNED: 'חתום', EXPIRED: 'פג תוקף',
};

const statusColor: Record<ContractStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  SIGNED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-red-100 text-red-700',
};

const statusIcon: Record<ContractStatus, React.ReactNode> = {
  DRAFT: <Clock className="w-3.5 h-3.5" />,
  SENT: <Send className="w-3.5 h-3.5" />,
  SIGNED: <CheckCircle className="w-3.5 h-3.5" />,
  EXPIRED: <XCircle className="w-3.5 h-3.5" />,
};

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [viewContract, setViewContract] = useState<Contract | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/contracts');
      setContracts(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק חוזה זה?')) return;
    await api.delete(`/contracts/${id}`);
    setContracts(c => c.filter(x => x.id !== id));
  };

  const handleSave = (contract: Contract) => {
    setContracts(prev => {
      const idx = prev.findIndex(c => c.id === contract.id);
      if (idx >= 0) { const a = [...prev]; a[idx] = contract; return a; }
      return [contract, ...prev];
    });
    setShowModal(false);
    setEditContract(null);
  };

  const signLink = (id: string) => `${window.location.origin}/sign-contract/${id}`;

  const [linkModal, setLinkModal] = useState<{ id: string; title: string; clientName: string } | null>(null);

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(signLink(id));
    toast.success('קישור לחתימה הועתק ללוח!');
  };

  if (viewContract) return <ContractView contract={viewContract} onClose={() => { setViewContract(null); load(); }} />;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">חוזים</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contracts.length} חוזים • {contracts.filter(c => c.status === 'SIGNED').length} חתומים</p>
        </div>
        <button
          onClick={() => { setEditContract(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          חוזה חדש
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">טוען...</div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-20">
          <FileSignature className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">אין חוזים עדיין</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {contracts.map(c => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{c.title}</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.status]}`}>
                    {statusIcon[c.status]}
                    {statusLabel[c.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{c.client.fullName}{c.client.businessName ? ` — ${c.client.businessName}` : ''}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                  {c.signedAt && <span>נחתם {new Date(c.signedAt).toLocaleDateString('he-IL')}{c.signerName ? ` ע"י ${c.signerName}` : ''}</span>}
                  {c.validUntil && <span>בתוקף עד {new Date(c.validUntil).toLocaleDateString('he-IL')}</span>}
                  <span>{new Date(c.createdAt).toLocaleDateString('he-IL')}</span>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setViewContract(c)} className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600" title="צפה / הדפס">
                  <Eye className="w-4 h-4" />
                </button>
                {c.status !== 'SIGNED' && (
                  <button onClick={() => setLinkModal({ id: c.id, title: c.title, clientName: c.client.fullName })} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="שלח לחתימה דיגיטלית">
                    <Send className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => { setEditContract(c); setShowModal(true); }} className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ContractModal contract={editContract} onClose={() => { setShowModal(false); setEditContract(null); }} onSave={handleSave} />
      )}

      {/* Send link modal */}
      {linkModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setLinkModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Link className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">שליחת חוזה לחתימה דיגיטלית</h3>
                  <p className="text-sm text-gray-500">{linkModal.clientName} — {linkModal.title}</p>
                </div>
              </div>
              <button onClick={() => setLinkModal(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">קישור לחתימה:</p>
              <p className="text-sm text-blue-700 font-mono break-all">{signLink(linkModal.id)}</p>
            </div>

            <div className="space-y-2 mb-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800">איך שולחים ללקוח?</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-600">
                <li>לחץ "העתק קישור" למטה</li>
                <li>שלח את הקישור ללקוח בוואטסאפ / אימייל / SMS</li>
                <li>הלקוח פותח את הקישור בדפדפן, קורא את החוזה וחותם בעכבר/אצבע</li>
                <li>החוזה יסומן אוטומטית כ"חתום" עם תאריך ושם החותם</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { copyLink(linkModal.id); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium"
              >
                <Copy className="w-4 h-4" /> העתק קישור
              </button>
              <button onClick={() => setLinkModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">סגור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
