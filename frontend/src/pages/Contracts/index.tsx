import { useState, useEffect } from 'react';
import { Plus, FileSignature, Edit2, Trash2, Send, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';
import api from '../../services/api';
import ContractModal from './ContractModal';
import ContractView from './ContractView';

export type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'EXPIRED';

export interface Contract {
  id: string;
  title: string;
  content: string;
  status: ContractStatus;
  signedAt?: string;
  signerName?: string;
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

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(signLink(id));
    alert('קישור לחתימה הועתק!');
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
                  <button onClick={() => copyLink(c.id)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="העתק קישור לחתימה">
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
    </div>
  );
}
