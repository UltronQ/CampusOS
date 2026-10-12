import { Link } from 'react-router-dom';
import { UnauthorizedState } from '../components/ui/States';
import { useAuth } from '../hooks/useAuth';
import { ROLE_HOME } from '../app/navigation';

/** Landing page when a signed-in user's role does not match the route. */
export default function Unauthorized() {
  const { role } = useAuth();
  const home = role ? ROLE_HOME[role] : '/signin';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-lg">
        <UnauthorizedState />
        <div className="mt-4 text-center">
          <Link
            to={home}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Go to my dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
