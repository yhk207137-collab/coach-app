import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, Phone, Mail, ChevronLeft } from 'lucide-react';
import api from '../../services/api';
import { Client, ClientStatus } from '../../types';
import toast from 'react-hot-toast';
import ClientModal from './ClientModal';
import clsx from 'clsx';

const statusLabel: Record<ClientStatus, string> = { ACTIVE: 'פעיל', FROZEN: 'מוקפא', ENDED: 'הסתיים' };
const statusClass: Record<ClientStatus, string> = {
  ACTIVE: 'status-active', FROZEN: 'status-frozen', ENDED: 'status-ended',
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('ACTIVE');
  const [showModal, setShowModal] = useState(false);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', statusFilter],
    queryFn: () => api.get(`/clients${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => r.data),
  });

  const filtered = clients.filter(c =>
    c.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.businessName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">לקוחות</h1>
          <p className="page-subtitle">{clients.length} לקוחות</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> לקוח חדש
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input className="input pr-9" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {(['', 'ACTIVE', 'FROZEN', 'ENDED'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx('btn text-sm', statusFilter === s ? 'btn-primary' : 'btn-secondary')}>
            {s === '' ? 'הכל' : statusLabel[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg font-medium">אין לקוחות</p>
            <p className="text-sm mt-1">לחץ על "לקוח חדש" להוספה</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">שם</th>
                <th className="table-header hidden md:table-cell">עסק</th>
                <th className="table-header hidden lg:table-cell">טלפון</th>
                <th className="table-header hidden lg:table-cell">פגישות</th>
                <th className="table-header">סטטוס</th>
                <th className="table-header w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr key={client.id} className="table-row cursor-pointer" onClick={() => navigate(`/clients/${client.id}`)}>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                        {client.fullName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{client.fullName}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />{client.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell hidden md:table-cell">
                    {client.businessName ? (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />{client.businessName}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="table-cell hidden lg:table-cell">
                    {client.phone ? (
                      <span className="flex items-center gap-1 text-slate-600 dir-ltr" dir="ltr">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />{client.phone}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="table-cell hidden lg:table-cell text-slate-600">
                    {client._count?.meetings ?? 0}
                  </td>
                  <td className="table-cell">
                    <span className={statusClass[client.status]}>{statusLabel[client.status]}</span>
                  </td>
                  <td className="table-cell text-slate-400">
                    <ChevronLeft className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <ClientModal onClose={() => setShowModal(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['clients'] }); setShowModal(false); }} />}
    </div>
  );
}
