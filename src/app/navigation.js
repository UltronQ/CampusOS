/**
 * Role-aware navigation configuration.
 * Paths map to the six mandatory modules:
 *  1. Students & departments management (+ import)  -> Students, Import
 *  2. Companies & recruitment drives                -> Companies, Drives
 *  3. Placement tracking & applications             -> Applications (in-charge),
 *                                                     My Applications / Offers (student)
 *  4. Live placement analytics                      -> Analytics
 *  5. Departmental no-dues checklists               -> No Dues / My Clearance
 *  6. Statements, reports & exports                 -> Reports
 */

export const ROLE_HOME = {
  placement_incharge: '/incharge/dashboard',
  student: '/student/dashboard',
};

export const INCHARGE_NAV = [
  { to: '/incharge/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/incharge/students', label: 'Students', icon: '🎓' },
  { to: '/incharge/import', label: 'Import Students', icon: '📥' },
  { to: '/incharge/companies', label: 'Companies', icon: '🏢' },
  { to: '/incharge/drives', label: 'Recruitment Drives', icon: '📅' },
  { to: '/incharge/applications', label: 'Applications', icon: '🧾' },
  { to: '/incharge/analytics', label: 'Placement Analytics', icon: '📊' },
  { to: '/incharge/no-dues', label: 'No-Dues Checklists', icon: '✅' },
  { to: '/incharge/reports', label: 'Reports & Exports', icon: '📤' },
];

export const STUDENT_NAV = [
  { to: '/student/dashboard', label: 'My Dashboard', icon: '🏠' },
  { to: '/student/drives', label: 'Recruitment Drives', icon: '📅' },
  { to: '/student/applications', label: 'My Applications', icon: '🧾' },
  { to: '/student/offers', label: 'My Offers', icon: '💼' },
  { to: '/student/clearance', label: 'My Clearance', icon: '✅' },
];

export function navForRole(role) {
  if (role === 'placement_incharge') return INCHARGE_NAV;
  if (role === 'student') return STUDENT_NAV;
  return [];
}
