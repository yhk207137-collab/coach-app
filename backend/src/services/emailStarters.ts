let seq = 0;
const id = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface StarterOptions {
  brand: string;
  logoUrl?: string | null;
  senderName: string;
  businessName: string;
}

const settings = (o: StarterOptions) => ({
  bg: '#f1f5f9', contentBg: '#ffffff', brand: o.brand, textColor: '#1e293b', font: 'arial',
});

const logo = (o: StarterOptions) =>
  o.logoUrl ? [{ id: id(), type: 'logo', src: o.logoUrl, width: 30, align: 'center', alt: o.businessName }] : [];

const signature = (o: StarterOptions) => ({
  id: id(), type: 'text', align: 'right',
  html: `בהצלחה,<br><strong>${o.senderName}</strong><br>${o.businessName}`,
});

export const STARTERS = {
  newsletter: {
    label: 'ניוזלטר שבועי',
    build: (o: StarterOptions) => ({
      settings: settings(o),
      blocks: [
        ...logo(o),
        { id: id(), type: 'heading', size: 'xl', align: 'center', color: o.brand, html: 'המדריך לעמותה מנצחת' },
        { id: id(), type: 'text', align: 'center', color: '#64748b', fontSize: 14, html: 'גיליון שבועי · תוכן וכלים לשיווק, פרסום וגיוס כספים' },
        { id: id(), type: 'divider', color: '#e2e8f0', thickness: 1 },
        { id: id(), type: 'text', align: 'right', html: 'שלום {{שם}},<br><br>כאן כותבים פתיחה קצרה ואישית: מה קרה השבוע, ולמה כדאי להמשיך לקרוא.' },
        { id: id(), type: 'image', src: '', alt: '', width: 100, rounded: true, align: 'center' },
        { id: id(), type: 'heading', size: 'md', align: 'right', html: 'הכלי של השבוע' },
        { id: id(), type: 'text', align: 'right', html: 'הסבר קצר וברור על הכלי: מה הוא עושה, למי הוא מתאים, ואיך מתחילים איתו כבר היום.' },
        { id: id(), type: 'button', text: 'לקריאה המלאה', url: '', align: 'right', radius: 10 },
        { id: id(), type: 'quote', html: '<strong>טיפ קצר:</strong> משפט אחד שמנהל עמותה יכול ליישם עוד היום.' },
        signature(o),
      ],
    }),
  },
  announcement: {
    label: 'הכרזה / אירוע',
    build: (o: StarterOptions) => ({
      settings: settings(o),
      blocks: [
        ...logo(o),
        { id: id(), type: 'image', src: '', alt: '', width: 100, rounded: true, align: 'center' },
        { id: id(), type: 'heading', size: 'xl', align: 'center', html: 'כותרת חזקה שמסבירה מה קורה' },
        { id: id(), type: 'text', align: 'center', html: '{{שם}}, שתי שורות שמסבירות למה זה חשוב לך ומה יוצא לך מזה.' },
        { id: id(), type: 'button', text: 'אני רוצה להצטרף', url: '', align: 'center', radius: 12, fullWidth: false },
        { id: id(), type: 'spacer', height: 8 },
        { id: id(), type: 'text', align: 'center', color: '#64748b', fontSize: 14, html: 'מספר המקומות מוגבל · פרטים נוספים בתשובה למייל' },
      ],
    }),
  },
  personal: {
    label: 'מייל אישי',
    build: (o: StarterOptions) => ({
      settings: { ...settings(o), bg: '#ffffff' },
      blocks: [
        { id: id(), type: 'text', align: 'right', html: 'שלום {{שם}},<br><br>מייל אישי וקצר, בלי עיצוב מיוחד, שנראה כמו מכתב ממך.<br><br>אפשר לשאול שאלה ולבקש מהקוראים להשיב ישירות למייל.' },
        signature(o),
      ],
    }),
  },
  blank: {
    label: 'ריק',
    build: (o: StarterOptions) => ({ settings: settings(o), blocks: [...logo(o)] }),
  },
} as const;

export type StarterKey = keyof typeof STARTERS;

export const welcomeDesign = (o: StarterOptions) => ({
  settings: settings(o),
  blocks: [
    ...logo(o),
    { id: id(), type: 'heading', size: 'xl', align: 'center', color: o.brand, html: 'ברוכים הבאים למדריך לעמותה מנצחת!' },
    { id: id(), type: 'text', align: 'right', html: 'שלום {{שם}},<br><br>תודה שהצטרפת. מעכשיו, פעם בשבוע, יגיע אליך מייל קצר עם תוכן וכלים אמיתיים לשיווק, פרסום וגיוס כספים לעמותה.' },
    { id: id(), type: 'quote', html: '<strong>טיפ קטן:</strong> כדי שהמיילים לא ייפלו לספאם, כדאי להשיב למייל הזה במילה אחת או להוסיף אותי לאנשי הקשר.' },
    { id: id(), type: 'text', align: 'right', html: 'יש נושא שהכי בוער לך עכשיו בעמותה? אפשר פשוט להשיב למייל הזה. אני קורא כל תשובה.' },
    signature(o),
  ],
});
