import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import api from '../../services/api';
import type { Contract } from './index';

export default function SignContract() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    api.get(`/contracts/sign/${id}`)
      .then(r => { setContract(r.data); if (r.data.status === 'SIGNED') setSigned(true); })
      .catch(() => setError('החוזה לא נמצא או שפג תוקפו.'))
      .finally(() => setLoading(false));
  }, [id]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    const ctx = canvas.getContext('2d')!;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e1b4b';
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => { drawing.current = false; };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSign = async () => {
    if (!hasDrawn || !signerName.trim()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL('image/png');
    setSaving(true);
    try {
      await api.post(`/contracts/sign/${id}`, { signatureData, signerName: signerName.trim() });
      setSigned(true);
    } catch {
      setError('שגיאה בשמירת החתימה, נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">טוען...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;
  if (!contract) return null;

  if (signed) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50" dir="rtl">
      <div className="text-center p-8">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">החוזה נחתם בהצלחה!</h1>
        <p className="text-gray-500">תודה, {contract.signerName || signerName}. החוזה נשמר במערכת.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)' }} className="px-6 py-5 text-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-lg font-bold">ליוי שיווק ופרסום</div>
          <div className="text-purple-200 text-sm">חתימה דיגיטלית על חוזה</div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">{contract.title}</h1>
          <p className="text-sm text-gray-500 mb-6">לקוח: {contract.client.fullName}</p>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-7 border-t border-gray-100 pt-6">
            {contract.content}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">חתימה</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא *</label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="הכנס שם מלא"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">חתימה (שרטט בתוך הריבוע) *</label>
              <button onClick={clearSignature} className="text-xs text-gray-400 hover:text-red-500">נקה</button>
            </div>
            <canvas
              ref={canvasRef}
              width={600}
              height={150}
              className="w-full border-2 border-gray-200 rounded-xl cursor-crosshair touch-none bg-gray-50"
              style={{ touchAction: 'none' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <button
            onClick={handleSign}
            disabled={saving || !hasDrawn || !signerName.trim()}
            className="w-full mt-4 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {saving ? 'שומר חתימה...' : 'חתום על החוזה'}
          </button>

          <p className="text-xs text-gray-400 mt-3 text-center">
            על ידי לחיצה על הכפתור, אתה מאשר את תנאי החוזה ומסכים לחתימה דיגיטלית מחייבת.
          </p>
        </div>
      </div>
    </div>
  );
}
