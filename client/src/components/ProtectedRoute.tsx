import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-sm font-medium text-slate-300">Loading FlowSuite session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
