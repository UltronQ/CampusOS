import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLE_HOME } from '../app/navigation';
import { getAuthRedirectPath, OAUTH_RETURN_KEY } from '../app/authNavigation.js';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import { ErrorState } from '../components/ui/States';

/**
 * Sign-in screen. Real Supabase password auth — no demo credentials, no
 * fake sessions. On success the user is routed by their backend role.
 */
export default function SignIn() {
  const { session, role, loading, error, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from ?? null;

  useEffect(() => {
    document.title = 'Sign in · CampusOS';
  }, []);

  // Already signed in? Route by backend role, never by client guesswork.
  if (!loading && session) {
    if (role && ROLE_HOME[role]) {
      const target = getAuthRedirectPath(role, from);
      return <Navigate to={target} replace />;
    }
    return <Navigate to="/unauthorized" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const { profile } = await signIn(email.trim(), password);
      // Return to the originally requested page only when the backend role
      // grants that area; otherwise go to the role home (or unauthorized).
      navigate(getAuthRedirectPath(profile?.role, from), { replace: true });
    } catch (err) {
      setFormError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setFormError(null);
    setGoogleSubmitting(true);
    try {
      const { url } = await signInWithGoogle();
      try {
        if (typeof from === 'string') sessionStorage.setItem(OAUTH_RETURN_KEY, from);
        else sessionStorage.removeItem(OAUTH_RETURN_KEY);
      } catch { /* Storage is optional; callback falls back to the role home. */ }
      window.location.assign(url);
    } catch (err) {
      setFormError(err);
      setGoogleSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden="true" className="text-3xl">🎓</span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">CampusOS</h1>
            <p className="text-sm text-slate-500">University Placement &amp; No-Dues Portal</p>
          </div>
        </div>

        {error ? <ErrorState title="Configuration problem" error={error} /> : null}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@university.edu"
          />
          <FormField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
          {formError ? (
            <ErrorState title="Sign-in failed" error={formError} />
          ) : null}
          <Button type="submit" busy={submitting} disabled={googleSubmitting || loading || Boolean(error)} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /><span>or</span><span className="h-px flex-1 bg-slate-200" />
        </div>
        <Button variant="secondary" busy={googleSubmitting} disabled={submitting || loading || Boolean(error)}
          onClick={handleGoogleSignIn} className="w-full">
          {googleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}
        </Button>

        <p className="mt-6 text-center text-xs text-slate-400">
          Accounts are provisioned by the Placement In-Charge.
        </p>
      </div>
    </div>
  );
}
