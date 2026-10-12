import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAuthRedirectPath, OAUTH_RETURN_KEY } from '../app/authNavigation.js';
import { ErrorState, LoadingState } from '../components/ui/States';
import Button from '../components/ui/Button';

export default function AuthCallback() {
  const { completeGoogleSignIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const exchange = useRef(null);

  useEffect(() => {
    document.title = 'Google sign-in · CampusOS';
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (params.has('error') || fragment.has('error')) {
      setError(new Error('Google sign-in was cancelled or denied. Please try again.'));
      return;
    }
    const code = params.get('code');
    if (!code) {
      setError(new Error('This sign-in link is incomplete. Return to sign in and try Google again.'));
      return;
    }
    let active = true;
    // React StrictMode replays effects. Exchange each single-use code once.
    if (exchange.current?.code !== code) exchange.current = { code, promise: completeGoogleSignIn(code) };
    exchange.current.promise.then(({ role }) => {
      if (!active) return;
      let requested = null;
      try {
        requested = sessionStorage.getItem(OAUTH_RETURN_KEY);
        sessionStorage.removeItem(OAUTH_RETURN_KEY);
      } catch { /* The role home remains available when storage is blocked. */ }
      navigate(getAuthRedirectPath(role, requested), { replace: true });
    }, failure => {
      if (!active) return;
      setError(failure);
      // Remove the one-use code from the address bar after a failed exchange.
      navigate('/auth/callback', { replace: true, state: { authError: failure.message } });
    });
    return () => { active = false; };
  }, [location.search, location.hash, completeGoogleSignIn, navigate]);

  const failure = location.state?.authError ? new Error(location.state.authError) : error;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        {failure ? <ErrorState title="Google sign-in failed" error={failure}
          actions={<Button onClick={() => navigate('/signin', { replace: true })}>Return to sign in</Button>} />
          : <LoadingState label="Completing Google sign-in…" />}
      </div>
    </div>
  );
}
