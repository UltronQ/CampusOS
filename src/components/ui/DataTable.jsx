import { EmptyState } from './States';

/**
 * Generic accessible data table.
 * columns: [{ key, label, render?(row), align? }]
 * Rendering is presentational only — numbers always come from services,
 * never recomputed here.
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (row, index) => row.id ?? index,
  caption,
  emptyTitle = 'No records yet',
  emptyMessage,
  className = '',
}) {
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyMessage}</EmptyState>;
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption ? (
          <caption className="sr-only">{caption}</caption>
        ) : null}
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                  column.align === 'right' ? 'text-right' : ''
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 align-middle text-slate-700 ${
                    column.align === 'right' ? 'text-right tabular-nums' : ''
                  }`}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
