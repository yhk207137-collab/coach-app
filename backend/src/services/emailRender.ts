import sanitizeHtml from 'sanitize-html';

export interface MergeData {
  name?: string | null;
  email?: string;
}

export interface FooterInfo {
  businessName: string;
  address?: string;
  details: string;
  reason: string;
}

export interface RenderContext {
  merge: MergeData;
  footer: FooterInfo;
  unsubscribeUrl: string;
  trackLink?: (url: string) => string;
  openPixelUrl?: string;
  preheader?: string | null;
  title?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function safeUrl(u: unknown): string | null {
  const s = String(u ?? '').trim();
  if (!s) return null;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null;
}

function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || '';

export function applyMerge(text: string, merge: MergeData) {
  return text
    .replace(/\{\{\s*שם_מלא\s*\}\}/g, (merge.name || '').trim())
    .replace(/\{\{\s*שם\s*\}\}/g, firstName(merge.name))
    .replace(/\{\{\s*מייל\s*\}\}/g, merge.email || '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[,\s]+/, '');
}

function cleanRichText(html: string, linkColor: string, trackLink?: (u: string) => string) {
  return sanitizeHtml(html || '', {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'a', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li'],
    allowedAttributes: { a: ['href', 'style', 'target'], '*': ['style'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,6}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
        'text-align': [/^(right|left|center|justify)$/],
        'font-weight': [/^(bold|[1-9]00)$/],
        'font-style': [/^italic$/],
        'text-decoration': [/^underline$/],
      },
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = safeUrl(attribs.href);
        return {
          tagName,
          attribs: {
            href: href ? (trackLink && /^https?:/i.test(href) ? trackLink(href) : href) : '#',
            target: '_blank',
            style: `color:${linkColor};text-decoration:underline;`,
          },
        };
      },
      p: () => ({ tagName: 'p', attribs: { style: 'margin:0 0 12px 0;' } }),
      ul: () => ({ tagName: 'ul', attribs: { style: 'margin:0 0 12px 0;padding:0 22px 0 0;' } }),
      ol: () => ({ tagName: 'ol', attribs: { style: 'margin:0 0 12px 0;padding:0 22px 0 0;' } }),
      li: () => ({ tagName: 'li', attribs: { style: 'margin:0 0 6px 0;' } }),
    },
  });
}

