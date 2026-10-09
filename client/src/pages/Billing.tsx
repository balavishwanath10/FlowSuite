import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  createCheckoutSessionApi,
  getPlansApi,
  getSubscriptionApi,
  getUsageApi,
  Plan,
  ApiError,
} from '../api/client';

export const Billing: React.FC = () => {
  const { accessToken, user } = useAuth();
  const [subscription, setSubscription] = useState<any | null>(null);
  const [usage, setUsage] = useState<any | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessRestricted, setAccessRestricted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [checkoutLoadingPlanId, setCheckoutLoadingPlanId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentNoticeDismissed, setPaymentNoticeDismissed] = useState(false);

  const hasCheckoutSessionParam =
    !paymentNoticeDismissed &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('session_id');

  const isOwner = user?.role === 'OWNER';

  const fetchData = async (isManualRefresh = false) => {
    if (!accessToken) return;

    if (user?.role && !['OWNER', 'ADMIN'].includes(user.role)) {
      setAccessRestricted(true);
      setLoading(false);
      return;
    }

    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);
    setPlansError(null);
    setAccessRestricted(false);

    try {
      const [subRes, usageRes, plansRes] = await Promise.allSettled([
        getSubscriptionApi(accessToken),
        getUsageApi(accessToken),
        getPlansApi(accessToken),
      ]);

      if (subRes.status === 'rejected') {
        const err = subRes.reason;
        if (err instanceof ApiError && err.code === 'INSUFFICIENT_ROLE') {
          setAccessRestricted(true);
          return;
        }
        throw err;
      }
      setSubscription(subRes.value.subscription);

      if (usageRes.status === 'rejected') {
        const err = usageRes.reason;
        if (err instanceof ApiError && err.code === 'INSUFFICIENT_ROLE') {
          setAccessRestricted(true);
          return;
        }
        throw err;
      }
      setUsage(usageRes.value.usage);

      if (plansRes.status === 'fulfilled' && plansRes.value.plans && plansRes.value.plans.length > 0) {
        setPlans(plansRes.value.plans);
        setPlansError(null);
      } else {
        setPlans([]);
        setPlansError('Subscription plans catalog is currently unavailable.');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_ROLE') {
        setAccessRestricted(true);
      } else {
        setError(err.message || 'Failed to load subscription and usage details.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accessToken, user?.role]);

  const handleCheckout = async (planId: string) => {
    if (!accessToken || !isOwner) return;

    setCheckoutLoadingPlanId(planId);
    setCheckoutError(null);

    try {
      const response = await createCheckoutSessionApi(planId, accessToken);
      if (response.url) {
        window.location.href = response.url;
      } else {
        setCheckoutError('Checkout session URL was not returned by server.');
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Failed to initiate checkout session.');
    } finally {
      setCheckoutLoadingPlanId(null);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (priceInPaise?: number) => {
    if (priceInPaise === undefined || priceInPaise === null) return 'N/A';
    const rupees = priceInPaise / 100;
    return rupees === 0 ? '₹0' : `₹${rupees.toLocaleString('en-IN')}`;
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-48 bg-gray-100 rounded-lg"></div>
          <div className="h-48 bg-gray-100 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (accessRestricted) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription & Billing</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your organization's subscription plan and monitor API usage.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-lg shadow-sm">
          <div className="flex items-start">
            <svg
              className="w-6 h-6 text-amber-600 mr-3 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h3 className="font-semibold text-lg">Access Restricted</h3>
              <p className="mt-1 text-sm text-amber-700">
                Subscription and billing management details are reserved for Organization Owners and Administrators.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription & Billing</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your organization's subscription plan and monitor API usage.
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg shadow-sm">
          <p className="font-medium">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-4 px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.plan;
  const statusText = subscription?.status ?? 'N/A';
  const planNameText = currentPlan?.name ? `${currentPlan.name} Plan` : 'N/A';
  const priceText = currentPlan?.priceInPaise !== undefined ? formatCurrency(currentPlan.priceInPaise) : 'N/A';
  const seatLimitText = currentPlan?.seatLimit !== undefined ? `${currentPlan.seatLimit} seats` : 'N/A';
  const projectLimitText = currentPlan?.projectLimit === null
    ? 'Unlimited projects'
    : currentPlan?.projectLimit !== undefined
    ? `${currentPlan.projectLimit} projects`
    : 'N/A';
  const apiLimitText = currentPlan?.apiRequestLimit !== undefined
    ? `${currentPlan.apiRequestLimit.toLocaleString()} requests/mo`
    : 'N/A';
  const analyticsText = currentPlan?.advancedAnalytics !== undefined
    ? (currentPlan.advancedAnalytics ? 'Included' : 'Not included')
    : 'N/A';

  const apiRequests = usage?.apiRequests;
  const apiRequestLimit = usage?.apiRequestLimit ?? currentPlan?.apiRequestLimit;
  const usagePercentage = (apiRequests !== undefined && apiRequestLimit)
    ? Math.min(100, Math.round((apiRequests / Math.max(1, apiRequestLimit)) * 100))
    : null;

  let progressBarColor = 'bg-indigo-600';
  if (usagePercentage !== null) {
    if (usagePercentage >= 95) {
      progressBarColor = 'bg-red-600';
    } else if (usagePercentage >= 80) {
      progressBarColor = 'bg-amber-500';
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription & Billing</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage your organization's subscription plan and monitor API usage.
        </p>
      </div>

      {/* Stripe Checkout Return Banner */}
      {hasCheckoutSessionParam && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm gap-3">
          <div className="flex items-center space-x-3">
            <svg
              className="w-5 h-5 text-blue-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium">
              You've returned from Stripe Checkout. Your subscription status will reflect the backend's verified update when checkout processing is complete.
            </span>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="text-xs text-blue-700 hover:text-blue-900 font-semibold px-3 py-1.5 rounded bg-blue-100 hover:bg-blue-200 border border-blue-200 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Subscription'}
            </button>
            <button
              onClick={() => setPaymentNoticeDismissed(true)}
              className="text-xs text-gray-600 hover:text-gray-900 font-semibold px-2 py-1.5 rounded hover:bg-blue-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Checkout Error Banner */}
      {checkoutError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center justify-between shadow-sm">
          <span className="text-sm font-medium">{checkoutError}</span>
          <button
            onClick={() => setCheckoutError(null)}
            className="text-xs text-red-700 hover:text-red-900 font-semibold px-2 py-1 rounded bg-red-100 hover:bg-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Overview Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Subscription Overview</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  statusText === 'ACTIVE'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {statusText}
              </span>
            </div>

            <div className="mb-6">
              <div className="text-3xl font-bold text-gray-900">{planNameText}</div>
              <div className="text-sm text-gray-500 mt-1">
                {priceText} {priceText !== 'N/A' && '/ month'}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Billing Period</span>
                <span className="font-medium text-gray-900">
                  {formatDate(subscription?.currentPeriodStart)} – {formatDate(subscription?.currentPeriodEnd)}
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Seat Limit</span>
                <span className="font-medium text-gray-900">{seatLimitText}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Project Limit</span>
                <span className="font-medium text-gray-900">{projectLimitText}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>API Request Limit</span>
                <span className="font-medium text-gray-900">{apiLimitText}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Advanced Analytics</span>
                <span className="font-medium text-gray-900">{analyticsText}</span>
              </div>
            </div>
          </div>
        </div>

        {/* API Usage Overview Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">API Usage Overview</h2>

            <div className="mb-6">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-2xl font-bold text-gray-900">
                  {apiRequests !== undefined ? apiRequests.toLocaleString() : 'N/A'}
                </span>
                <span className="text-sm text-gray-500 font-medium">
                  / {apiRequestLimit !== undefined ? apiRequestLimit.toLocaleString() : 'N/A'} requests
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${progressBarColor}`}
                  style={{ width: `${usagePercentage ?? 0}%` }}
                ></div>
              </div>

              <div className="flex justify-between text-xs text-gray-500 mt-2 font-medium">
                <span>{usagePercentage !== null ? `${usagePercentage}% used` : 'N/A'}</span>
                <span>
                  Resets: {formatDate(usage?.periodEnd || subscription?.currentPeriodEnd)}
                </span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 text-xs text-gray-500 space-y-1">
              <p>• Usage counter reflects API calls consumed in the current billing cycle.</p>
              <p>• If limits are exceeded, rate limits will apply until the next cycle reset.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Catalog Section */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Available Subscription Plans</h2>
          <p className="text-gray-500 text-sm mt-1">
            Choose a plan tailored to your team's project, seat, and API capacity needs.
          </p>
        </div>

        {plansError || plans.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 text-gray-700 p-6 rounded-lg shadow-sm text-center">
            <p className="font-medium text-sm">
              {plansError || 'Subscription plans catalog is currently unavailable.'}
            </p>
            <button
              onClick={() => fetchData()}
              className="mt-3 px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 text-xs shadow-sm"
            >
              Retry Loading Plans
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrentPlan =
                subscription?.planId === plan.id ||
                (subscription?.plan?.name &&
                  subscription.plan.name.toLowerCase() === plan.name.toLowerCase());

              const isFreePlan = plan.priceInPaise === 0;
              const isCheckoutLoading = checkoutLoadingPlanId === plan.id;

              return (
                <div
                  key={plan.id || plan.name}
                  className={`bg-white border rounded-lg p-6 shadow-sm flex flex-col justify-between relative ${
                    isCurrentPlan ? 'border-indigo-600 ring-2 ring-indigo-600 ring-opacity-20' : 'border-gray-200'
                  }`}
                >
                  {isCurrentPlan && (
                    <div className="absolute -top-3 right-4 bg-indigo-600 text-white text-xs px-2.5 py-0.5 rounded-full font-semibold">
                      Current Plan
                    </div>
                  )}

                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                    <div className="mt-2 mb-6">
                      <span className="text-3xl font-extrabold text-gray-900">
                        {formatCurrency(plan.priceInPaise)}
                      </span>
                      <span className="text-gray-500 text-sm"> / month</span>
                    </div>

                    <ul className="space-y-3 text-sm text-gray-600 mb-6 border-t border-gray-100 pt-4">
                      <li className="flex items-center">
                        <svg
                          className="w-4 h-4 text-emerald-500 mr-2 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {plan.seatLimit} seats included
                      </li>
                      <li className="flex items-center">
                        <svg
                          className="w-4 h-4 text-emerald-500 mr-2 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {plan.projectLimit === null ? 'Unlimited projects' : `${plan.projectLimit} projects`}
                      </li>
                      <li className="flex items-center">
                        <svg
                          className="w-4 h-4 text-emerald-500 mr-2 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {plan.apiRequestLimit.toLocaleString()} API requests/mo
                      </li>
                      <li className="flex items-center">
                        <svg
                          className={`w-4 h-4 mr-2 flex-shrink-0 ${
                            plan.advancedAnalytics ? 'text-emerald-500' : 'text-gray-300'
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          {plan.advancedAnalytics ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          )}
                        </svg>
                        <span className={plan.advancedAnalytics ? 'text-gray-700' : 'text-gray-400'}>
                          Advanced Analytics
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    {isCurrentPlan ? (
                      <button
                        disabled
                        className="w-full py-2 px-4 rounded-md text-sm font-medium bg-gray-100 text-gray-500 cursor-not-allowed border border-gray-200"
                      >
                        Current Plan
                      </button>
                    ) : isFreePlan ? (
                      <button
                        disabled
                        className="w-full py-2 px-4 rounded-md text-sm font-medium bg-gray-100 text-gray-500 cursor-not-allowed border border-gray-200"
                      >
                        Free Plan
                      </button>
                    ) : isOwner ? (
                      <button
                        onClick={() => handleCheckout(plan.id)}
                        disabled={isCheckoutLoading}
                        className="w-full py-2 px-4 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {isCheckoutLoading ? 'Redirecting...' : `Upgrade to ${plan.name}`}
                      </button>
                    ) : (
                      <button
                        disabled
                        title="Only organization owners can upgrade plans"
                        className="w-full py-2 px-4 rounded-md text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                      >
                        Upgrade (Owner Only)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Billing;
