import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/' },
    { label: 'Projects', path: '/projects' },
    { label: 'Tasks', path: '/tasks' },
    { label: 'Customers', path: '/customers' },
    { label: 'Audit Logs', path: '/audit-logs' },
    { label: 'Subscription & Billing', path: '/billing' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xl font-bold tracking-tight text-white">FlowSuite</span>
              </div>
              <nav className="hidden md:flex space-x-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-slate-800 text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            {/* Right side user info */}
            <div className="flex items-center space-x-4">
              {user && (
                <div className="hidden sm:flex flex-col items-end text-xs font-mono">
                  <span className="text-slate-300 font-sans font-medium">{user.name || user.email || 'User'}</span>
                  <span className="text-slate-400 text-[10px]">Org: {user.organizationId.slice(0, 8)}...</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 rounded-md border border-slate-700 hover:border-rose-800 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden border-t border-slate-800 px-2 pt-2 pb-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-base font-medium ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};
