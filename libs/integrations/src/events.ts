export type NotificationEventType =
  | 'scan.started'
  | 'scan.completed'
  | 'scan.failed'
  | 'vuln.found'
  | 'ti.refreshed'
  | 'test';

export interface NotificationEvent {
  type: NotificationEventType;
  title: string;
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  url?: string;
  fields?: Record<string, string>;
}

export type Channel = 'discord' | 'slack' | 'telegram' | 'google_chat' | 'generic';

export const ALL_EVENT_TYPES: NotificationEventType[] = [
  'scan.started',
  'scan.completed',
  'scan.failed',
  'vuln.found',
  'ti.refreshed',
];
