import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { navForRole, ROLE_HOME } from '../../app/navigation';
import Button from '../ui/Button';

/**
 * Responsive application shell.
 * Desktop: persistent sidebar. Mobile: off-canvas drawer toggled from the
 * header. Includes a skip-to-content link for keyboard users.
 * Sign-out calls real Supabase auth; there is no fake session state.
 */

function NavItems({ onNavigate }) {
  const { role } = useAuth();
  const items = navForRole(role);
  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-4">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-200 hover:bg-slate-800 hover:text-white',
            ].join(' ')
          }
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell() {
  const { session, role, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setDrawerOpen(false);
  }, [role]);

  async function handleSignOut() {
    await signOut();
    navigate('/signin', { replace: true });
  }

  const roleLabel =
    role === 'placement_incharge' ? 'Placement In-Charge' : role === 'student' ? 'Student' : 'No role';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 lg:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <span aria-hidden="true" className="text-2xl">🎓</span>
          <div>
            <p className="text-base font-bold text-white">CampusOS</p>
            <p className="text-xs text-slate-400">Placement &amp; No-Dues</p>
          </div>
        </div>
        <NavItems />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <p className="text-base font-bold text-white">CampusOS</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <NavItems onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      ) : null}

      {/* Content area */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-900">{roleLabel}</p>
              <p className="truncate text-xs text-slate-500">{session?.user?.email ?? ''}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={handleSignOut}>
            Sign out
          </Button>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>

        <footer className="px-6 py-4 text-center text-xs text-slate-400">
          CampusOS — University Placement &amp; Department No-Dues Portal
        </footer>
      </div>
    </div>
  );
}
