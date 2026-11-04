import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Download, ExternalLink, LayoutGrid, MoreVertical, PlusSquare, Settings, Share, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

type InstallOffer = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

// Chrome makes its offer once, early on, so it is kept from the moment the app loads.
let offer: InstallOffer | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  offer = e as InstallOffer;
  if (location.pathname === '/install') e.preventDefault();
  window.dispatchEvent(new Event('install-offer'));
});

export const runsFromHomeScreen = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

function detectDevice() {
  const ua = navigator.userAgent;
  const iphone = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  return {
    iphone,
    android,
    // Inside WhatsApp, Gmail and the like: the browser menu with the home-screen option isn't there.
    insideApp: /; wv\)|FBAN|FBAV|Instagram|WhatsApp|GSA\/|Line\//.test(ua) || (iphone && !/Safari/.test(ua)),
    otherIphoneBrowser: iphone && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua),
  };
}

// No test here can stand in for the real phone, so each attempt reports what happened on it, with no personal details.
const visit = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const phoneModel: Promise<string | undefined> = (async () => {
  try {
    const details = await (navigator as any).userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    return details ? `${details.model || ''} ${details.platform || ''} ${details.platformVersion || ''}`.trim() : undefined;
  } catch {
    return undefined;
  }
})();
const report = async (step: string, detail?: string) => {
  try {
    await api.post('/public/install-report', { visit, step, detail, model: await phoneModel });
  } catch {
    // A report that doesn't arrive never gets in the way of the page.
  }
};

function Steps({ items }: { items: { icon: any; text: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {items.map(({ icon: Icon, text }, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-primary-50 text-primary-700 text-sm font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
          <span className="flex-1 min-w-0 text-sm text-slate-700 leading-relaxed pt-0.5">{text}</span>
          <Icon className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
        </li>
      ))}
    </ol>
  );
}

function CopyLink({ address, label }: { address: string; label: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה לא הצליחה. אפשר לסמן את הכתובת ולהעתיק אותה ידנית');
    }
  };
  return (
    <div className="rounded-xl bg-slate-50 p-3 space-y-2">
      <p dir="ltr" className="text-xs text-slate-600 text-center break-all select-all">{address}</p>
      <button type="button" onClick={copy} className="btn-secondary w-full justify-center"><Copy className="w-4 h-4" /> {label}</button>
    </div>
  );
}

// The phone's menu can say "installed" while the icon went only to the list of apps, or nowhere, so only a person looking at the screen can tell.
function DidItAppear({ onAnswer }: { onAnswer: (appeared: boolean) => void }) {
  return (
    <div data-icon-question className="border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-800 text-center">הסמל "יהושע כהן" הופיע בטלפון?</p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button type="button" onClick={() => onAnswer(true)} className="btn-primary justify-center">כן</button>
        <button type="button" onClick={() => onAnswer(false)} className="btn-secondary justify-center">לא</button>
      </div>
    </div>
  );
}

const LookInAppList = { icon: LayoutGrid, text: <>מחפשים <strong>"יהושע כהן"</strong> ברשימת כל האפליקציות של הטלפון. אם הוא שם, לוחצים עליו לחיצה ארוכה וגוררים למסך הבית.</> };

function AnotherWay({ iphone, onAppeared }: { iphone: boolean; onAppeared: () => void }) {
  return (
    <div data-another-way className="space-y-4">
      <p className="font-semibold text-slate-800">יש עוד דרך. מנסים לפי הסדר:</p>
      {iphone ? (
        <Steps items={[
          { icon: Share, text: <>בודקים שהדף הזה פתוח ב־<strong>Safari</strong>. בדפדפן אחר האפשרות לפעמים חסרה.</> },
          { icon: PlusSquare, text: <>בתפריט השיתוף גוללים עד הסוף. אם אין שם <strong>"הוספה למסך הבית"</strong>, לוחצים <strong>"עריכת פעולות"</strong> ומוסיפים אותה.</> },
        ]} />
      ) : (
        <Steps items={[
          LookInAppList,
          { icon: MoreVertical, text: <>אם הוא לא שם: ב־Chrome לוחצים על שלוש הנקודות, <strong>"הוספה למסך הבית"</strong>, ובחלון בוחרים <strong>קיצור דרך</strong> ולא התקנה. קיצור דרך לא מתקין כלום, ולכן הוא יכול לעבוד גם כשהטלפון חוסם התקנות.</> },
          { icon: Settings, text: <>אם עדיין אין סמל: בהגדרות הטלפון נכנסים לאפליקציות, ל־Chrome, ומאשרים לו <strong>קיצורי דרך במסך הבית</strong>. בשיאומי זה נמצא תחת "הרשאות נוספות". אחר כך מנסים שוב.</> },
        ]} />
      )}
      <button type="button" onClick={onAppeared} className="btn-primary w-full justify-center">עכשיו הסמל הופיע</button>
      <p data-report-sent className="text-xs text-slate-500">סוג הטלפון ומה שקרה בו נשלחו אוטומטית, כדי שאפשר יהיה לבדוק מה חוסם. אין צורך לתאר שום דבר.</p>
    </div>
  );
}

