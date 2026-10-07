import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../components/ProtectedRoute';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when auth is initializing', () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Secret Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading flowsuite session/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret content/i)).not.toBeInTheDocument();
  });

  it('redirects to /login when user is not authenticated', () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Secret Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/login page/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret content/i)).not.toBeInTheDocument();
  });

  it('renders protected content when user is authenticated', () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { userId: 'u-1', organizationId: 'org-1' },
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Secret Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/secret content/i)).toBeInTheDocument();
  });
});
