import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, CheckSquare,
  CreditCard, FolderOpen, Sparkles, LogOut, Briefcase, CalendarDays, BarChart2, X, Settings, FileText, FolderKanban, FileSignature,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import clsx from 'clsx';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'לוח בקרה', exact: true },
  { to: '/clients', icon: Users, label: 'לקוחות' },
  { to: '/calendar', icon: CalendarDays, label: 'יומן' },
  { to: '/meetings', icon: Calendar, label: 'פגישות' },
  { to: '/tasks', icon: CheckSquare, label: 'משימות' },
  { to: '/payments', icon: CreditCard, label: 'תשלומים' },
  { to: '/accounting', icon: BarChart2, label: 'הנהלת חשבונות' },
  { to: '/quotes', icon: FileText, label: 'הצעות מחיר' },
  { to: '/projects', icon: FolderKanban, label: 'פרויקטים' },
  { to: '/contracts', icon: FileSignature, label: 'חוזים' },
  { to: '/documents', icon: FolderOpen, label: 'מסמכים' },
  { to: '/ai', icon: Sparkles, label: 'AI – תמלול' },
  { to: '/settings', icon: Settings, label: 'הגדרות' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const handleNav = () => {
    // Close sidebar on mobile after navigation
    if (window.innerWidth < 1024) onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={clsx(
        'fixed top-0 right-0 h-full z-40 w-72 flex flex-col shadow-2xl transition-transform duration-300',
        'lg:static lg:w-64 lg:z-auto lg:translate-x-0 lg:flex-shrink-0',
        open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
      )}
        style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)' }}
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-pink-400 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm leading-tight">ליוי שיווק ופרסום</p>
                <p className="text-xs text-white/50">{user?.name}</p>
              </div>
            </div>
            <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={handleNav}
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
        <div className="px-3 py-4 border-t border-white/10">
          <button onClick={handleLogout} className="sidebar-link-inactive w-full">
            <LogOut size={18} />
            <span>יציאה</span>
          </button>
        </div>
      </aside>
    </>
  );
}