const htmlToText = (html: string) =>
  sanitizeHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderEmail(design: any, ctx: RenderContext): RenderedEmail {
  const s = design?.settings || {};
  const bg = color(s.bg, '#f1f5f9');
  const contentBg = color(s.contentBg, '#ffffff');
  const brand = color(s.brand, '#6d28d9');
  const textColor = color(s.textColor, '#1e293b');
  const font = s.font === 'heebo' ? "'Heebo', Arial, Helvetica, sans-serif" : 'Arial, Helvetica, sans-serif';
  const WIDTH = 600;
  const PAD = 32;
  const inner = WIDTH - PAD * 2;
  const link = (u: string) => (ctx.trackLink && /^https?:/i.test(u) ? ctx.trackLink(u) : u);
  const merge = (t: string) => applyMerge(t, ctx.merge);

  const rows: string[] = [];
  const textParts: string[] = [];
  const blocks: any[] = Array.isArray(design?.blocks) ? design.blocks : [];

  const cell = (content: string, padTop = 12, padBottom = 12, align = 'right') =>
    `<tr><td align="${align}" style="padding:${padTop}px ${PAD}px ${padBottom}px ${PAD}px;">${content}</td></tr>`;

  const imageTag = (b: any, maxWidth: number) => {
    const src = safeUrl(b.src);
    if (!src) return '';
    const pct = num(b.width, 100, 20, 100);
    const w = Math.round((maxWidth * pct) / 100);
    const radius = b.rounded ? 'border-radius:12px;' : '';
    let img = `<img src="${esc(src)}" width="${w}" alt="${esc(merge(b.alt || ''))}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;${radius}">`;
    const href = safeUrl(b.link);
    if (href) img = `<a href="${esc(link(href))}" target="_blank" style="text-decoration:none;">${img}</a>`;
    return img;
  };

  for (const b of blocks) {
    const align = oneOf(b.align, ['right', 'center', 'left'] as const, 'right');
    switch (b.type) {
      case 'logo': {
        const img = imageTag({ ...b, width: b.width ?? 35 }, inner);
        if (img) rows.push(cell(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}"><tr><td>${img}</td></tr></table>`, 24, 8, align));
        break;
      }
      case 'heading': {
        const size = { xl: 30, lg: 24, md: 20 }[oneOf(b.size, ['xl', 'lg', 'md'] as const, 'lg')];
        const c = color(b.color, textColor);
        const html = cleanRichText(merge(b.html || ''), brand, ctx.trackLink);
        rows.push(cell(`<h${size >= 28 ? 1 : 2} style="margin:0;font-family:${font};font-size:${size}px;line-height:1.3;font-weight:700;color:${c};text-align:${align};">${html}</h${size >= 28 ? 1 : 2}>`, 16, 4, align));
        textParts.push(htmlToText(html).toUpperCase());
        break;
      }
      case 'text': {
        const size = num(b.fontSize, 16, 12, 22);
        const c = color(b.color, textColor);
        const html = cleanRichText(merge(b.html || ''), brand, ctx.trackLink);
        rows.push(cell(`<div style="font-family:${font};font-size:${size}px;line-height:1.75;color:${c};text-align:${align};">${html}</div>`, 8, 8, align));
        textParts.push(htmlToText(html));
        break;
      }
      case 'quote': {
        const html = cleanRichText(merge(b.html || ''), brand, ctx.trackLink);
        rows.push(cell(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${tint(brand, 0.92)};border-right:4px solid ${brand};border-radius:8px;padding:18px 20px;font-family:${font};font-size:17px;line-height:1.7;color:${textColor};text-align:right;">${html}</td></tr></table>`,
          12, 12));
        textParts.push(`« ${htmlToText(html)} »`);
        break;
      }
      case 'image': {
        const img = imageTag(b, inner);
        if (img) rows.push(cell(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="width:100%;"><tr><td align="${align}">${img}</td></tr></table>`, 12, 12, align));
        if (b.caption) {
          rows.push(cell(`<div style="font-family:${font};font-size:13px;line-height:1.5;color:#64748b;text-align:${align};">${esc(merge(b.caption))}</div>`, 0, 8, align));
        }
        break;
      }
      case 'button': {
        const href = safeUrl(b.url);
        if (!href) break;
        const bgc = color(b.bg, brand);
        const fg = color(b.color, '#ffffff');
        const radius = num(b.radius, 10, 0, 40);
        const full = !!b.fullWidth;
        const label = esc(merge(b.text || 'לחצו כאן'));
        rows.push(cell(
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" ${full ? 'width="100%"' : ''}><tr><td align="center" bgcolor="${bgc}" style="border-radius:${radius}px;background:${bgc};">` +
          `<a href="${esc(link(href))}" target="_blank" style="display:block;padding:14px 30px;font-family:${font};font-size:17px;font-weight:700;line-height:1.2;color:${fg};text-decoration:none;border-radius:${radius}px;">${label}</a>` +
          `</td></tr></table>`, 16, 16, align));
        textParts.push(`${merge(b.text || '')}: ${href}`);
        break;
      }
      case 'divider': {
        const c = color(b.color, '#e2e8f0');
        rows.push(cell(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:${num(b.thickness, 1, 1, 6)}px solid ${c};font-size:0;line-height:0;">&nbsp;</td></tr></table>`, 16, 16));
        textParts.push('―――');
        break;
      }
      case 'spacer': {
        const h = num(b.height, 24, 4, 120);
        rows.push(`<tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`);
        break;
      }
      case 'imageText': {
        const colW = Math.floor((inner - 24) / 2);
        const img = imageTag({ ...b, width: 100 }, colW);
        const html = cleanRichText(merge(b.html || ''), brand, ctx.trackLink);
        const imgCell = `<td class="col" width="${colW}" valign="top" style="width:${colW}px;padding:0 0 12px 0;">${img}</td>`;
        const gap = `<td class="col-gap" width="24" style="width:24px;font-size:0;">&nbsp;</td>`;
        const txtCell = `<td class="col" width="${colW}" valign="top" style="width:${colW}px;font-family:${font};font-size:16px;line-height:1.7;color:${textColor};text-align:right;">${html}</td>`;
        const first = b.imageSide === 'left' ? txtCell : imgCell;
        const second = b.imageSide === 'left' ? imgCell : txtCell;
        rows.push(cell(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>${first}${gap}${second}</tr></table>`, 12, 12));
        textParts.push(htmlToText(html));
        break;
      }
      default:
        break;
    }
  }

  // Israeli law (Communications Law §30A): sender name, address and contact details, and a simple way to opt out.
  const contactLine = [ctx.footer.address, ctx.footer.details].filter(Boolean).map(esc).join(' · ');
  const footerLines = [
    ctx.footer.businessName ? `<strong>${esc(ctx.footer.businessName)}</strong>` : '',
    contactLine,
    ctx.footer.reason ? esc(ctx.footer.reason) : '',
  ].filter(Boolean).join('<br>');
  const unsubscribeButton =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:14px auto 6px auto;"><tr>` +
    `<td align="center" style="border:1px solid #94a3b8;border-radius:8px;background:#ffffff;">` +
    `<a href="${esc(ctx.unsubscribeUrl)}" target="_blank" style="display:inline-block;padding:9px 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#334155;text-decoration:none;border-radius:8px;">הסרה מרשימת התפוצה</a>` +
    `</td></tr></table>` +
    `<div style="font-size:11px;color:#94a3b8;">אפשר גם להשיב למייל הזה עם המילה "הסר". ההסרה מיידית.</div>`;

  const preheader = ctx.preheader ? merge(ctx.preheader) : '';
  const fontLink = s.font === 'heebo'
    ? '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&display=swap" rel="stylesheet">'
    : '';

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(ctx.title || '')}</title>
${fontLink}
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; border-radius:0 !important; }
    .col { display:block !important; width:100% !important; }
    .col-gap { display:none !important; }
  }
</style>
</head>
<body dir="rtl" style="margin:0;padding:0;background:${bg};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};" dir="rtl">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" class="container" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="width:${WIDTH}px;max-width:${WIDTH}px;background:${contentBg};border-radius:14px;overflow:hidden;">
    ${rows.join('\n    ')}
    <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>
  <table role="presentation" class="container" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="width:${WIDTH}px;max-width:${WIDTH}px;">
    <tr><td align="center" style="padding:20px ${PAD}px 8px ${PAD}px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#64748b;text-align:center;">${footerLines}${unsubscribeButton}</td></tr>
  </table>
</td></tr>
</table>
${ctx.openPixelUrl ? `<img src="${esc(ctx.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">` : ''}
</body>
</html>`;

  const text = [
    preheader,
    ...textParts,
    '',
    '―――',
    ctx.footer.businessName,
    [ctx.footer.address, ctx.footer.details].filter(Boolean).join(' · '),
    ctx.footer.reason,
    `להסרה מרשימת התפוצה: ${ctx.unsubscribeUrl}`,
    'אפשר גם להשיב למייל הזה עם המילה "הסר".',
  ].filter((l) => l !== undefined && l !== null).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

  return { html, text };
}

export function renderSubject(subject: string, markAsAd: boolean, merge: MergeData) {
  const s = applyMerge(subject || '', merge).trim();
  return markAsAd && !/^פרסומת/.test(s) ? `פרסומת: ${s}` : s;
}
