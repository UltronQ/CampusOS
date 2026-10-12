import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import AppShell from '../components/layout/AppShell';
import SignIn from '../pages/SignIn';
import NotFound from '../pages/NotFound';
import Unauthorized from '../pages/Unauthorized';
import InchargeDashboard from '../pages/incharge/Dashboard';
import Students from '../pages/incharge/Students';
import ImportStudents from '../pages/incharge/ImportStudents';
import Companies from '../pages/incharge/Companies';
import Drives from '../pages/incharge/Drives';
import Applications from '../pages/incharge/Applications';
import Analytics from '../pages/incharge/Analytics';
import NoDues from '../pages/incharge/NoDues';
import Reports from '../pages/incharge/Reports';
import StudentDashboard from '../pages/student/Dashboard';
import StudentApplications from '../pages/student/Applications';
import StudentOffers from '../pages/student/Offers';
import StudentClearance from '../pages/student/Clearance';

/**
 * Route table.
 *  /signin                public
 *  /incharge/*            placement_incharge only
 *  /student/*             student only
 *  /unauthorized          signed-in but wrong role
 *  *                      404
 * ProtectedRoute gates UI only; Supabase RLS is the real authorization.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/signin" replace />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      <Route
        element={
          <ProtectedRoute role="placement_incharge">
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/incharge/dashboard" element={<InchargeDashboard />} />
        <Route path="/incharge/students" element={<Students />} />
        <Route path="/incharge/import" element={<ImportStudents />} />
        <Route path="/incharge/companies" element={<Companies />} />
        <Route path="/incharge/drives" element={<Drives />} />
        <Route path="/incharge/applications" element={<Applications />} />
        <Route path="/incharge/analytics" element={<Analytics />} />
        <Route path="/incharge/no-dues" element={<NoDues />} />
        <Route path="/incharge/reports" element={<Reports />} />
      </Route>

      <Route
        element={
          <ProtectedRoute role="student">
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="/student/applications" element={<StudentApplications />} />
        <Route path="/student/offers" element={<StudentOffers />} />
        <Route path="/student/clearance" element={<StudentClearance />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
