import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientsPage from './pages/Clients';
import ClientDetail from './pages/Clients/ClientDetail';
import MeetingsPage from './pages/Meetings';
import TasksPage from './pages/Tasks';
import PaymentsPage from './pages/Payments';
import DocumentsPage from './pages/Documents';
import AIPage from './pages/AI';
import CalendarPage from './pages/Calendar';
import AccountingPage from './pages/Accounting';
import ClientPortal from './pages/ClientPortal';
import Verify from './pages/Verify';
import SettingsPage from './pages/Settings';
import QuotesPage from './pages/Quotes';
import ProjectsPage from './pages/Projects';
import ContractsPage from './pages/Contracts';
import SignContract from './pages/Contracts/SignContract';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireCoach({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'COACH') return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to={user.role === 'COACH' ? '/' : '/portal'} replace /> : <Login />}
        />
        <Route path="/verify" element={<Verify />} />

        <Route element={<RequireCoach><Layout /></RequireCoach>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/accounting" element={<AccountingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
        </Route>

        <Route path="/sign-contract/:id" element={<SignContract />} />

        <Route
          path="/portal"
          element={<RequireAuth><ClientPortal /></RequireAuth>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
