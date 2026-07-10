import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import WholesaleDashboard from './pages/wholesale/WholesaleDashboard';
import CustomersPage from './pages/admin/CustomersPage';
import PlansPage from './pages/admin/PlansPage';
import PricingPage from './pages/admin/PricingPage';
import ServersPage from './pages/admin/ServersPage';
import OrdersPage from './pages/admin/OrdersPage';
import ReportsPage from './pages/admin/ReportsPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import SettingsPage from './pages/admin/SettingsPage';
import WholesaleEndUsersPage from './pages/wholesale/EndUsersPage';
import WholesaleWalletPage from './pages/wholesale/WalletPage';
import WholesaleCreateConfigPage from './pages/wholesale/CreateConfigPage';
import WholesaleOrdersPage from './pages/wholesale/OrdersPage';
import WholesaleInvoicesPage from './pages/wholesale/InvoicesPage';
import NotFoundPage from './pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                
                {/* Admin Routes */}
                <Route path="/admin" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/customers" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <CustomersPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/plans" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <PlansPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/pricing" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <PricingPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/servers" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <ServersPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/orders" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <OrdersPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/reports" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <ReportsPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/audit-logs" element={
                  <ProtectedRoute roles={['super_admin']}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/settings" element={
                  <ProtectedRoute roles={['super_admin', 'admin']}>
                    <SettingsPage />
                  </ProtectedRoute>
                } />

                {/* Wholesale Customer Routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute roles={['wholesale']}>
                    <WholesaleDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/end-users" element={
                  <ProtectedRoute roles={['wholesale']}>
                    <WholesaleEndUsersPage />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/wallet" element={
                  <ProtectedRoute roles={['wholesale']}>
                    <WholesaleWalletPage />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/create-config" element={
                  <ProtectedRoute roles={['wholesale']}>
                    <WholesaleCreateConfigPage />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/orders" element={
                  <ProtectedRoute roles={['wholesale']}>
                    <WholesaleOrdersPage />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/invoices" element={
                  <ProtectedRoute roles={['wholesale']}>
                    <WholesaleInvoicesPage />
                  </ProtectedRoute>
                } />

                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              <Toaster 
                position="top-center"
                toastOptions={{
                  className: 'dark:bg-gray-800 dark:text-white',
                }}
              />
            </div>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
