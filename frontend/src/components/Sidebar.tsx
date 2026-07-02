import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, CheckSquare,
  CreditCard, FolderOpen, Sparkles, LogOut, Briefcase,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import clsx from 'clsx';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'לוח בקרה', exact: true },
  { to: '/clients', icon: Users, label: 'לקוחות' },
  { to: '/meetings', icon: Calendar, label: 'פגישות' },
  { to: '/tasks', icon: CheckSquare, label: 'משימות' },
  { to: '/payments', icon: CreditCard, label: 'תשלומים' },
  { to: '/documents', icon: FolderOpen, label: 'מסמכים' },
  { to: '/ai', icon: Sparkles, label: 'AI – תמלול' },
];

export default function Sidebar() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-l border-slate-100 flex flex-col h-full shadow-sm">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">מאמן עסקי</p>
            <p className="text-xs text-slate-400">{user?.name}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              clsx(isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')
            }
          >
            <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-slate-100">
        <button onClick={handleLogout} className="sidebar-link-inactive w-full">
          <LogOut size={18} />
          <span>יציאה</span>
        </button>
      </div>
    </aside>
  );
}
