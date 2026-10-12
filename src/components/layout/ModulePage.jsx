import { useEffect } from 'react';
import { EmptyState } from '../ui/States';

/**
 * Consistent page scaffold for all CampusOS modules.
 * Shows purpose, owner/status note, and an honest empty state until the
 * module's Member 2 service is wired in — never fake data or dead buttons.
 */
export default function ModulePage({ title, description, status, children }) {
  useEffect(() => {
    document.title = `${title} · CampusOS`;
    return () => {
      document.title = 'CampusOS';
    };
  }, [title]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-slate-500">{description}</p>
        ) : null}
      </header>
      {children ?? (
        <EmptyState title="Module scaffold">
          {status ?? 'This module will be wired to its CampusOS service in a coming task.'}
        </EmptyState>
      )}
      {children && status ? (
        <p className="text-xs text-slate-400">{status}</p>
      ) : null}
    </div>
  );
}
