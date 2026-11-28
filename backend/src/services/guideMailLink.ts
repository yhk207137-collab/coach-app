// The "get the guide by email" mailto button. No imports, so the email renderer can use it too.
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// The consent is in the subject: every mail program fills the subject from the button, while some
// (kosher mail, some phone apps) drop the prefilled body. Sending this subject is the consent.
export const GUIDE_MAIL_SUBJECT = 'בקשה לקבלת המדריך ועדכונים במייל';
// Buttons sent before the consent moved into the subject; still handled, consent taken from the body.
export const GUIDE_MAIL_SUBJECT_OLD = 'בקשה לקבלת המדריך לעמותה מנצחת';
// The words both share, for the Gmail search.
export const GUIDE_MAIL_SEARCH = 'בקשה לקבלת המדריך';
export const GUIDE_MAIL_CONSENT = 'ומאשר/ת קבלת עדכונים במייל. אפשר להסיר בכל עת.';
// Shown right under the button, so the person knows what sending means before they send.
export const GUIDE_MAIL_NOTICE = 'בשליחת המייל אני מאשר/ת לקבל את המדריך ועדכונים במייל. אפשר להסיר בכל עת.';
export const GUIDE_MAIL_LABEL = 'טופל – מדריך';
export const GUIDE_MAIL_BUTTON = 'אין לך דפדפן? קבל את המדריך במייל';

const mailBody = () => `שלום, אני מבקש/ת לקבל את המדריך לעמותה מנצחת ${GUIDE_MAIL_CONSENT}\r\n\r\nשמי: `;

export function guideMailto(to: string, code?: string | null) {
  const subject = code ? `${GUIDE_MAIL_SUBJECT} [${code}]` : GUIDE_MAIL_SUBJECT;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody())}`;
}

// What a reader of the plain-text version (or a client that drops buttons) needs to do it by hand.
export function guideMailText(to: string, code?: string | null) {
  const subject = code ? `${GUIDE_MAIL_SUBJECT} [${code}]` : GUIDE_MAIL_SUBJECT;
  return `אין לך דפדפן? אפשר לקבל את המדריך במייל: שלחו מייל אל ${to} עם הנושא "${subject}", ותקבלו את המדריך בתשובה. בשליחת המייל עם הנושא הזה אתם מאשרים לקבל את המדריך ועדכונים במייל. אפשר להסיר בכל עת.`;
}

// A button that works in every mail program: a table cell with inline styles, no CSS classes or scripts.
export function guideMailButtonHtml(to: string, code?: string | null, opts: { bg?: string; color?: string; align?: 'right' | 'center' | 'left'; label?: string } = {}) {
  const bg = /^#[0-9a-f]{6}$/i.test(opts.bg || '') ? opts.bg! : '#0A1E3C';
  const fg = /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color! : '#5CE1E6';
  const align = opts.align || 'center';
  const href = esc(guideMailto(to, code));
  const label = esc(opts.label || GUIDE_MAIL_BUTTON);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" dir="rtl" style="margin:0 auto;"><tr><td align="center" bgcolor="${bg}" style="border-radius:10px;background:${bg};">` +
    `<a href="${href}" style="display:block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;line-height:1.3;color:${fg};text-decoration:none;border-radius:10px;">${label}</a>` +
    `</td></tr></table>` +
    `<p dir="rtl" style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#64748b;text-align:${align};">לחיצה תפתח מייל מוכן. רק לשלוח, והמדריך יגיע אליך בתשובה.<br>${esc(GUIDE_MAIL_NOTICE)}</p>`;
}

