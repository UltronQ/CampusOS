import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState, ErrorState, UnauthorizedState } from '../ui/States';

/**
 * Route guard. It chooses what UI a role can *see*; it does not grant
 * permission — every data access behind these routes is still protected by
 * Supabase RLS. A mismatched role lands on /unauthorized, never a dead end.
 */
export default function ProtectedRoute({ role, children }) {
  const { session, role: activeRole, loading, error } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState label="Checking your session…" />;
  }

  if (error) {
    return <ErrorState title="Cannot verify your session" error={error} />;
  }

  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  // Backend has not provisioned a profile/role yet: show an explicit state
  // instead of guessing a default role.
  if (!activeRole) {
    return (
      <UnauthorizedState
        title="Account not provisioned"
        message="Your account exists but has no role yet. A Placement In-Charge must
          assign you the student or in-charge role in CampusOS before you can continue."
      />
    );
  }

  if (role && activeRole !== role) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
