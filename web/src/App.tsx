import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import CallMode from './pages/CallMode';
import ImportPage from './pages/Import';
import ScoringPage from './pages/Scoring';
import SettingsPage from './pages/Settings';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/call', label: 'Call queue' },
  { to: '/leads', label: 'Prospects' },
  { to: '/import', label: 'Import' },
  { to: '/scoring', label: 'Scoring' },
  { to: '/settings', label: 'Settings' },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('flowcalls-theme', theme);
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="btn px-2 py-1.5 text-xs"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}

export default function App() {
  return (
    <div className="min-h-full bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-raised/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-white">F</span>
            <span className="text-sm font-semibold tracking-tight text-ink">Flowcalls Prospecting</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? 'bg-accent/15 text-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/call" element={<CallMode />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/scoring" element={<ScoringPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<p className="text-sm text-ink-muted">Page not found.</p>} />
        </Routes>
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-8 pt-2 text-xs text-ink-muted">
        Internal B2B prospecting tool. All calls are dialled and logged by you — this system never dials automatically.
      </footer>
    </div>
  );
}
