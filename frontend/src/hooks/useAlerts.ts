import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export interface AlertItem {
  key: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href: string;
  amount?: number;
  soon?: boolean;
  whatsapp?: string;
  action?: { type: 'task-done' | 'payment-paid'; id: string };
}
export interface AlertsData {
  alerts: AlertItem[];
  urgent: number;
}

// Shared by the bell and the alerts page; refreshes by itself while the app is open.
export const useAlerts = () =>
  useQuery<AlertsData>({
    queryKey: ['alerts'],
    queryFn: () => api.get('/alerts').then((r) => r.data),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