type Stage = 'ready' | 'adding' | 'appeared' | 'did-not-appear';

// The link for putting the software on the phone's home screen. It needs no login and suits itself to the phone.
export default function Install() {
  const [device] = useState(detectDevice);
  const [fromHomeScreen, setFromHomeScreen] = useState(runsFromHomeScreen);
  const [canOffer, setCanOffer] = useState(!!offer);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [stage, setStage] = useState<Stage>('ready');
  const address = `${location.origin}/install`;
  const onPhone = device.android || device.iphone;

  useEffect(() => {
    const onOffer = () => { setCanOffer(!!offer); report('offer'); };
    // Chrome says this when the install starts, not when the icon lands, so it proves nothing yet.
    const onInstalled = () => { offer = null; setCanOffer(false); setStage((s) => (s === 'ready' ? 'adding' : s)); report('installed'); };
    const display = window.matchMedia('(display-mode: standalone)');
    const onDisplay = () => setFromHomeScreen(runsFromHomeScreen());
    window.addEventListener('install-offer', onOffer);
    window.addEventListener('appinstalled', onInstalled);
    display.addEventListener('change', onDisplay);
    report('opened', runsFromHomeScreen() ? 'from the home screen' : offer ? 'offer waiting' : undefined);
    // An earlier try may have worked, with the icon only in the list of apps. Then Chrome stops offering, and only this can tell.
    (navigator as any).getInstalledRelatedApps?.().then((apps: unknown[]) => {
      if (!apps?.length) return;
      setAlreadyInstalled(true);
      report('already-installed');
    }).catch(() => {});
    return () => {
      window.removeEventListener('install-offer', onOffer);
      window.removeEventListener('appinstalled', onInstalled);
      display.removeEventListener('change', onDisplay);
    };
  }, []);

  const addNow = async () => {
    if (!offer) return;
    const current = offer;
    report('tapped');
    try {
      await current.prompt();
      const { outcome } = await current.userChoice;
      report(outcome);
      if (outcome === 'accepted') setStage('adding');
    } catch (e: any) {
      report('prompt-failed', String(e?.message ?? e));
      setStage('did-not-appear');
    }
    // Chrome gives each offer one use.
    offer = null;
    setCanOffer(false);
  };

  const answer = (appeared: boolean) => {
    report(appeared ? 'icon-yes' : 'icon-no');
    setStage(appeared ? 'appeared' : 'did-not-appear');
  };

  const browser = device.iphone ? 'Safari' : 'Chrome';
  const addButton = canOffer && !device.insideApp && (
    <button type="button" onClick={addNow} className="btn-primary w-full justify-center py-3">
      <Download className="w-5 h-5" /> {device.android ? 'הוספה למסך הבית' : 'התקנה במחשב'}
    </button>
  );

  let body: React.ReactNode;
  if (fromHomeScreen || stage === 'appeared') {
    body = (
      <div className="text-center space-y-3">
        <span className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto"><Check className="w-6 h-6" /></span>
        <p className="font-semibold text-slate-800">{fromHomeScreen ? 'התוכנה כבר פתוחה מהסמל במסך הבית' : 'מעולה, התוכנה בטלפון'}</p>
      </div>
    );
  } else if (stage === 'did-not-appear') {
    body = <AnotherWay iphone={device.iphone} onAppeared={() => answer(true)} />;
  } else if (stage === 'adding') {
    body = onPhone ? (
      <div className="space-y-4">
        <p className="font-semibold text-slate-800">הטלפון מוסיף עכשיו את הסמל</p>
        <p className="text-sm text-slate-600">זה יכול לקחת עד דקה. מחפשים את "יהושע כהן" במסך הבית, וגם ברשימת כל האפליקציות של הטלפון.</p>
        <DidItAppear onAnswer={answer} />
      </div>
    ) : (
      <p className="font-semibold text-slate-800 text-center">התוכנה הותקנה במחשב</p>
    );
  } else if (device.insideApp) {
    body = (
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-slate-800">הקישור נפתח בתוך אפליקציה אחרת</p>
          <p className="text-sm text-slate-600 mt-1">מתוך וואטסאפ או מייל אי אפשר להוסיף למסך הבית. צריך לפתוח את הקישור ב־{browser}.</p>
        </div>
        {device.android && (
          <a href={`intent://${location.host}/install#Intent;scheme=https;package=com.android.chrome;end`} className="btn-primary w-full justify-center py-3">
            <ExternalLink className="w-5 h-5" /> פתיחה ב־Chrome
          </a>
        )}
        <CopyLink address={address} label="העתקת הקישור" />
        <p className="text-xs text-slate-500">אחרי ההעתקה פותחים את {browser} ומדביקים בשורת הכתובת.</p>
      </div>
    );
  } else if (alreadyInstalled) {
    body = (
      <div data-already-installed className="space-y-4">
        <p className="font-semibold text-slate-800">התוכנה כבר מותקנת בטלפון הזה</p>
        <Steps items={[LookInAppList]} />
        <DidItAppear onAnswer={answer} />
      </div>
    );
  } else if (device.iphone) {
    body = (
      <div className="space-y-4">
        {device.otherIphoneBrowser && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">באייפון הדרך הבטוחה היא דרך Safari. מעתיקים את הקישור ופותחים אותו שם.</p>
            <CopyLink address={address} label="העתקת הקישור" />
          </div>
        )}
        <p className="text-sm text-slate-600">באייפון אין כפתור שמוריד. מוסיפים את הסמל בשלושה צעדים:</p>
        <Steps items={[
          { icon: Share, text: <>לוחצים על <strong>כפתור השיתוף</strong> של Safari, הריבוע עם החץ למעלה.</> },
          { icon: PlusSquare, text: <>גוללים למטה ובוחרים <strong>"הוספה למסך הבית"</strong>.</> },
          { icon: Check, text: <>לוחצים <strong>"הוספה"</strong> בפינה העליונה.</> },
        ]} />
        <p className="text-xs text-slate-500">בפעם הראשונה שנכנסים מהסמל צריך להתחבר, כי באייפון הסמל נפרד מ־Safari.</p>
        <DidItAppear onAnswer={answer} />
      </div>
    );
  } else if (device.android) {
    body = (
      <div className="space-y-4">
        {addButton}
        {canOffer && <p className="text-sm text-slate-500 text-center">אם הכפתור לא עובד, אפשר גם ידנית:</p>}
        <Steps items={[
          { icon: MoreVertical, text: <>ב־Chrome לוחצים על <strong>שלוש הנקודות</strong> בפינה העליונה.</> },
          { icon: PlusSquare, text: <>בוחרים <strong>"הוספה למסך הבית"</strong> או <strong>"התקנת האפליקציה"</strong>.</> },
          { icon: Check, text: <>לוחצים <strong>"התקנה"</strong> או <strong>"הוספה"</strong>.</> },
        ]} />
        <DidItAppear onAnswer={answer} />
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">פותחים את הקישור הזה בטלפון, והדף יראה בדיוק מה ללחוץ:</p>
        <CopyLink address={address} label="העתקת הקישור" />
        {addButton}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-brand flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full">
        <div className="text-center mb-5">
          <img src="/brand/mark.png" alt="יהושע כהן" className="h-12 w-auto mx-auto mb-3" />
          <h1 className="text-xl font-bold text-navy-900 flex items-center justify-center gap-2"><Smartphone className="w-5 h-5 text-slate-400" /> התוכנה במסך הבית</h1>
          <p className="text-sm text-slate-500 mt-1">סמל קבוע בטלפון, שפותח את התוכנה כמו אפליקציה</p>
        </div>
        {body}
        <Link to="/" className="block text-center text-sm text-primary-600 hover:underline mt-5">לכניסה לתוכנה</Link>
      </div>
    </div>
  );
}
