import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Register } from '../pages/Register';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Register Component', () => {
  const mockRegister = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (AuthContextModule.useAuth as any).mockReturnValue({
      register: mockRegister,
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    });
  });

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <Register />
      </BrowserRouter>,
    );

  it('shows validation errors when fields are empty or invalid', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /register account/i }));

    expect(await screen.findByText(/full name must be at least 2 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/email address is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(screen.getByText(/organization name must be at least 2 characters/i)).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('handles registration API failure and displays error banner', async () => {
    mockRegister.mockRejectedValue(new Error('An account with this email already exists'));
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/jane doe/i), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText(/jane@company.com/i), {
      target: { value: 'existing@company.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/acme corp/i), {
      target: { value: 'Acme Inc' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register account/i }));

    expect(await screen.findByText(/an account with this email already exists/i)).toBeInTheDocument();
  });

  it('calls register function successfully on valid form submission', async () => {
    mockRegister.mockResolvedValue(undefined);
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/jane doe/i), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText(/jane@company.com/i), {
      target: { value: 'newuser@company.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/acme corp/i), {
      target: { value: 'Acme Corp' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'newuser@company.com',
        password: 'Password123',
        organizationName: 'Acme Corp',
      });
    });
  });
});
