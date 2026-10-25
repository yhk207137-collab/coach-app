export interface ParsedRow {
  email: string;
  name?: string;
  phone?: string;
  date?: string;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const [best, count] = (['\t', ',', ';'] as const)
    .map((d) => [d, firstLine.split(d).length - 1] as const)
    .sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ',';
}

export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delim) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const HEADER_MATCH: Record<keyof ParsedRow, RegExp> = {
  email: /^(e-?mail|מייל|אימייל|דוא"?ל|כתובת מייל|דואר אלקטרוני)$/i,
  name: /^(name|full ?name|שם|שם מלא|שם פרטי)$/i,
  phone: /^(phone|mobile|טלפון|נייד|מספר טלפון|פלאפון)$/i,
  date: /^(date|תאריך|תאריך הרשמה|נרשם ב)$/i,
};
const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.replace(/[​-‏‪-‮⁦-⁩﻿\s]/g, ''));

export function rowsToContacts(table: string[][]): { rows: ParsedRow[]; columns: Partial<Record<keyof ParsedRow, number>>; hasHeader: boolean } {
  if (!table.length) return { rows: [], columns: {}, hasHeader: false };
  const header = table[0];
  const columns: Partial<Record<keyof ParsedRow, number>> = {};
  header.forEach((h, i) => {
    (Object.keys(HEADER_MATCH) as (keyof ParsedRow)[]).forEach((k) => {
      if (columns[k] === undefined && HEADER_MATCH[k].test(h.trim())) columns[k] = i;
    });
  });
  const hasHeader = columns.email !== undefined || (!header.some(looksLikeEmail) && table.length > 1);
  const body = hasHeader ? table.slice(1) : table;
  if (columns.email === undefined) {
    const counts = new Map<number, number>();
    body.slice(0, 50).forEach((r) => r.forEach((c, i) => { if (looksLikeEmail(c)) counts.set(i, (counts.get(i) || 0) + 1); }));
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) columns.email = best[0];
  }
  if (columns.name === undefined && columns.email !== undefined) {
    const candidate = body[0]?.findIndex((c, i) => i !== columns.email && c && !looksLikeEmail(c) && !/^[\d\s\-+()./:]+$/.test(c));
    if (candidate !== undefined && candidate >= 0) columns.name = candidate;
  }
  const rows = body
    .map((r) => ({
      email: columns.email !== undefined ? r[columns.email] || '' : '',
      name: columns.name !== undefined ? r[columns.name] : undefined,
      phone: columns.phone !== undefined ? r[columns.phone] : undefined,
      date: columns.date !== undefined ? r[columns.date] : undefined,
    }))
    .filter((r) => r.email);
  return { rows, columns, hasHeader };
}
