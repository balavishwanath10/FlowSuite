import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    organizationName?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errors: typeof fieldErrors = {};

    if (!name.trim() || name.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (!organizationName.trim() || organizationName.trim().length < 2) {
      errors.organizationName = 'Organization name must be at least 2 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        organizationName: organizationName.trim(),
      });
      navigate('/');
    } catch (err: any) {
      setApiError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-2xl font-bold tracking-tight text-white">FlowSuite</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Register your organization and Owner account.
        </p>

        {apiError && (
          <div className="bg-rose-950/80 border border-rose-800 text-rose-200 text-xs p-3 rounded-lg flex items-center space-x-2">
            <span className="font-semibold">Error:</span>
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className={`w-full bg-slate-950 border ${
                fieldErrors.name ? 'border-rose-500' : 'border-slate-800'
              } rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors`}
            />
            {fieldErrors.name && (
              <span className="text-rose-400 text-[11px] mt-1 block">{fieldErrors.name}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className={`w-full bg-slate-950 border ${
                fieldErrors.email ? 'border-rose-500' : 'border-slate-800'
              } rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors`}
            />
            {fieldErrors.email && (
              <span className="text-rose-400 text-[11px] mt-1 block">{fieldErrors.email}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`w-full bg-slate-950 border ${
                fieldErrors.password ? 'border-rose-500' : 'border-slate-800'
              } rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors`}
            />
            {fieldErrors.password && (
              <span className="text-rose-400 text-[11px] mt-1 block">{fieldErrors.password}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Acme Corp"
              className={`w-full bg-slate-950 border ${
                fieldErrors.organizationName ? 'border-rose-500' : 'border-slate-800'
              } rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors`}
            />
            {fieldErrors.organizationName && (
              <span className="text-rose-400 text-[11px] mt-1 block">
                {fieldErrors.organizationName}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg transition-colors shadow-lg shadow-emerald-950/50"
          >
            {isSubmitting ? 'Creating Account...' : 'Register Account'}
          </button>
        </form>

        <div className="border-t border-slate-800 pt-4 text-center text-xs text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-emerald-400 hover:underline font-medium">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
