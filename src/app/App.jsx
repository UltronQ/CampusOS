import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './router';
import { AuthProvider } from '../hooks/useAuth';

/**
 * Application root: providers wrap the route table.
 * AuthProvider is the single authentication source for the whole UI.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
