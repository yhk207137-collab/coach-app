import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, CheckSquare, CreditCard, FolderOpen, Sparkles, LogOut, CalendarDays,
  BarChart2, X, Settings, FileText, FolderKanban, FileSignature, Target, Package, Mail, BookUser, ChevronDown,
  Megaphone, Wallet, CalendarClock,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import clsx from 'clsx';

interface NavItem { to: string; icon: any; label: string }
interface NavGroup { key: string; label: string; icon: any; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    key: 'sales', label: 'מכירות ושיווק', icon: Megaphone,
    items: [
      { to: '/leads', icon: Target, label: 'לידים – CRM' },
      { to: '/quotes', icon: FileText, label: 'הצעות מחיר' },
      { to: '/contracts', icon: FileSignature, label: 'חוזים' },
      { to: '/marketing/campaigns', icon: Mail, label: 'דיוור' },
      { to: '/marketing/contacts', icon: BookUser, label: 'אנשי קשר לדיוור' },
    ],
  },
  {
    key: 'clients', label: 'לקוחות ופרויקטים', icon: Users,
    items: [
      { to: '/clients', icon: Users, label: 'לקוחות' },
      { to: '/projects', icon: FolderKanban, label: 'פרויקטים' },
      { to: '/tasks', icon: CheckSquare, label: 'משימות' },
      { to: '/documents', icon: FolderOpen, label: 'מסמכים' },
    ],
  },
  {
    key: 'schedule', label: 'יומן ופגישות', icon: CalendarClock,
    items: [
      { to: '/calendar', icon: CalendarDays, label: 'יומן' },
      { to: '/meetings', icon: Calendar, label: 'פגישות' },
      { to: '/ai', icon: Sparkles, label: 'AI – תמלול' },
    ],
  },
  {
    key: 'finance', label: 'כספים', icon: Wallet,
    items: [
      { to: '/payments', icon: CreditCard, label: 'תשלומים' },
      { to: '/accounting', icon: BarChart2, label: 'הנהלת חשבונות' },
      { to: '/services', icon: Package, label: 'קטלוג שירותים' },
    ],
  },
];

const STORAGE_KEY = 'sidebar-open-group';
const isInGroup = (g: NavGroup, path: string) => g.items.some((i) => path === i.to || path.startsWith(`${i.to}/`));

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeGroup = GROUPS.find((g) => isInGroup(g, pathname))?.key ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    try { return activeGroup ?? localStorage.getItem(STORAGE_KEY); } catch { return activeGroup; }
  });

  // Landing on a page (e.g. from a dashboard link) opens the category it belongs to.
  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);

  useEffect(() => {
    try {
      if (openGroup) localStorage.setItem(STORAGE_KEY, openGroup);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable */ }
  }, [openGroup]);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const handleNav = () => {
    if (window.innerWidth < 1024) onClose();
  };

  const linkClass = ({ isActive }: { isActive: boolean }) => clsx(isActive ? 'sidebar-link-active' : 'sidebar-link-inactive');

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />}

      <aside
        className={clsx(
          'fixed top-0 right-0 h-full z-40 w-72 flex flex-col shadow-2xl transition-transform duration-300',
          'lg:static lg:w-64 lg:z-auto lg:translate-x-0 lg:flex-shrink-0',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
        style={{ background: 'linear-gradient(160deg, #0a1e3c 0%, #0f2547 55%, #13294d 100%)' }}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <NavLink to="/" onClick={handleNav} className="flex items-center gap-3 min-w-0" aria-label="יהושע כהן — אסטרטגיה וליווי לעמותות">
              <img src="/brand/mark-light.png" alt="" className="h-10 w-auto flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-extrabold text-white text-[17px] leading-tight tracking-tight">יהושע כהן</p>
                <p className="text-[11px] text-primary-200/80 leading-tight mt-0.5">אסטרטגיה וליווי לעמותות</p>
              </div>
            </NavLink>
            <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavLink to="/" end onClick={handleNav} className={linkClass}>
            <LayoutDashboard size={18} className="flex-shrink-0" />
            <span>לוח בקרה</span>
          </NavLink>

          <div className="pt-2 space-y-1">
            {GROUPS.map((g) => {
              const expanded = openGroup === g.key;
              const hasActive = activeGroup === g.key;
              return (
                <div key={g.key}>
                  <button
                    type="button"
                    onClick={() => setOpenGroup(expanded ? null : g.key)}
                    aria-expanded={expanded}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                      hasActive && !expanded ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <g.icon size={18} className="flex-shrink-0" />
                    <span className="flex-1 text-right">{g.label}</span>
                    {hasActive && !expanded && <span className="w-1.5 h-1.5 rounded-full bg-primary-300" aria-hidden="true" />}
                    <ChevronDown size={16} className={clsx('flex-shrink-0 opacity-60 transition-transform duration-200', expanded && 'rotate-180')} />
                  </button>
                  <div className={clsx('grid transition-all duration-200 ease-out', expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                    <div className="overflow-hidden">
                      <div className="mr-4 pr-3 border-r border-white/10 mt-1 mb-2 space-y-0.5">
                        {g.items.map(({ to, icon: Icon, label }) => (
                          <NavLink key={to} to={to} onClick={handleNav} className={linkClass} tabIndex={expanded ? 0 : -1}>
                            <Icon size={16} className="flex-shrink-0" />
                            <span>{label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
          <NavLink to="/settings" onClick={handleNav} className={linkClass}>
            <Settings size={18} />
            <span>הגדרות</span>
          </NavLink>
          <button onClick={handleLogout} className="sidebar-link-inactive w-full">
            <LogOut size={18} />
            <span>יציאה</span>
          </button>
        </div>
      </aside>
    </>
  );
}
