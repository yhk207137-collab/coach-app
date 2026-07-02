export type Role = 'COACH' | 'CLIENT';
export type ClientStatus = 'ACTIVE' | 'FROZEN' | 'ENDED';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type SummaryType = 'STRUCTURED' | 'FREE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId?: string;
}

export interface Client {
  id: string;
  fullName: string;
  phone?: string;
  email: string;
  businessName?: string;
  businessField?: string;
  startDate: string;
  status: ClientStatus;
  notes?: string;
  meetings?: Meeting[];
  tasks?: Task[];
  payments?: Payment[];
  documents?: Document[];
  _count?: { meetings: number; tasks: number };
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  clientId: string;
  client?: { fullName: string; email: string; phone?: string };
  date: string;
  duration: number;
  type: string;
  notes?: string;
  googleEventId?: string;
  summary?: MeetingSummary;
  tasks?: Task[];
  createdAt: string;
}

export interface MeetingSummary {
  id: string;
  meetingId: string;
  meeting?: { date: string; type: string };
  type: SummaryType;
  goal?: string;
  progress?: string;
  challenges?: string;
  decisions?: string;
  conclusions?: string;
  freeText?: string;
  notes?: string;
  tags: Tag[];
  documents?: Document[];
  createdAt: string;
}

export interface Task {
  id: string;
  clientId: string;
  client?: { fullName: string; id: string };
  meetingId?: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  clientId: string;
  client?: { fullName: string };
  totalAmount: number;
  paidAmount: number;
  nextPaymentDate?: string;
  history: PaymentRecord[];
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  paymentId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface Document {
  id: string;
  clientId: string;
  summaryId?: string;
  name: string;
  mimeType: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface DashboardData {
  activeClients: number;
  todayMeetings: Meeting[];
  upcomingMeetings: Meeting[];
  openTasks: Task[];
  pendingPayments: Payment[];
  clientsWithoutFutureMeeting: Pick<Client, 'id' | 'fullName' | 'email'>[];
}
