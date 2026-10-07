import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSubscriptionApi, getUsageApi } from '../api/client';

interface SubscriptionData {
  id: string;
  organizationId: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: {
    id: string;
    name: string;
    priceInPaise: number;
    seatLimit: number;
    projectLimit: number | null;
    apiRequestLimit: number;
    advancedAnalytics: boolean;
  };
}

interface UsageData {
  organizationId: string;
  apiRequests: number;
  apiRequestLimit: number;
  periodStart: string;
  periodEnd: string;
}

export const Dashboard: React.FC = () => {
  const { user, accessToken } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [subRes, usageRes] = await Promise.all([
        getSubscriptionApi(accessToken),
        getUsageApi(accessToken),
      ]);
      setSubscription(subRes.subscription);
      setUsage(usageRes.usage);
    } catch (err: any) {
      setError(err.message || 'Unable to load organization dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accessToken]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-900 animate-pulse rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-36 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          <div className="h-36 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          <div className="h-36 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-950/80 border border-rose-800 text-rose-200 p-6 rounded-xl space-y-4">
        <div className="flex items-center space-x-2 font-semibold">
          <span>Failed to load Dashboard</span>
        </div>
        <p className="text-sm text-rose-300">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-rose-900 hover:bg-rose-800 text-xs font-medium text-white rounded-lg transition-colors"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  const plan = subscription?.plan;
  const priceFormatted = plan
    ? plan.priceInPaise === 0
      ? 'Free'
      : `₹${(plan.priceInPaise / 100).toLocaleString('en-IN')}/mo`
    : 'N/A';

  const apiRequestsCount = usage?.apiRequests ?? 0;
  const apiRequestsLimit = usage?.apiRequestLimit ?? plan?.apiRequestLimit ?? 1000;
  const apiPercentage = Math.min(
    100,
    Math.round((apiRequestsCount / (apiRequestsLimit || 1)) * 100),
  );

  return (
    <div className="space-y-8 font-sans">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Organization Overview</h2>
          <p className="text-slate-400 text-xs mt-1">
            Organization ID: <span className="font-mono text-slate-300">{user?.organizationId}</span>
          </p>
        </div>
        {subscription && (
          <div className="flex items-center space-x-3 bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
            <span className="text-xs font-mono text-slate-400">Status:</span>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 uppercase tracking-wider">
              {subscription.status}
            </span>
          </div>
        )}
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Subscription Plan */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3 shadow-lg">
          <div className="flex justify-between items-center text-xs font-medium text-slate-400">
            <span>Subscription Plan</span>
            <span className="text-emerald-400 font-semibold">{priceFormatted}</span>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {plan?.name || 'Free'} Plan
          </div>
          <div className="text-xs text-slate-400">
            Advanced Analytics:{' '}
            <span className={plan?.advancedAnalytics ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
              {plan?.advancedAnalytics ? 'Included' : 'Not Included'}
            </span>
          </div>
        </div>

        {/* Card 2: Seat Limit */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3 shadow-lg">
          <div className="flex justify-between items-center text-xs font-medium text-slate-400">
            <span>Member Seat Limit</span>
            <span className="text-sky-400 font-semibold">Active Plan</span>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {plan?.seatLimit ?? 3} Seats
          </div>
          <div className="text-xs text-slate-400">
            Maximum seats allocated under {plan?.name || 'Free'} plan
          </div>
        </div>

        {/* Card 3: Project Limit */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3 shadow-lg">
          <div className="flex justify-between items-center text-xs font-medium text-slate-400">
            <span>Project Limit</span>
            <span className="text-sky-400 font-semibold">Entitlement</span>
          </div>
          <div className="text-2xl font-extrabold text-white">
            {plan?.projectLimit === null ? 'Unlimited' : `${plan?.projectLimit ?? 2} Projects`}
          </div>
          <div className="text-xs text-slate-400">
            {plan?.projectLimit === null ? 'No project limit enforced' : `Max ${plan?.projectLimit} active projects`}
          </div>
        </div>

        {/* Card 4: API Request Usage */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3 shadow-lg">
          <div className="flex justify-between items-center text-xs font-medium text-slate-400">
            <span>API Usage</span>
            <span className="text-emerald-400 font-mono font-semibold">{apiPercentage}%</span>
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {apiRequestsCount.toLocaleString()} <span className="text-sm font-normal text-slate-400">/ {apiRequestsLimit.toLocaleString()}</span>
          </div>
          {/* Usage Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                apiPercentage >= 90 ? 'bg-rose-500' : apiPercentage >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${apiPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Usage Period Detail */}
      {usage && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
          <h3 className="text-base font-semibold text-white">Current Usage Period Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono text-slate-300">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider mb-1">Period Start</span>
              {new Date(usage.periodStart).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider mb-1">Period End</span>
              {new Date(usage.periodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider mb-1">Requests Remaining</span>
              {Math.max(0, apiRequestsLimit - apiRequestsCount).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
