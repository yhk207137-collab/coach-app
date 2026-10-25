import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fullWidth = useLocation().pathname === '/';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8f4ff 0%, #eff6ff 50%, #f0fdf4 100%)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className={clsx('mx-auto animate-fade-in', fullWidth ? 'max-w-none' : 'max-w-7xl')}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
