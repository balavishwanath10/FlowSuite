import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../pages/Dashboard';
import * as ApiClientModule from '../api/client';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../api/client');
  return {
    ...actual,
    getSubscriptionApi: vi.fn(),
    getUsageApi: vi.fn(),
  };
});

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-1',
        organizationId: 'org-12345678',
      },
    });
  });

  it('renders plan entitlements and usage metrics when APIs resolve successfully', async () => {
    (ApiClientModule.getSubscriptionApi as any).mockResolvedValue({
      code: 'SUBSCRIPTION_RETRIEVED',
      subscription: {
        id: 'sub-1',
        organizationId: 'org-12345678',
        planId: 'plan-starter',
        status: 'ACTIVE',
        currentPeriodStart: '2026-10-01T00:00:00Z',
        currentPeriodEnd: '2026-11-01T00:00:00Z',
        plan: {
          id: 'plan-starter',
          name: 'Starter',
          priceInPaise: 49900,
          seatLimit: 10,
          projectLimit: 20,
          apiRequestLimit: 10000,
          advancedAnalytics: false,
        },
      },
    });

    (ApiClientModule.getUsageApi as any).mockResolvedValue({
      code: 'USAGE_RETRIEVED',
      usage: {
        organizationId: 'org-12345678',
        apiRequests: 1250,
        apiRequestLimit: 10000,
        periodStart: '2026-10-01T00:00:00Z',
        periodEnd: '2026-11-01T00:00:00Z',
      },
    });

    render(<Dashboard />);

    expect(await screen.findByText('Starter Plan')).toBeInTheDocument();
    expect(screen.getByText(/₹499\/mo/i)).toBeInTheDocument();
    expect(screen.getByText(/10 seats/i)).toBeInTheDocument();
    expect(screen.getByText(/20 projects/i)).toBeInTheDocument();
    expect(screen.getByText(/1,250/i)).toBeInTheDocument();
    expect(screen.getByText(/10,000/i)).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('renders API error state and handles retry click when API fails', async () => {
    (ApiClientModule.getSubscriptionApi as any).mockRejectedValue(
      new Error('Failed to fetch subscription data'),
    );
    (ApiClientModule.getUsageApi as any).mockRejectedValue(
      new Error('Failed to fetch usage data'),
    );

    render(<Dashboard />);

    expect(await screen.findByText(/failed to load dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/failed to fetch subscription data/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry loading/i });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(ApiClientModule.getSubscriptionApi).toHaveBeenCalledTimes(2);
    });
  });
});
