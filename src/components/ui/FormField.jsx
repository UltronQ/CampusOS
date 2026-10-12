import { useId } from 'react';

/**
 * Labeled form control with error text wired via aria-describedby.
 * Renders input / select / textarea from the `as` prop.
 * All forms in CampusOS use this so validation messages are accessible.
 */
export default function FormField({
  label,
  error,
  hint,
  as = 'input',
  className = '',
  children,
  ...rest
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  const baseClasses =
    'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
    'placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 ' +
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';
  const errorClasses = error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : '';

  const Tag = as;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {Tag === 'select' ? (
        <select id={id} aria-describedby={describedBy} aria-invalid={Boolean(error) || undefined} className={`${baseClasses} ${errorClasses}`} {...rest}>
          {children}
        </select>
      ) : (
        <Tag
          id={id}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          className={`${baseClasses} ${errorClasses} ${Tag === 'textarea' ? 'min-h-24' : ''}`}
          {...rest}
        >
          {children}
        </Tag>
      )}
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
