import { useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import type { Contract } from './index';

interface Props {
  contract: Contract;
  onClose: () => void;
}

export default function ContractView({ contract, onClose }: Props) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const today = new Date().toLocaleDateString('he-IL');

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col" dir="rtl">
      <div className="print:hidden flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm">
            <X className="w-4 h-4" /> חזרה
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-600 font-medium">{contract.title}</span>
          {contract.status === 'SIGNED' && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ חתום</span>
          )}
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium">
          <Printer className="w-4 h-4" /> הדפס / שמור PDF
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-8 px-4 flex justify-center">
        <div className="bg-white shadow-xl w-full max-w-3xl rounded-2xl print:rounded-none print:shadow-none" style={{ fontFamily: "'Segoe UI', 'Arial Hebrew', Arial, sans-serif" }}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)' }} className="rounded-t-2xl print:rounded-none px-10 py-8 text-white">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-2xl font-bold">ליוי שיווק ופרסום</div>
                <div className="text-purple-200 text-sm mt-1">סוכנות שיווק ופרסום לעמותות</div>
              </div>
              <div className="text-left">
                <div className="text-xs text-purple-300 uppercase tracking-widest">חוזה</div>
                <div className="text-sm font-semibold mt-1">{today}</div>
              </div>
            </div>
          </div>

          <div className="px-10 py-5 border-b border-gray-100 grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs text-gray-400 mb-1">לקוח</div>
              <div className="font-semibold text-gray-800">{contract.client.fullName}</div>
              {contract.client.businessName && <div className="text-gray-500">{contract.client.businessName}</div>}
            </div>
            {contract.validUntil && (
              <div>
                <div className="text-xs text-gray-400 mb-1">בתוקף עד</div>
                <div className="font-semibold text-gray-800">{new Date(contract.validUntil).toLocaleDateString('he-IL')}</div>
              </div>
            )}
          </div>

          <div className="px-10 pt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{contract.title}</h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-7">{contract.content}</div>
          </div>

          {contract.status === 'SIGNED' && contract.signatureData ? (
            <div className="px-10 mt-8 pt-6 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-xs text-gray-400 mb-2">חתימת נותן השירות</div>
                  <div className="h-16 border-b-2 border-gray-300 flex items-end pb-1">
                    <span className="text-gray-500 text-sm italic">ליוי שיווק ופרסום</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-2">חתימת מקבל השירות</div>
                  <img src={contract.signatureData} alt="חתימה" className="h-16 object-contain border-b-2 border-gray-300 w-full" />
                  {contract.signerName && <div className="text-xs text-gray-500 mt-1">{contract.signerName}</div>}
                  {contract.signedAt && <div className="text-xs text-gray-400">{new Date(contract.signedAt).toLocaleString('he-IL')}</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-10 mt-8 pt-6 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-xs text-gray-400 mb-2">חתימת נותן השירות</div>
                  <div className="h-16 border-b-2 border-gray-300" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-2">חתימת מקבל השירות</div>
                  <div className="h-16 border-b-2 border-gray-300" />
                </div>
              </div>
            </div>
          )}

          <div className="px-10 py-8 mt-4 text-center border-t border-gray-100">
            <div className="text-xs text-gray-400">ליוי שיווק ופרסום • סוכנות שיווק ופרסום לעמותות</div>
          </div>
        </div>
      </div>
    </div>
  );
}
