import React, { useEffect, useState } from 'react';
import {
  createCustomerApi,
  Customer,
  deleteCustomerApi,
  getCustomerProjectsApi,
  getCustomersApi,
  getProjectsApi,
  linkCustomerProjectApi,
  Project,
  unlinkCustomerProjectApi,
  updateCustomerApi,
} from '../api/client';
import { useAuth } from '../context/AuthContext';

export function Customers() {
  const { accessToken } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState<boolean>(false);

  // Customer Form Modal (Create / Edit)
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
  }>({ name: '', email: '', phone: '' });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Association Modal
  const [activeCustomerForProjects, setActiveCustomerForProjects] = useState<Customer | null>(null);
  const [associatedProjects, setAssociatedProjects] = useState<Project[]>([]);
  const [selectedLinkProjectId, setSelectedLinkProjectId] = useState<string>('');
  const [associationLoading, setAssociationLoading] = useState<boolean>(false);
  const [associationError, setAssociationError] = useState<string | null>(null);

  const fetchCustomersData = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    setIsAccessDenied(false);
    try {
      const [custRes, projRes] = await Promise.all([
        getCustomersApi(accessToken),
        getProjectsApi(accessToken).catch(() => ({ projects: [] })),
      ]);
      setCustomers(custRes.customers);
      setAllProjects(projRes.projects || []);
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_ROLE' || err.message?.includes('permission')) {
        setIsAccessDenied(true);
      } else {
        setError(err.message || 'Unable to load customers');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomersData();
  }, [accessToken]);

  // Handle Create / Edit Customer
  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setFormData({ name: '', email: '', phone: '' });
    setValidationError(null);
    setSubmitError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
    });
    setValidationError(null);
    setSubmitError(null);
    setIsFormModalOpen(true);
  };

  const handleCloseFormModal = () => {
    setIsFormModalOpen(false);
    setEditingCustomer(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();
    const trimmedPhone = formData.phone.trim();

    if (!trimmedName) {
      setValidationError('Customer name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setValidationError('Customer name must be 100 characters or less');
      return;
    }
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setValidationError('Please enter a valid email address');
        return;
      }
    }
    if (trimmedPhone && trimmedPhone.length > 30) {
      setValidationError('Phone number must be 30 characters or less');
      return;
    }

    if (!accessToken) return;
    setIsSubmitting(true);

    try {
      if (editingCustomer) {
        await updateCustomerApi(
          editingCustomer.id,
          {
            name: trimmedName,
            email: trimmedEmail || null,
            phone: trimmedPhone || null,
          },
          accessToken,
        );
      } else {
        await createCustomerApi(
          {
            name: trimmedName,
            email: trimmedEmail || null,
            phone: trimmedPhone || null,
          },
          accessToken,
        );
      }
      setIsFormModalOpen(false);
      fetchCustomersData();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!accessToken) return;
    try {
      await deleteCustomerApi(customerId, accessToken);
      fetchCustomersData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete customer');
    }
  };

  // Handle Association Modal
  const handleOpenAssociationModal = async (customer: Customer) => {
    setActiveCustomerForProjects(customer);
    setSelectedLinkProjectId('');
    setAssociationError(null);
    if (!accessToken) return;

    setAssociationLoading(true);
    try {
      const res = await getCustomerProjectsApi(customer.id, accessToken);
      setAssociatedProjects(res.projects);
    } catch (err: any) {
      setAssociationError(err.message || 'Failed to load customer projects');
    } finally {
      setAssociationLoading(false);
    }
  };

  const handleCloseAssociationModal = () => {
    setActiveCustomerForProjects(null);
    setAssociatedProjects([]);
    setSelectedLinkProjectId('');
    setAssociationError(null);
  };

  const handleLinkProject = async () => {
    if (!accessToken || !activeCustomerForProjects || !selectedLinkProjectId) return;
    setAssociationError(null);
    try {
      await linkCustomerProjectApi(activeCustomerForProjects.id, selectedLinkProjectId, accessToken);
      setSelectedLinkProjectId('');
      const res = await getCustomerProjectsApi(activeCustomerForProjects.id, accessToken);
      setAssociatedProjects(res.projects);
    } catch (err: any) {
      setAssociationError(err.message || 'Failed to link project');
    }
  };

  const handleUnlinkProject = async (projectId: string) => {
    if (!accessToken || !activeCustomerForProjects) return;
    setAssociationError(null);
    try {
      await unlinkCustomerProjectApi(activeCustomerForProjects.id, projectId, accessToken);
      const res = await getCustomerProjectsApi(activeCustomerForProjects.id, accessToken);
      setAssociatedProjects(res.projects);
    } catch (err: any) {
      setAssociationError(err.message || 'Failed to unlink project');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex items-center space-x-3 text-slate-400">
          <svg className="animate-spin h-6 w-6 text-sky-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-medium">Loading customers...</span>
        </div>
      </div>
    );
  }

  if (isAccessDenied) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4 max-w-xl mx-auto mt-12 shadow-xl">
        <div className="w-12 h-12 bg-amber-950/80 border border-amber-800 rounded-full flex items-center justify-center mx-auto text-amber-400 font-bold text-xl">
          🔒
        </div>
        <h2 className="text-xl font-bold text-white">Access Restricted</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          You do not have permission to access organization customer records. Customer management is restricted to OWNER, ADMIN, and MANAGER roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customers</h1>
          <p className="text-slate-400 text-xs mt-1">
            Manage organization customer directory and project linkages.
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
        >
          + Add Customer
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="bg-red-950/60 border border-red-800/80 p-4 rounded-xl flex items-center justify-between text-red-200 text-sm shadow-md">
          <span>{error}</span>
          <button
            onClick={fetchCustomersData}
            className="px-3 py-1 bg-red-900/80 hover:bg-red-800 text-white text-xs font-semibold rounded-md border border-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Customers List / Empty State */}
      {customers.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center space-y-3">
          <p className="text-slate-300 font-semibold text-base">No customers found.</p>
          <p className="text-slate-500 text-xs">
            Add your organization's first customer to start linking projects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between shadow-lg space-y-4 hover:border-slate-700 transition-all"
            >
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                  {customer.name}
                </h3>
                <div className="space-y-1 text-xs text-slate-400 font-mono">
                  {customer.email ? (
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500">Email:</span>
                      <span className="text-slate-300">{customer.email}</span>
                    </div>
                  ) : (
                    <div className="text-slate-600 italic">No email provided</div>
                  )}
                  {customer.phone ? (
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500">Phone:</span>
                      <span className="text-slate-300">{customer.phone}</span>
                    </div>
                  ) : (
                    <div className="text-slate-600 italic">No phone provided</div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  onClick={() => handleOpenAssociationModal(customer)}
                  className="px-2.5 py-1 text-xs font-semibold text-sky-400 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/80 rounded transition-colors"
                >
                  Manage Projects
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenEditModal(customer)}
                    className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteCustomer(customer.id)}
                    className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Customer Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white">
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </h2>
              <button
                onClick={handleCloseFormModal}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {validationError && (
                <div className="bg-red-950/80 border border-red-800 p-3 rounded-lg text-red-200 text-xs">
                  {validationError}
                </div>
              )}
              {submitError && (
                <div className="bg-red-950/80 border border-red-800 p-3 rounded-lg text-red-200 text-xs">
                  {submitError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Acme Corporation"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. contact@acme.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. +1 555-0199"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-md"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : editingCustomer
                    ? 'Update Customer'
                    : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer-Project Association Modal */}
      {activeCustomerForProjects && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Customer Projects — {activeCustomerForProjects.name}
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Link or unlink organization projects for this customer.
                </p>
              </div>
              <button
                onClick={handleCloseAssociationModal}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {associationError && (
              <div className="bg-red-950/80 border border-red-800 p-3 rounded-lg text-red-200 text-xs">
                {associationError}
              </div>
            )}

            {/* Link New Project Bar */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Link Project
              </label>
              <div className="flex gap-3">
                <select
                  value={selectedLinkProjectId}
                  onChange={(e) => setSelectedLinkProjectId(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-sky-500"
                >
                  <option value="">Select Project to Link</option>
                  {allProjects
                    .filter((p) => !associatedProjects.some((ap) => ap.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.status})
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleLinkProject}
                  disabled={!selectedLinkProjectId}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Link
                </button>
              </div>
            </div>

            {/* Associated Projects List */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Linked Projects ({associatedProjects.length})
              </h3>
              {associationLoading ? (
                <p className="text-xs text-slate-500 py-4 text-center">Loading associated projects...</p>
              ) : associatedProjects.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded-lg">
                  No projects linked to this customer yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {associatedProjects.map((p) => (
                    <div
                      key={p.id}
                      className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className="ml-2 text-[10px] text-slate-500 uppercase">{p.status}</span>
                      </div>
                      <button
                        onClick={() => handleUnlinkProject(p.id)}
                        className="text-red-400 hover:text-red-300 text-xs hover:bg-slate-900 px-2 py-1 rounded transition-colors"
                      >
                        Unlink
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={handleCloseAssociationModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
