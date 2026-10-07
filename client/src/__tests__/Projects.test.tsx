import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Projects } from '../pages/Projects';
import * as ApiClientModule from '../api/client';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../api/client');
  return {
    ...actual,
    getProjectsApi: vi.fn(),
    createProjectApi: vi.fn(),
    updateProjectApi: vi.fn(),
    archiveProjectApi: vi.fn(),
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

describe('Projects Component', () => {
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

  it('renders projects when API resolves successfully', async () => {
    (ApiClientModule.getProjectsApi as any).mockResolvedValue({
      code: 'PROJECTS_RETRIEVED',
      projects: [
        {
          id: 'proj-1',
          organizationId: 'org-12345678',
          name: 'FlowSuite Frontend',
          description: 'React dashboard app',
          status: 'ACTIVE',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    });

    render(<Projects />);

    expect(await screen.findByText('FlowSuite Frontend')).toBeInTheDocument();
    expect(screen.getByText('React dashboard app')).toBeInTheDocument();
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
  });

  it('renders empty project state when no projects exist', async () => {
    (ApiClientModule.getProjectsApi as any).mockResolvedValue({
      code: 'PROJECTS_RETRIEVED',
      projects: [],
    });

    render(<Projects />);

    expect(await screen.findByText('No projects found.')).toBeInTheDocument();
  });

  it('validates required fields during project creation', async () => {
    (ApiClientModule.getProjectsApi as any).mockResolvedValue({
      code: 'PROJECTS_RETRIEVED',
      projects: [],
    });

    render(<Projects />);

    const createBtn = await screen.findByRole('button', { name: /\+ create project/i });
    fireEvent.click(createBtn);

    const submitBtn = screen.getByRole('button', { name: /^create project$/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Project name is required')).toBeInTheDocument();
    expect(ApiClientModule.createProjectApi).not.toHaveBeenCalled();
  });

  it('successfully creates a project when form is submitted', async () => {
    (ApiClientModule.getProjectsApi as any).mockResolvedValue({
      code: 'PROJECTS_RETRIEVED',
      projects: [],
    });
    (ApiClientModule.createProjectApi as any).mockResolvedValue({
      code: 'PROJECT_CREATED',
      message: 'Project created successfully',
      project: {
        id: 'proj-new',
        organizationId: 'org-12345678',
        name: 'New Mobile App',
        description: 'React Native',
        status: 'ACTIVE',
        createdAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z',
      },
    });

    render(<Projects />);

    const openBtn = await screen.findByRole('button', { name: /\+ create project/i });
    fireEvent.click(openBtn);

    const nameInput = screen.getByPlaceholderText(/website redesign/i);
    fireEvent.change(nameInput, { target: { value: 'New Mobile App' } });

    const submitBtn = screen.getByRole('button', { name: /^create project$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(ApiClientModule.createProjectApi).toHaveBeenCalledWith(
        { name: 'New Mobile App', description: undefined },
        'test-token',
      );
    });
  });

  it('hides create button for MEMBER role', async () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      accessToken: 'test-token',
      user: {
        userId: 'user-member',
        organizationId: 'org-12345678',
        role: 'MEMBER',
      },
    });
    (ApiClientModule.getProjectsApi as any).mockResolvedValue({
      code: 'PROJECTS_RETRIEVED',
      projects: [],
    });

    render(<Projects />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /\+ create project/i })).not.toBeInTheDocument();
    });
  });
});
