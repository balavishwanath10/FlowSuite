import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from '../pages/Login';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Login Component', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (AuthContextModule.useAuth as any).mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    });
  });

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>,
    );

  it('shows client-side validation errors when submitting empty form', async () => {
    renderComponent();

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/email address is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows client-side validation error for invalid email format', async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/user@organization.com/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('handles login API failure cleanly and displays safe error message', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid email or password'));
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/user@organization.com/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'WrongPassword123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('calls login function successfully on valid credentials', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/user@organization.com/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'CorrectPassword123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'CorrectPassword123',
      });
    });
  });
});
