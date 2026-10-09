import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogs } from '../pages/AuditLogs';
import * as ApiClientModule from '../api/client';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../api/client');
  return {
    ...actual,
    getAuditLogsApi: vi.fn(),
    getMembersApi: vi.fn(),
  };
});

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('AuditLogs Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-1',
        organizationId: 'org-12345678',
        role: 'ADMIN',
      },
    });
    (ApiClientModule.getMembersApi as any).mockResolvedValue({
      code: 'MEMBERS_RETRIEVED',
      members: [
        {
          id: 'mem-1',
          userId: 'user-1',
          organizationId: 'org-12345678',
          role: 'ADMIN',
          user: { id: 'user-1', name: 'Admin User', email: 'admin@example.com' },
        },
      ],
    });
  });

  it('renders audit logs and pagination details when API resolves successfully', async () => {
    (ApiClientModule.getAuditLogsApi as any).mockResolvedValue({
      code: 'AUDIT_LOGS_RETRIEVED',
      auditLogs: [
        {
          id: 'log-1',
          organizationId: 'org-12345678',
          actorId: 'user-1',
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: 'proj-12345678',
          metadata: { projectName: 'Website Redesign' },
          createdAt: '2026-10-08T10:00:00Z',
          actor: { id: 'user-1', name: 'Admin User', email: 'admin@example.com' },
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    render(<AuditLogs />);

    expect((await screen.findAllByText('PROJECT_CREATED')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Admin User \(admin@example.com\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Project #proj-123/i)).toBeInTheDocument();
    expect(screen.getByText(/Website Redesign/i)).toBeInTheDocument();
  });

  it('renders empty audit logs state when no events exist', async () => {
    (ApiClientModule.getAuditLogsApi as any).mockResolvedValue({
      code: 'AUDIT_LOGS_RETRIEVED',
      auditLogs: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    render(<AuditLogs />);

    expect(await screen.findByText('No audit logs found.')).toBeInTheDocument();
  });

  it('filters audit logs by action', async () => {
    (ApiClientModule.getAuditLogsApi as any).mockResolvedValue({
      code: 'AUDIT_LOGS_RETRIEVED',
      auditLogs: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    render(<AuditLogs />);

    const actionSelect = await screen.findByDisplayValue('All Actions');
    fireEvent.change(actionSelect, { target: { value: 'TASK_CREATED' } });

    await waitFor(() => {
      expect(ApiClientModule.getAuditLogsApi).toHaveBeenCalledWith('test-token', {
        page: 1,
        limit: 20,
        action: 'TASK_CREATED',
        actorId: undefined,
      });
    });
  });

  it('filters audit logs by actor', async () => {
    (ApiClientModule.getAuditLogsApi as any).mockResolvedValue({
      code: 'AUDIT_LOGS_RETRIEVED',
      auditLogs: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    render(<AuditLogs />);

    const actorSelect = await screen.findByDisplayValue('All Actors');
    fireEvent.change(actorSelect, { target: { value: 'user-1' } });

    await waitFor(() => {
      expect(ApiClientModule.getAuditLogsApi).toHaveBeenCalledWith('test-token', {
        page: 1,
        limit: 20,
        action: undefined,
        actorId: 'user-1',
      });
    });
  });

  it('handles pagination navigation', async () => {
    (ApiClientModule.getAuditLogsApi as any).mockResolvedValue({
      code: 'AUDIT_LOGS_RETRIEVED',
      auditLogs: [
        {
          id: 'log-1',
          organizationId: 'org-12345678',
          actorId: 'user-1',
          action: 'MEMBER_INVITED',
          entityType: 'Membership',
          entityId: 'mem-123',
          metadata: null,
          createdAt: '2026-10-08T10:00:00Z',
          actor: null,
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 3,
      },
    });

    render(<AuditLogs />);

    const nextBtn = await screen.findByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(ApiClientModule.getAuditLogsApi).toHaveBeenCalledWith('test-token', {
        page: 2,
        limit: 20,
        action: undefined,
        actorId: undefined,
      });
    });
  });

  it('handles API error state and retry click', async () => {
    (ApiClientModule.getAuditLogsApi as any).mockRejectedValueOnce(
      new Error('Failed to fetch audit logs'),
    );

    render(<AuditLogs />);

    expect(await screen.findByText('Failed to fetch audit logs')).toBeInTheDocument();

    (ApiClientModule.getAuditLogsApi as any).mockResolvedValueOnce({
      code: 'AUDIT_LOGS_RETRIEVED',
      auditLogs: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(ApiClientModule.getAuditLogsApi).toHaveBeenCalledTimes(2);
    });
  });

  it('restricts access for roles other than OWNER/ADMIN', async () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-2',
        organizationId: 'org-12345678',
        role: 'MEMBER',
      },
    });

    render(<AuditLogs />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(ApiClientModule.getAuditLogsApi).not.toHaveBeenCalled();
  });

  it('handles backend 403 INSUFFICIENT_ROLE error even if frontend role allows request', async () => {
    (ApiClientModule.getAuditLogsApi as any).mockRejectedValue(
      new ApiClientModule.ApiError('INSUFFICIENT_ROLE', 'You do not have permission to perform this action'),
    );

    render(<AuditLogs />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
  });
});
