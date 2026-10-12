import { useState } from 'react';
import FormField from '../ui/FormField';
import Button from '../ui/Button';

/**
 * Add/Edit student form with client-side validation.
 * Client validation is UX only — Member 2's service revalidates everything
 * server-side; conflicting writes fail loudly, never silently overwrite.
 *
 * Payload produced: {
 *   student_number, full_name, email (lowercased), department_id,
 *   graduation_year (int), cgpa (num|null), phone, backlogs (int|null)
 * }
 * M1-5: only columns that exist in the deployed schema are collected.
 * Program/year/section/registration/eligibility arrive with the Member 2
 * schema extension and are deliberately not collected yet.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+\-()\s]{7,20}$/;

function validate(values, config) {
  const errors = {};
  if (!values.student_number.trim()) errors.student_number = 'Roll number is required.';
  if (!values.full_name.trim()) errors.full_name = 'Name is required.';
  if (!values.email.trim()) {
    errors.email = 'University email is required.';
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.department_id) errors.department_id = 'Department is required.';
  const batch = Number(values.graduation_year);
  if (
    !Number.isInteger(batch) ||
    batch < config.min_graduation_year ||
    batch > config.max_graduation_year
  ) {
    errors.graduation_year = `Batch must be a whole year from ${config.min_graduation_year} to ${config.max_graduation_year}.`;
  }
  if (values.cgpa.trim() !== '') {
    const cgpa = Number(values.cgpa);
    if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) {
      errors.cgpa = 'CGPA must be a number between 0 and 10, or blank.';
    }
  }
  if (values.phone.trim() !== '' && !PHONE_RE.test(values.phone.trim())) {
    errors.phone = 'Phone may contain digits, spaces, +, - or parentheses (7–15 digits).';
  }
  if (values.backlogs.trim() !== '') {
    const backlogs = Number(values.backlogs);
    if (!Number.isInteger(backlogs) || backlogs < 0) {
      errors.backlogs = 'Backlogs must be a whole number of 0 or more, or blank.';
    }
  }
  return errors;
}

function toValues(student) {
  return {
    student_number: student?.student_number ?? '',
    full_name: student?.full_name ?? '',
    email: student?.email ?? '',
    department_id: student?.department_id ?? '',
    graduation_year: student?.graduation_year ?? '',
    placement_registered: student?.placement_registered ? 'true' : 'false',
    eligibility_status: student?.eligibility_status ?? 'pending',
    cgpa: String(student?.cgpa ?? ''),
    phone: student?.phone ?? '',
    backlogs: student?.backlogs ?? '',
  };
}

export default function StudentForm({ student, departments, config, busy = false, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => toValues(student));
  const [errors, setErrors] = useState({});

  function set(field) {
    return (event) => {
      const next = { ...values, [field]: event.target.value };
      setValues(next);
      if (errors[field]) {
        const revalidated = validate(next, config);
        const nextErrors = { ...errors };
        if (revalidated[field]) nextErrors[field] = revalidated[field];
        else delete nextErrors[field];
        setErrors(nextErrors);
      }
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    const found = validate(values, config);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit({
      student_number: values.student_number.trim(),
      full_name: values.full_name.trim(),
      email: values.email.trim().toLowerCase(),
      department_id: values.department_id,
      graduation_year: Number(values.graduation_year),
      cgpa: values.cgpa.trim() === '' ? null : Number(values.cgpa),
      phone: values.phone.trim() === '' ? null : values.phone.trim(),
      backlogs: values.backlogs.trim() === '' ? null : Number(values.backlogs),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Roll number"
          value={values.student_number}
          onChange={set('student_number')}
          error={errors.student_number}
          hint="Stored as text — leading zeroes are preserved."
          disabled={busy}
          required
        />
        <FormField
          label="Full name"
          value={values.full_name}
          onChange={set('full_name')}
          error={errors.full_name}
          disabled={busy}
          required
        />
        <FormField
          label="University email"
          type="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          disabled={busy}
          required
        />
        <FormField
          label="Department"
          as="select"
          value={values.department_id}
          onChange={set('department_id')}
          error={errors.department_id}
          disabled={busy}
          required
        >
          <option value="">Select department…</option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.code} — {dept.name}
            </option>
          ))}
        </FormField>
        <FormField
          label="Graduation batch"
          type="number"
          min={config.min_graduation_year}
          max={config.max_graduation_year}
          value={values.graduation_year}
          onChange={set('graduation_year')}
          error={errors.graduation_year}
          disabled={busy}
          required
        />
        <FormField
          label="CGPA (optional)"
          inputMode="decimal"
          value={values.cgpa}
          onChange={set('cgpa')}
          error={errors.cgpa}
          disabled={busy}
        />
        <FormField
          label="Backlogs (optional)"
          inputMode="numeric"
          value={values.backlogs}
          onChange={set('backlogs')}
          error={errors.backlogs}
          disabled={busy}
        />
        <FormField
          label="Phone (optional)"
          value={values.phone}
          onChange={set('phone')}
          error={errors.phone}
          disabled={busy}
        />
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Program, year, section, placement registration and eligibility status are not
        collected yet — those columns arrive with the Member 2 schema extension
        (docs/m1-5-integration-quality.md).
      </p>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          {student ? 'Save changes' : 'Add student'}
        </Button>
      </div>
    </form>
  );
}
