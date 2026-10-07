import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Customers } from '../pages/Customers';
import * as ApiClientModule from '../api/client';
import * as AuthContextModule from '../context/AuthContext';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../api/client');
  return {
    ...actual,
    getCustomersApi: vi.fn(),
    createCustomerApi: vi.fn(),
    updateCustomerApi: vi.fn(),
    deleteCustomerApi: vi.fn(),
    getCustomerProjectsApi: vi.fn(),
    linkCustomerProjectApi: vi.fn(),
    unlinkCustomerProjectApi: vi.fn(),
    getProjectsApi: vi.fn(),
  };
});

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof AuthContextModule>('../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Customers Component', () => {
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
        { id: 'proj-2', name: 'Project Beta', status: 'ACTIVE' },
      ],
    });
  });

  it('renders customers when API resolves successfully', async () => {
    (ApiClientModule.getCustomersApi as any).mockResolvedValue({
      code: 'CUSTOMERS_RETRIEVED',
      customers: [
        {
          id: 'cust-1',
          organizationId: 'org-12345678',
          name: 'Acme Corporation',
          email: 'contact@acme.com',
          phone: '+1 555-0199',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    });

    render(<Customers />);

    expect(await screen.findByText('Acme Corporation')).toBeInTheDocument();
    expect(screen.getByText('contact@acme.com')).toBeInTheDocument();
    expect(screen.getByText('+1 555-0199')).toBeInTheDocument();
  });

  it('renders empty customer state when no customers exist', async () => {
    (ApiClientModule.getCustomersApi as any).mockResolvedValue({
      code: 'CUSTOMERS_RETRIEVED',
      customers: [],
    });

    render(<Customers />);

    expect(await screen.findByText('No customers found.')).toBeInTheDocument();
  });

  it('validates required fields during customer creation', async () => {
    (ApiClientModule.getCustomersApi as any).mockResolvedValue({
      code: 'CUSTOMERS_RETRIEVED',
      customers: [],
    });

    render(<Customers />);

    const openBtn = await screen.findByRole('button', { name: /\+ add customer/i });
    fireEvent.click(openBtn);

    const submitBtn = screen.getByRole('button', { name: /^save customer$/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Customer name is required')).toBeInTheDocument();
    expect(ApiClientModule.createCustomerApi).not.toHaveBeenCalled();
  });

  it('successfully creates a customer when form is submitted', async () => {
    (ApiClientModule.getCustomersApi as any).mockResolvedValue({
      code: 'CUSTOMERS_RETRIEVED',
      customers: [],
    });
    (ApiClientModule.createCustomerApi as any).mockResolvedValue({
      code: 'CUSTOMER_CREATED',
      message: 'Customer created successfully',
      customer: {
        id: 'cust-new',
        organizationId: 'org-12345678',
        name: 'Stark Industries',
        email: 'tony@stark.com',
        phone: null,
        createdAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z',
      },
    });

    render(<Customers />);

    const openBtn = await screen.findByRole('button', { name: /\+ add customer/i });
    fireEvent.click(openBtn);

    const nameInput = screen.getByPlaceholderText(/acme corporation/i);
    fireEvent.change(nameInput, { target: { value: 'Stark Industries' } });

    const emailInput = screen.getByPlaceholderText(/contact@acme.com/i);
    fireEvent.change(emailInput, { target: { value: 'tony@stark.com' } });

    const submitBtn = screen.getByRole('button', { name: /^save customer$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(ApiClientModule.createCustomerApi).toHaveBeenCalledWith(
        { name: 'Stark Industries', email: 'tony@stark.com', phone: null },
        'test-token',
      );
    });
  });

  it('successfully updates a customer', async () => {
    (ApiClientModule.getCustomersApi as any).mockResolvedValue({
      code: 'CUSTOMERS_RETRIEVED',
      customers: [
        {
          id: 'cust-1',
          organizationId: 'org-12345678',
          name: 'Old Name',
          email: 'old@example.com',
          phone: null,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    });
    (ApiClientModule.updateCustomerApi as any).mockResolvedValue({
      code: 'CUSTOMER_UPDATED',
      message: 'Customer updated successfully',
      customer: {
        id: 'cust-1',
        organizationId: 'org-12345678',
        name: 'Updated Name',
        email: 'old@example.com',
        phone: null,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z',
      },
    });

    render(<Customers />);

    const editBtn = await screen.findByRole('button', { name: /^edit$/i });
    fireEvent.click(editBtn);

    const nameInput = screen.getByDisplayValue('Old Name');
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

    const updateBtn = screen.getByRole('button', { name: /^update customer$/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(ApiClientModule.updateCustomerApi).toHaveBeenCalledWith(
        'cust-1',
        { name: 'Updated Name', email: 'old@example.com', phone: null },
        'test-token',
      );
    });
  });

  it('deletes a customer when delete button is clicked', async () => {
    (ApiClientModule.getCustomersApi as any).mockResolvedValue({
      code: 'CUSTOMERS_RETRIEVED',
      customers: [
        {
          id: 'cust-1',
          organizationId: 'org-12345678',
          name: 'Wayne Enterprises',
          email: null,
          phone: null,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    });
    (ApiClientModule.deleteCustomerApi as any).mockResolvedValue({
      code: 'CUSTOMER_DELETED',
      message: 'Customer deleted successfully',
    });

    render(<Customers />);

    const deleteBtn = await screen.findByRole('button', { name: /^delete$/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(ApiClientModule.deleteCustomerApi).toHaveBeenCalledWith('cust-1', 'test-token');
    });
  });

  it('displays access restricted UI when MEMBER role gets INSUFFICIENT_ROLE error', async () => {
    (ApiClientModule.getCustomersApi as any).mockRejectedValue(
      new ApiClientModule.ApiError('INSUFFICIENT_ROLE', 'Permission denied'),
    );

    render(<Customers />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
  });

  it('renders associated projects and supports link and unlink actions', async () => {
    (ApiClientModule.getCustomersApi as any).mockResolvedValue({
      code: 'CUSTOMERS_RETRIEVED',
      customers: [
        {
          id: 'cust-1',
          organizationId: 'org-12345678',
          name: 'Cyberdyne',
          email: null,
          phone: null,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    });
    (ApiClientModule.getCustomerProjectsApi as any).mockResolvedValue({
      code: 'CUSTOMER_PROJECTS_RETRIEVED',
      projects: [{ id: 'proj-1', name: 'Project Alpha', status: 'ACTIVE' }],
    });
    (ApiClientModule.linkCustomerProjectApi as any).mockResolvedValue({
      code: 'CUSTOMER_PROJECT_LINKED',
    });
    (ApiClientModule.unlinkCustomerProjectApi as any).mockResolvedValue({
      code: 'CUSTOMER_PROJECT_UNLINKED',
    });

    render(<Customers />);

    const manageBtn = await screen.findByRole('button', { name: /manage projects/i });
    fireEvent.click(manageBtn);

    expect(await screen.findByText('Customer Projects — Cyberdyne')).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();

    // Test Link
    const selectProject = screen.getByDisplayValue('Select Project to Link');
    fireEvent.change(selectProject, { target: { value: 'proj-2' } });

    const linkBtn = screen.getByRole('button', { name: /^link$/i });
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(ApiClientModule.linkCustomerProjectApi).toHaveBeenCalledWith(
        'cust-1',
        'proj-2',
        'test-token',
      );
    });

    // Test Unlink
    const unlinkBtn = screen.getByRole('button', { name: /^unlink$/i });
    fireEvent.click(unlinkBtn);

    await waitFor(() => {
      expect(ApiClientModule.unlinkCustomerProjectApi).toHaveBeenCalledWith(
        'cust-1',
        'proj-1',
        'test-token',
      );
    });
  });
});
