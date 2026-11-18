// The one socket between the assistant and a business app it may be embedded in later.
// Today nothing is plugged in: the assistant knows nothing about the app and touches none of its data.
//
// To embed it, the app passes a list of HostTools to mountAssistant(). Each one is a plain
// in-process function of the app, so the assistant acts inside the app directly — no API, no MCP.
import type { z } from 'zod';

export interface HostTool {
  /** Short snake_case name, e.g. "find_client". The assistant sees it as app_<name>. */
  name: string;
  /** What it does and when to use it, in plain words for the model. */
  description: string;
  /** Input fields as a zod shape, e.g. { query: z.string() }. */
  input: z.ZodRawShape;
  /**
   * read           – only reads; sub-agents may use it too.
   * act            – changes something inside the app; runs at once.
   * needs_approval – reaches people or money; the owner must answer "yes" on WhatsApp first.
   */
  kind: 'read' | 'act' | 'needs_approval';
  /** For needs_approval: the one-line text the owner approves, e.g. "שליחת חשבונית 1200 ₪ לדני". */
  summary?: (input: any) => string;
  /** Does the work and returns plain data (it is shown to the model as JSON). */
  run: (input: any) => Promise<unknown>;
}

export interface HostOptions {
  /** Tools from the host app. Empty = not connected to any app. */
  hostTools?: HostTool[];
  /** One or two sentences telling the assistant what the app is, e.g. "the owner's CRM for clients, meetings and payments". */
  hostDescription?: string;
  /** Local trial only: serve a chat window at http://localhost:<port>/ (never through the public tunnel). */
  localChat?: boolean;
}
