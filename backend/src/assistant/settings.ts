// Connection settings (Google OAuth client, Zoom app). The owner pastes them into the local chat window;
// they are kept in the assistant's own table. An environment variable with the same name also works.
import { kvGet, kvSet, kvDelete } from './store';

export const SETTING_NAMES = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ZOOM_ACCOUNT_ID',
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
] as const;
export type SettingName = (typeof SETTING_NAMES)[number];

export async function cfg(name: SettingName): Promise<string> {
  return ((await kvGet(`cfg_${name}`)) || process.env[name] || '').trim();
}

/** Saves the fields that were filled in; empty fields leave the old value alone. */
export async function saveSettings(values: Partial<Record<SettingName, string>>) {
  for (const name of SETTING_NAMES) {
    const v = String(values[name] ?? '').trim();
    if (v) await kvSet(`cfg_${name}`, v);
  }
}

export async function clearSettings(prefix: 'GOOGLE' | 'ZOOM') {
  for (const name of SETTING_NAMES) if (name.startsWith(prefix)) await kvDelete(`cfg_${name}`);
}

/** Which settings are filled in — never the values themselves. */
export async function settingsFilled() {
  const out: Record<string, boolean> = {};
  for (const name of SETTING_NAMES) out[name] = !!(await cfg(name));
  return out;
}
