import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Tasks } from './pages/Tasks';
import { PlaceholderModule } from './pages/PlaceholderModule';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route
                path="/customers"
                element={
                  <PlaceholderModule
                    title="Customer Directory"
                    description="Organization customer CRUD and customer-project association endpoints are backend-enforced under /api/v1/customers."
                  />
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <PlaceholderModule
                    title="Organization Audit Logs"
                    description="Paginated and filtered system audit log retrieval is backend-enforced for OWNER and ADMIN roles under /api/v1/audit-logs."
                  />
                }
              />
              <Route
                path="/billing"
                element={
                  <PlaceholderModule
                    title="Subscription & Billing Management"
                    description="Stripe test-mode checkout session generation and plan upgrades are backend-enforced under /api/v1/billing/checkout."
                  />
                }
              />
            </Route>
          </Route>

          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
