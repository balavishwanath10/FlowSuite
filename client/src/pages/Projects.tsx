import React, { useEffect, useState } from 'react';
import {
  archiveProjectApi,
  createProjectApi,
  getMembersApi,
  getProjectsApi,
  Project,
  updateProjectApi,
} from '../api/client';
import { useAuth } from '../context/AuthContext';

export function Projects() {
  const { accessToken, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [userRole, setUserRole] = useState<'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER'>(
    user?.role || 'MEMBER',
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    status: 'ACTIVE' | 'ARCHIVED';
  }>({ name: '', description: '', status: 'ACTIVE' });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const canMutate = ['OWNER', 'ADMIN', 'MANAGER'].includes(userRole);

  const fetchProjectsData = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getProjectsApi(accessToken);
      setProjects(res.projects);

      // Fetch user role if not populated
      if (!user?.role) {
        try {
          const membersRes = await getMembersApi(accessToken);
          const currentMember = membersRes.members.find(
            (m) => m.userId === user?.userId,
          );
          if (currentMember) setUserRole(currentMember.role);
        } catch {
          // Fallback to MEMBER if membership call fails
        }
      } else {
        setUserRole(user.role);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectsData();
  }, [accessToken, user?.userId]);

  const handleOpenCreateModal = () => {
    setEditingProject(null);
    setFormData({ name: '', description: '', status: 'ACTIVE' });
    setValidationError(null);
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      status: project.status,
    });
    setValidationError(null);
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    const trimmedName = formData.name.trim();
    const trimmedDesc = formData.description.trim();

    if (!trimmedName) {
      setValidationError('Project name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setValidationError('Project name must be 100 characters or less');
      return;
    }
    if (trimmedDesc.length > 500) {
      setValidationError('Description must be 500 characters or less');
      return;
    }

    if (!accessToken) return;
    setIsSubmitting(true);

    try {
      if (editingProject) {
        await updateProjectApi(
          editingProject.id,
          {
            name: trimmedName,
            description: trimmedDesc || undefined,
            status: formData.status,
          },
          accessToken,
        );
      } else {
        await createProjectApi(
          {
            name: trimmedName,
            description: trimmedDesc || undefined,
          },
          accessToken,
        );
      }
      setIsModalOpen(false);
      fetchProjectsData();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveProject = async (projectId: string) => {
    if (!accessToken) return;
    try {
      await archiveProjectApi(projectId, accessToken);
      fetchProjectsData();
    } catch (err: any) {
      setError(err.message || 'Failed to archive project');
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (statusFilter === 'ALL') return true;
    return p.status === statusFilter;
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex items-center space-x-3 text-slate-400">
          <svg className="animate-spin h-6 w-6 text-sky-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-medium">Loading projects...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
          <p className="text-slate-400 text-xs mt-1">
            Manage organization projects and track initiatives.
          </p>
        </div>
        {canMutate && (
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
          >
            + Create Project
          </button>
        )}
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="bg-red-950/60 border border-red-800/80 p-4 rounded-xl flex items-center justify-between text-red-200 text-sm shadow-md">
          <span>{error}</span>
          <button
            onClick={fetchProjectsData}
            className="px-3 py-1 bg-red-900/80 hover:bg-red-800 text-white text-xs font-semibold rounded-md border border-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <span className="text-xs font-mono text-slate-400 mr-2">Filter:</span>
        {(['ALL', 'ACTIVE', 'ARCHIVED'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === st
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Projects Grid / Empty State */}
      {filteredProjects.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center space-y-3">
          <p className="text-slate-300 font-semibold text-base">No projects found.</p>
          <p className="text-slate-500 text-xs">
            {statusFilter === 'ALL'
              ? 'Get started by creating your first project.'
              : `No ${statusFilter.toLowerCase()} projects found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between shadow-lg space-y-4 hover:border-slate-700 transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                    {project.name}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wider ${
                      project.status === 'ACTIVE'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {project.status}
                  </span>
                </div>
                {project.description ? (
                  <p className="text-slate-400 text-xs line-clamp-3 leading-relaxed">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-slate-600 text-xs italic">No description provided</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                {canMutate && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleOpenEditModal(project)}
                      className="px-2.5 py-1 text-xs text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded transition-colors"
                    >
                      Edit
                    </button>
                    {project.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleArchiveProject(project.id)}
                        className="px-2.5 py-1 text-xs text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white">
                {editingProject ? 'Edit Project' : 'Create New Project'}
              </h2>
              <button
                onClick={handleCloseModal}
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
                  Project Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Website Redesign"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional project description..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              {editingProject && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as 'ACTIVE' | 'ARCHIVED',
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
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
                    : editingProject
                    ? 'Update Project'
                    : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
