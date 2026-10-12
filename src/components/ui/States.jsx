/**
 * Shared page-state components: loading, empty, error, unauthorized.
 * Every list/data page in CampusOS uses these instead of blank screens,
 * alert() dialogs, or fabricated placeholder data.
 */

function StateShell({ icon, title, children, actions, tone = 'neutral' }) {
  const toneClasses = {
    neutral: 'bg-white text-slate-700 border-slate-200',
    danger: 'bg-white text-red-700 border-red-200',
  }[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-xl border ${toneClasses} p-8 text-center shadow-sm`}
    >
      <div aria-hidden="true" className="mx-auto mb-3 text-3xl">{icon}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      {children ? (
        <div className="mx-auto mt-2 max-w-prose text-sm text-slate-500">{children}</div>
      ) : null}
      {actions ? <div className="mt-4 flex justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div
        aria-hidden="true"
        className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"
      />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', children, actions }) {
  return (
    <StateShell icon="📭" title={title} actions={actions}>
      {children}
    </StateShell>
  );
}

export function ErrorState({ title = 'Something went wrong', error, children, actions }) {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : null;
  return (
    <StateShell icon="⚠️" title={title} tone="danger" actions={actions}>
      {message ? <p className="font-medium text-red-600">{message}</p> : null}
      {children}
    </StateShell>
  );
}

export function UnauthorizedState({
  title = 'Access denied',
  message = 'Your role does not have permission to view this page. If you believe this is a mistake, contact the Placement In-Charge.',
}) {
  return (
    <StateShell icon="🔒" title={title} tone="danger">
      <p>{message}</p>
    </StateShell>
  );
}
