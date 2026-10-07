import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tasks } from '../pages/Tasks';
import * as ApiClientModule from '../api/client';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../api/client');
  return {
    ...actual,
    getTasksApi: vi.fn(),
    createTaskApi: vi.fn(),
    updateTaskApi: vi.fn(),
    updateTaskStatusApi: vi.fn(),
    assignTaskApi: vi.fn(),
    getProjectsApi: vi.fn(),
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

describe('Tasks Component', () => {
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
    (ApiClientModule.getProjectsApi as any).mockResolvedValue({
      code: 'PROJECTS_RETRIEVED',
      projects: [
        { id: 'proj-1', name: 'Project Alpha', status: 'ACTIVE' },
      ],
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

  it('renders tasks when API resolves successfully', async () => {
    (ApiClientModule.getTasksApi as any).mockResolvedValue({
      code: 'TASKS_RETRIEVED',
      tasks: [
        {
          id: 'task-1',
          projectId: 'proj-1',
          title: 'Implement Auth Integration',
          description: 'Connect JWT login endpoint',
          status: 'IN_PROGRESS',
          createdAt: '2026-10-02T00:00:00Z',
          updatedAt: '2026-10-02T00:00:00Z',
          project: { id: 'proj-1', name: 'Project Alpha' },
          assignee: { id: 'user-1', name: 'Admin User', email: 'admin@example.com' },
        },
      ],
    });

    render(<Tasks />);

    expect(await screen.findByText('Implement Auth Integration')).toBeInTheDocument();
    expect(screen.getByText('Connect JWT login endpoint')).toBeInTheDocument();
    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThan(0);
  });

  it('renders empty task state when no tasks exist', async () => {
    (ApiClientModule.getTasksApi as any).mockResolvedValue({
      code: 'TASKS_RETRIEVED',
      tasks: [],
    });

    render(<Tasks />);

    expect(await screen.findByText('No tasks found.')).toBeInTheDocument();
  });

  it('validates required fields during task creation', async () => {
    (ApiClientModule.getTasksApi as any).mockResolvedValue({
      code: 'TASKS_RETRIEVED',
      tasks: [],
    });

    render(<Tasks />);

    const createBtn = await screen.findByRole('button', { name: /\+ create task/i });
    fireEvent.click(createBtn);

    const submitBtn = screen.getByRole('button', { name: /^create task$/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Task title is required')).toBeInTheDocument();
    expect(ApiClientModule.createTaskApi).not.toHaveBeenCalled();
  });

  it('triggers updateTaskStatusApi when status selector is changed', async () => {
    (ApiClientModule.getTasksApi as any).mockResolvedValue({
      code: 'TASKS_RETRIEVED',
      tasks: [
        {
          id: 'task-1',
          projectId: 'proj-1',
          title: 'Fix styling bug',
          status: 'TODO',
          createdAt: '2026-10-03T00:00:00Z',
          updatedAt: '2026-10-03T00:00:00Z',
          project: { id: 'proj-1', name: 'Project Alpha' },
        },
      ],
    });
    (ApiClientModule.updateTaskStatusApi as any).mockResolvedValue({
      code: 'TASK_STATUS_UPDATED',
      message: 'Task status updated successfully',
    });

    render(<Tasks />);

    const statusSelect = await screen.findByDisplayValue('TODO');
    fireEvent.change(statusSelect, { target: { value: 'COMPLETED' } });

    await waitFor(() => {
      expect(ApiClientModule.updateTaskStatusApi).toHaveBeenCalledWith(
        'task-1',
        'COMPLETED',
        'test-token',
      );
    });
  });

  it('restricts creation UI for MEMBER role', async () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-member',
        organizationId: 'org-12345678',
        role: 'MEMBER',
      },
    });
    (ApiClientModule.getTasksApi as any).mockResolvedValue({
      code: 'TASKS_RETRIEVED',
      tasks: [],
    });

    render(<Tasks />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /\+ create task/i })).not.toBeInTheDocument();
    });
  });
});
