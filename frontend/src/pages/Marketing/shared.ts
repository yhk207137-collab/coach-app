import {
  Image as ImageIcon, Type, Heading1, RectangleHorizontal, Minus, MoveVertical, Columns2, Quote, Sparkles,
} from 'lucide-react';

export type Align = 'right' | 'center' | 'left';
export type BlockType = 'logo' | 'heading' | 'text' | 'quote' | 'image' | 'button' | 'divider' | 'spacer' | 'imageText';

export interface Block {
  id: string;
  type: BlockType;
  [key: string]: any;
}

export interface DesignSettings {
  bg: string;
  contentBg: string;
  brand: string;
  textColor: string;
  font: 'arial' | 'heebo';
}

export interface Design {
  settings: DesignSettings;
  blocks: Block[];
}

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'ACTIVE' | 'PAUSED';

export interface CampaignStats {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  failed: number;
  pending: number;
}

export interface Campaign {
  id: string;
  kind: 'BROADCAST' | 'WELCOME';
  name: string;
  subject: string;
  preheader: string | null;
  fromName: string | null;
  markAsAd: boolean;
  design: Design;
  audienceTags: string[];
  status: CampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: CampaignStats;
}

export type ContactStatus = 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED';

export interface Contact {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: ContactStatus;
  source: string | null;
  tags: string[];
  notes: string | null;
  consentAt: string | null;
  consentText: string | null;
  consentPage: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

export interface MarketingSettings {
  senderName: string;
  replyTo: string;
  businessName: string;
  details: string;
  reason: string;
  brand: string;
  logoUrl: string;
}

export interface DomainStatus {
  ready: boolean;
  from: string;
  domain: string;
  reason: 'ok' | 'no-key' | 'no-domain' | 'not-added' | 'not-verified';
}

export interface MediaItem {
  id: string;
  url: string;
  name: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export const CONTACT_STATUS: Record<ContactStatus, { label: string; cls: string }> = {
  SUBSCRIBED: { label: 'רשום', cls: 'bg-emerald-100 text-emerald-700' },
  UNSUBSCRIBED: { label: 'הוסר', cls: 'bg-slate-100 text-slate-500' },
  BOUNCED: { label: 'כתובת שגויה', cls: 'bg-amber-100 text-amber-700' },
  COMPLAINED: { label: 'דיווח ספאם', cls: 'bg-red-100 text-red-600' },
};

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'טיוטה', cls: 'bg-slate-100 text-slate-600' },
  SCHEDULED: { label: 'מתוזמן', cls: 'bg-blue-100 text-blue-700' },
  SENDING: { label: 'בשליחה', cls: 'bg-amber-100 text-amber-700' },
  SENT: { label: 'נשלח', cls: 'bg-emerald-100 text-emerald-700' },
  ACTIVE: { label: 'פעיל', cls: 'bg-emerald-100 text-emerald-700' },
  PAUSED: { label: 'כבוי', cls: 'bg-slate-100 text-slate-500' },
};

let seq = 0;
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export const BLOCKS: { type: BlockType; label: string; icon: any; create: (brand: string) => Block }[] = [
  { type: 'heading', label: 'כותרת', icon: Heading1, create: () => ({ id: newId(), type: 'heading', size: 'lg', align: 'right', html: 'כותרת חדשה' }) },
  { type: 'text', label: 'טקסט', icon: Type, create: () => ({ id: newId(), type: 'text', align: 'right', html: 'כתבו כאן את הטקסט שלכם.' }) },
  { type: 'image', label: 'תמונה', icon: ImageIcon, create: () => ({ id: newId(), type: 'image', src: '', alt: '', width: 100, align: 'center', rounded: true }) },
  { type: 'button', label: 'כפתור', icon: RectangleHorizontal, create: () => ({ id: newId(), type: 'button', text: 'לחצו כאן', url: '', align: 'right', radius: 10 }) },
  { type: 'imageText', label: 'תמונה + טקסט', icon: Columns2, create: () => ({ id: newId(), type: 'imageText', src: '', alt: '', imageSide: 'right', html: '<strong>כותרת קטנה</strong><br>טקסט קצר שמסביר את התמונה.' }) },
  { type: 'quote', label: 'מסגרת הדגשה', icon: Quote, create: () => ({ id: newId(), type: 'quote', html: '<strong>טיפ:</strong> משפט חשוב שרוצים להדגיש.' }) },
  { type: 'divider', label: 'קו מפריד', icon: Minus, create: () => ({ id: newId(), type: 'divider', color: '#e2e8f0', thickness: 1 }) },
  { type: 'spacer', label: 'רווח', icon: MoveVertical, create: () => ({ id: newId(), type: 'spacer', height: 24 }) },
  { type: 'logo', label: 'לוגו', icon: Sparkles, create: () => ({ id: newId(), type: 'logo', src: '', width: 30, align: 'center' }) },
];

export const blockLabel = (type: BlockType) => BLOCKS.find((b) => b.type === type)?.label ?? type;

export const RICH_TYPES: BlockType[] = ['heading', 'text', 'quote', 'imageText'];

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const COLOR_SWATCHES = ['#1e293b', '#475569', '#6d28d9', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#ffffff'];

export const HEADING_SIZES = { xl: 30, lg: 24, md: 20 } as const;
