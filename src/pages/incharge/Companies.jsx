import { useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useCompanies } from '../../hooks/usePlacement';
import * as recruitmentService from '../../services/recruitmentService';

/**
 * Module 2 — Company management (Placement In-Charge).
 * Real reads/writes through Member 2's recruitmentService; RLS authorizes.
 * No delete here: companies are FK-RESTRICT from drives on purpose — remove
 * the drive relationship first, then delete at the database console.
 */
export default function Companies() {
  const companies = useCompanies();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate(event) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(new Error('Company name is required.'));
      return;
    }
    setBusy(true);
    try {
      await recruitmentService.createCompany(name.trim());
      setName('');
      companies.reload();
    } catch (err) {
      setError(new Error(err?.message ?? 'Could not create the company.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModulePage
      title="Companies"
      description="Recruiting companies. Company records feed drives, application history and analytics filters."
    >
      <section aria-label="Add company" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3" noValidate>
          <FormField
            label="Company name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Demo Systems Pvt Ltd"
            className="w-72"
            disabled={busy}
          />
          <Button type="submit" busy={busy}>
            Add company
          </Button>
        </form>
        {error ? (
          <div className="mt-4">
            <ErrorState title="Could not add company" error={error} />
          </div>
        ) : null}
      </section>

      <section aria-label="Company list" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">All companies</h2>
        {companies.loading ? (
          <div className="mt-4"><LoadingState label="Loading companies…" /></div>
        ) : companies.error ? (
          <div className="mt-4"><ErrorState title="Companies unavailable" error={companies.error} /></div>
        ) : companies.data.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No companies yet">Add the first recruiting company above.</EmptyState>
          </div>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {companies.data.map((company) => (
              <li
                key={company.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3"
              >
                <span aria-hidden="true">🏢</span>
                <span className="text-sm font-medium text-slate-800">{company.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ModulePage>
  );
}
