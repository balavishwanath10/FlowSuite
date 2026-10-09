import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Billing } from '../pages/Billing';
import * as ApiClientModule from '../api/client';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../api/client');
  return {
    ...actual,
    getSubscriptionApi: vi.fn(),
    getUsageApi: vi.fn(),
    getPlansApi: vi.fn(),
    createCheckoutSessionApi: vi.fn(),
  };
});

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Billing Component', () => {
  const mockSubscription = {
    id: 'sub-1',
    organizationId: 'org-1',
    planId: 'plan-free',
    status: 'ACTIVE',
    currentPeriodStart: '2026-10-01T00:00:00.000Z',
    currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    plan: {
      id: 'plan-free',
      name: 'Free',
      priceInPaise: 0,
      seatLimit: 3,
      projectLimit: 2,
      apiRequestLimit: 1000,
      advancedAnalytics: false,
    },
  };

  const mockUsage = {
    organizationId: 'org-1',
    apiRequests: 150,
    apiRequestLimit: 1000,
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-11-01T00:00:00.000Z',
  };

  const mockPlans = [
    {
      id: 'plan-free',
      name: 'Free',
      priceInPaise: 0,
      seatLimit: 3,
      projectLimit: 2,
      apiRequestLimit: 1000,
      advancedAnalytics: false,
    },
    {
      id: 'plan-starter',
      name: 'Starter',
      priceInPaise: 49900,
      seatLimit: 10,
      projectLimit: 20,
      apiRequestLimit: 10000,
      advancedAnalytics: false,
    },
    {
      id: 'plan-professional',
      name: 'Professional',
      priceInPaise: 99900,
      seatLimit: 50,
      projectLimit: null,
      apiRequestLimit: 100000,
      advancedAnalytics: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      },
    });

    (ApiClientModule.getSubscriptionApi as any).mockResolvedValue({
      code: 'SUBSCRIPTION_RETRIEVED',
      subscription: mockSubscription,
    });

    (ApiClientModule.getUsageApi as any).mockResolvedValue({
      code: 'USAGE_RETRIEVED',
      usage: mockUsage,
    });

    (ApiClientModule.getPlansApi as any).mockResolvedValue({
      code: 'PLANS_RETRIEVED',
      plans: mockPlans,
    });
  });

  it('renders subscription and usage details when API calls resolve', async () => {
    render(<Billing />);

    expect(await screen.findByText('Subscription & Billing')).toBeInTheDocument();
    expect(screen.getByText('Free Plan')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('/ 1,000 requests')).toBeInTheDocument();
    expect(screen.getByText('15% used')).toBeInTheDocument();

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('triggers Stripe checkout session creation for OWNER when Upgrade button is clicked', async () => {
    delete (window as any).location;
    (window as any).location = { href: '', search: '' };

    (ApiClientModule.createCheckoutSessionApi as any).mockResolvedValue({
      code: 'CHECKOUT_SESSION_CREATED',
      sessionId: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    });

    render(<Billing />);

    const upgradeBtn = await screen.findByRole('button', { name: /Upgrade to Starter/i });
    fireEvent.click(upgradeBtn);

    await waitFor(() => {
      expect(ApiClientModule.createCheckoutSessionApi).toHaveBeenCalledWith(
        'plan-starter',
        'test-token',
      );
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_123');
    });
  });

  it('disables upgrade action for non-OWNER (ADMIN) users', async () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-2',
        organizationId: 'org-1',
        role: 'ADMIN',
      },
    });

    render(<Billing />);

    expect(await screen.findByText('Subscription & Billing')).toBeInTheDocument();
    const ownerOnlyButtons = screen.getAllByText('Upgrade (Owner Only)');
    expect(ownerOnlyButtons.length).toBeGreaterThan(0);
    expect(ownerOnlyButtons[0]).toBeDisabled();
  });

  it('displays Access Restricted banner for MANAGER/MEMBER roles', async () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-3',
        organizationId: 'org-1',
        role: 'MEMBER',
      },
    });

    render(<Billing />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(ApiClientModule.getSubscriptionApi).not.toHaveBeenCalled();
  });

  it('displays Access Restricted banner when API throws 403 INSUFFICIENT_ROLE error', async () => {
    (ApiClientModule.getSubscriptionApi as any).mockRejectedValue(
      new ApiClientModule.ApiError('INSUFFICIENT_ROLE', 'You do not have permission'),
    );

    render(<Billing />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
  });

  it('displays neutral checkout return notice and triggers refresh when Refresh button is clicked', async () => {
    delete (window as any).location;
    (window as any).location = { href: '', search: '?session_id=cs_test_999' };

    render(<Billing />);

    expect(
      await screen.findByText(
        /You've returned from Stripe Checkout\. Your subscription status will reflect the backend's verified update/i,
      ),
    ).toBeInTheDocument();

    const refreshBtn = screen.getByRole('button', { name: /Refresh Subscription/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(ApiClientModule.getSubscriptionApi).toHaveBeenCalledTimes(2);
      expect(ApiClientModule.getUsageApi).toHaveBeenCalledTimes(2);
    });
  });

  it('displays plans catalog error state and retry button when plans API fails', async () => {
    (ApiClientModule.getPlansApi as any).mockResolvedValueOnce({
      code: 'PLANS_RETRIEVED',
      plans: [],
    });

    render(<Billing />);

    expect(
      await screen.findByText('Subscription plans catalog is currently unavailable.'),
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Upgrade to Starter/i })).not.toBeInTheDocument();

    (ApiClientModule.getPlansApi as any).mockResolvedValueOnce({
      code: 'PLANS_RETRIEVED',
      plans: mockPlans,
    });

    const retryPlansBtn = screen.getByRole('button', { name: /Retry Loading Plans/i });
    fireEvent.click(retryPlansBtn);

    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument();
    });
  });

  it('displays error banner with Retry button on subscription API failure', async () => {
    (ApiClientModule.getSubscriptionApi as any).mockRejectedValueOnce(
      new Error('Failed to retrieve subscription details'),
    );

    render(<Billing />);

    expect(
      await screen.findByText('Failed to retrieve subscription details'),
    ).toBeInTheDocument();

    (ApiClientModule.getSubscriptionApi as any).mockResolvedValueOnce({
      code: 'SUBSCRIPTION_RETRIEVED',
      subscription: mockSubscription,
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(ApiClientModule.getSubscriptionApi).toHaveBeenCalledTimes(2);
    });
  });

  it('displays N/A placeholders when backend subscription response has missing fields', async () => {
    (ApiClientModule.getSubscriptionApi as any).mockResolvedValue({
      code: 'SUBSCRIPTION_RETRIEVED',
      subscription: {
        id: 'sub-incomplete',
        organizationId: 'org-1',
        planId: 'plan-unknown',
        status: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        plan: null,
      },
    });

    (ApiClientModule.getUsageApi as any).mockResolvedValue({
      code: 'USAGE_RETRIEVED',
      usage: {
        organizationId: 'org-1',
        apiRequests: undefined,
        apiRequestLimit: undefined,
      },
    });

    render(<Billing />);

    expect((await screen.findAllByText('N/A')).length).toBeGreaterThan(0);
    expect(screen.getByText('/ N/A requests')).toBeInTheDocument();
  });
});
