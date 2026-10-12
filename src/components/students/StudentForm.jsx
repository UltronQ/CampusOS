import { useState } from 'react';
import FormField from '../ui/FormField';
import Button from '../ui/Button';
import { ELIGIBILITY_STATUSES } from '../../app/config';

/**
 * Add/Edit student form with client-side validation.
 * Client validation is UX only — Member 2's service revalidates everything
 * server-side; conflicting writes fail loudly, never silently overwrite.
 *
 * Payload produced: {
 *   student_number, full_name, email (lowercased), department_id,
 *   program, academic_year (int), section, graduation_year (int),
 *   placement_registered (boolean), eligibility_status, cgpa (num|null), phone
 * }
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
  if (!values.program.trim()) errors.program = 'Program is required.';
  const year = Number(values.academic_year);
  if (!Number.isInteger(year) || year < 1 || year > 8) {
    errors.academic_year = 'Year must be a whole number from 1 to 8.';
  }
  if (!values.section.trim()) errors.section = 'Section is required.';
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
  return errors;
}

function toValues(student) {
  return {
    student_number: student?.student_number ?? '',
    full_name: student?.full_name ?? '',
    email: student?.email ?? '',
    department_id: student?.department_id ?? '',
    program: student?.program ?? '',
    academic_year: student?.academic_year ?? '',
    section: student?.section ?? '',
    graduation_year: student?.graduation_year ?? '',
    placement_registered: student?.placement_registered ? 'true' : 'false',
    eligibility_status: student?.eligibility_status ?? 'pending',
    cgpa: student?.cgpa ?? '',
    phone: student?.phone ?? '',
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
      program: values.program.trim(),
      academic_year: Number(values.academic_year),
      section: values.section.trim(),
      graduation_year: Number(values.graduation_year),
      placement_registered: values.placement_registered === 'true',
      eligibility_status: values.eligibility_status,
      cgpa: values.cgpa.trim() === '' ? null : Number(values.cgpa),
      phone: values.phone.trim() === '' ? null : values.phone.trim(),
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
          label="Program"
          value={values.program}
          onChange={set('program')}
          error={errors.program}
          placeholder="B.Tech, M.Tech, B.Sc…"
          disabled={busy}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Year"
            type="number"
            min="1"
            max="8"
            value={values.academic_year}
            onChange={set('academic_year')}
            error={errors.academic_year}
            disabled={busy}
            required
          />
          <FormField
            label="Section"
            value={values.section}
            onChange={set('section')}
            error={errors.section}
            placeholder="A"
            disabled={busy}
            required
          />
        </div>
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
          label="Placement registration"
          as="select"
          value={values.placement_registered}
          onChange={set('placement_registered')}
          disabled={busy}
        >
          <option value="false">Not registered</option>
          <option value="true">Registered</option>
        </FormField>
        <FormField
          label="Eligibility status"
          as="select"
          value={values.eligibility_status}
          onChange={set('eligibility_status')}
          disabled={busy}
        >
          {ELIGIBILITY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace('_', ' ')}
            </option>
          ))}
        </FormField>
        <FormField
          label="CGPA (optional)"
          inputMode="decimal"
          value={values.cgpa}
          onChange={set('cgpa')}
          error={errors.cgpa}
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
