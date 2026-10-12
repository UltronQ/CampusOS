import { ROLE_HOME } from './navigation.js';

export const OAUTH_RETURN_KEY = 'campusos.oauth.returnPath';

/** OAuth and password sign-in share the same role-scoped, local redirect rule. */
export function getAuthRedirectPath(role, requested) {
  const home = ROLE_HOME[role] ?? '/unauthorized';
  const prefix = role === 'student' ? '/student/' : role === 'placement_incharge' ? '/incharge/' : null;
  if (!prefix || typeof requested !== 'string' || !requested.startsWith('/')
    || requested.startsWith('//') || /[\\\u0000-\u0020]/u.test(requested)) return home;
  try {
    const target = new URL(requested, 'https://campusos.invalid');
    if (target.origin !== 'https://campusos.invalid' || !target.pathname.startsWith(prefix)) return home;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return home; }
}
