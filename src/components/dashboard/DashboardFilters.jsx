import FormField from '../ui/FormField';
import Button from '../ui/Button';
import { DRIVE_STATUS_LABELS, DRIVE_STATUS_VALUES } from '../../app/placementLabels';
import { IMPORT_CONFIG } from '../../app/config';

/**
 * Shared dashboard filter bar (M1-4). Emits a PlacementAnalyticsFilters-shaped
 * object with controlled arrays and nullable date/status values — the exact
 * shape Member 3's analytics functions accept. Options come from loaded
 * reference data; empty arrays mean "no constraint" per the contract.
 */

const BATCHES = Array.from(
  { length: IMPORT_CONFIG.max_graduation_year - IMPORT_CONFIG.min_graduation_year + 1 },
  (_, index) => IMPORT_CONFIG.min_graduation_year + index,
);

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function ChipList({ options, selected, onToggle, ariaLabel }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1 text-sm ${
              active
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={active}
              onChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export default function DashboardFilters({ departments = [], companies = [], value, onChange }) {
  const isFiltered =
    value.department_ids.length > 0 ||
    value.graduation_years.length > 0 ||
    value.company_ids.length > 0 ||
    value.drive_statuses.length > 0;

  function set(patch) {
    onChange({ ...value, ...patch });
  }

  return (
    <section aria-label="Dashboard filters" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Filters</h2>
        <Button
          variant="ghost"
          onClick={() =>
            onChange({
              department_ids: [],
              graduation_years: [],
              company_ids: [],
              drive_start_from: null,
              drive_start_to: null,
              drive_statuses: [],
            })
          }
          disabled={!isFiltered}
        >
          Clear all
        </Button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <FormField label="Department" hint="No selection = all departments">
          <ChipList
            ariaLabel="Department filters"
            options={departments.map((dept) => ({ value: dept.id, label: dept.code }))}
            selected={value.department_ids}
            onToggle={(id) => set({ department_ids: toggle(value.department_ids, id) })}
          />
        </FormField>

        <FormField label="Graduation batch" hint="No selection = all batches">
          <ChipList
            ariaLabel="Batch filters"
            options={BATCHES.map((year) => ({ value: year, label: String(year) }))}
            selected={value.graduation_years}
            onToggle={(year) => set({ graduation_years: toggle(value.graduation_years, year) })}
          />
        </FormField>

        <FormField label="Company" hint="No selection = all companies">
          <ChipList
            ariaLabel="Company filters"
            options={companies.map((company) => ({ value: company.id, label: company.name }))}
            selected={value.company_ids}
            onToggle={(id) => set({ company_ids: toggle(value.company_ids, id) })}
          />
        </FormField>

        <FormField label="Recruitment drive status" hint="No selection = Open and Completed drives">
          <ChipList
            ariaLabel="Drive status filters"
            options={DRIVE_STATUS_VALUES.filter((status) =>
              ['published', 'in_progress', 'completed'].includes(status),
            ).map((status) => ({ value: status, label: DRIVE_STATUS_LABELS[status] }))}
            selected={value.drive_statuses}
            onToggle={(status) => set({ drive_statuses: toggle(value.drive_statuses, status) })}
          />
        </FormField>

        <FormField label="Drive start from" hint="Inclusive">
          <input
            type="date"
            value={value.drive_start_from ?? ''}
            onChange={(event) => set({ drive_start_from: event.target.value || null })}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Drive start to" hint="Inclusive">
          <input
            type="date"
            value={value.drive_start_to ?? ''}
            onChange={(event) => set({ drive_start_to: event.target.value || null })}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </FormField>
      </div>
    </section>
  );
}

export const EMPTY_PLACEMENT_FILTERS = Object.freeze({
  department_ids: [],
  graduation_years: [],
  company_ids: [],
  drive_start_from: null,
  drive_start_to: null,
  drive_statuses: [],
});
