import React, { useEffect, useState } from 'react';
import {
  assignTaskApi,
  createTaskApi,
  getMembersApi,
  getProjectsApi,
  getTasksApi,
  Member,
  Project,
  Task,
  updateTaskApi,
  updateTaskStatusApi,
} from '../api/client';
import { useAuth } from '../context/AuthContext';

export function Tasks() {
  const { accessToken, user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [userRole, setUserRole] = useState<'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER'>(
    user?.role || 'MEMBER',
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<{
    projectId: string;
    title: string;
    description: string;
    assigneeId: string;
    status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
  }>({
    projectId: '',
    title: '',
    description: '',
    assigneeId: '',
    status: 'TODO',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const canCreate = ['OWNER', 'ADMIN', 'MANAGER'].includes(userRole);
  const canFullEdit = ['OWNER', 'ADMIN'].includes(userRole);
  const canAssign = ['OWNER', 'ADMIN', 'MANAGER'].includes(userRole);

  const fetchTaskDependencies = async () => {
    if (!accessToken) return;
    try {
      const [projectsRes, membersRes] = await Promise.all([
        getProjectsApi(accessToken),
        getMembersApi(accessToken),
      ]);
      setProjects(projectsRes.projects);
      setMembers(membersRes.members);

      // Resolve role if not populated
      if (!user?.role) {
        const currentMember = membersRes.members.find((m) => m.userId === user?.userId);
        if (currentMember) setUserRole(currentMember.role);
      } else {
        setUserRole(user.role);
      }
    } catch {
      // Ignore background dependency fetch failures (or let task fetch error handle UI)
    }
  };

  const fetchTasksData = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getTasksApi(accessToken, {
        projectId: selectedProjectId || undefined,
        status: (selectedStatus as any) || undefined,
      });
      setTasks(res.tasks);
    } catch (err: any) {
      setError(err.message || 'Unable to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTaskDependencies();
  }, [accessToken, user?.userId]);

  useEffect(() => {
    fetchTasksData();
  }, [accessToken, selectedProjectId, selectedStatus]);

  const handleOpenCreateModal = () => {
    setEditingTask(null);
    setFormData({
      projectId: projects.length > 0 ? projects[0].id : '',
      title: '',
      description: '',
      assigneeId: '',
      status: 'TODO',
    });
    setValidationError(null);
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      projectId: task.projectId,
      title: task.title,
      description: task.description || '',
      assigneeId: task.assigneeId || '',
      status: task.status,
    });
    setValidationError(null);
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    const trimmedTitle = formData.title.trim();
    const trimmedDesc = formData.description.trim();

    if (!formData.projectId) {
      setValidationError('Please select a project');
      return;
    }
    if (!trimmedTitle) {
      setValidationError('Task title is required');
      return;
    }
    if (trimmedTitle.length > 200) {
      setValidationError('Task title must be 200 characters or less');
      return;
    }
    if (trimmedDesc.length > 2000) {
      setValidationError('Description must be 2000 characters or less');
      return;
    }

    if (!accessToken) return;
    setIsSubmitting(true);

    try {
      if (editingTask) {
        await updateTaskApi(
          editingTask.id,
          {
            title: trimmedTitle,
            description: trimmedDesc || undefined,
            status: formData.status,
            assigneeId: formData.assigneeId || null,
          },
          accessToken,
        );
      } else {
        await createTaskApi(
          {
            projectId: formData.projectId,
            title: trimmedTitle,
            description: trimmedDesc || undefined,
            assigneeId: formData.assigneeId || null,
            status: formData.status,
          },
          accessToken,
        );
      }
      setIsModalOpen(false);
      fetchTasksData();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: 'TODO' | 'IN_PROGRESS' | 'COMPLETED') => {
    if (!accessToken) return;
    try {
      await updateTaskStatusApi(taskId, newStatus, accessToken);
      fetchTasksData();
    } catch (err: any) {
      setError(err.message || 'Failed to update task status');
    }
  };

  const handleAssigneeChange = async (taskId: string, newAssigneeId: string) => {
    if (!accessToken) return;
    try {
      await assignTaskApi(taskId, newAssigneeId || null, accessToken);
      fetchTasksData();
    } catch (err: any) {
      setError(err.message || 'Failed to assign task');
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
          <span className="text-sm font-medium">Loading tasks...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Tasks</h1>
          <p className="text-slate-400 text-xs mt-1">
            Track and manage action items across organization projects.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
          >
            + Create Task
          </button>
        )}
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="bg-red-950/60 border border-red-800/80 p-4 rounded-xl flex items-center justify-between text-red-200 text-sm shadow-md">
          <span>{error}</span>
          <button
            onClick={fetchTasksData}
            className="px-3 py-1 bg-red-900/80 hover:bg-red-800 text-white text-xs font-semibold rounded-md border border-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center space-x-2">
          <label className="text-xs font-mono text-slate-400">Project:</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-xs font-mono text-slate-400">Status:</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500"
          >
            <option value="">All Statuses</option>
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
        </div>
      </div>

      {/* Tasks List / Empty State */}
      {tasks.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center space-y-3">
          <p className="text-slate-300 font-semibold text-base">No tasks found.</p>
          <p className="text-slate-500 text-xs">
            {selectedProjectId || selectedStatus
              ? 'Try adjusting your filters.'
              : 'Tasks assigned to you or created in your organization will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg hover:border-slate-700 transition-all"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-slate-950 border border-slate-800 text-sky-400 text-[10px] font-mono font-semibold px-2 py-0.5 rounded">
                    {task.project?.name || 'Project'}
                  </span>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {task.title}
                  </h3>
                </div>
                {task.description && (
                  <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed">
                    {task.description}
                  </p>
                )}
                <div className="flex items-center space-x-4 text-[11px] text-slate-500 pt-1">
                  <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
                  {task.dueDate && (
                    <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              {/* Status & Assignee Controls */}
              <div className="flex flex-wrap items-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800">
                {/* Status Selector */}
                <select
                  value={task.status}
                  onChange={(e) =>
                    handleStatusChange(
                      task.id,
                      e.target.value as 'TODO' | 'IN_PROGRESS' | 'COMPLETED',
                    )
                  }
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border focus:outline-none transition-all cursor-pointer ${
                    task.status === 'COMPLETED'
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      : task.status === 'IN_PROGRESS'
                      ? 'bg-amber-950 text-amber-400 border-amber-800'
                      : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>

                {/* Assignee Control */}
                {canAssign ? (
                  <select
                    value={task.assigneeId || ''}
                    onChange={(e) => handleAssigneeChange(task.id, e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name || m.user.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                    {task.assignee ? task.assignee.name || task.assignee.email : 'Unassigned'}
                  </span>
                )}

                {/* Edit Button for OWNER/ADMIN */}
                {canFullEdit && (
                  <button
                    onClick={() => handleOpenEditModal(task)}
                    className="px-3 py-1.5 text-xs text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white">
                {editingTask ? 'Edit Task' : 'Create New Task'}
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

              {!editingTask && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Project *
                  </label>
                  <select
                    value={formData.projectId}
                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Select Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Implement user authentication"
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
                  placeholder="Optional task details..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Assignee
                  </label>
                  <select
                    value={formData.assigneeId}
                    onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name || m.user.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as 'TODO' | 'IN_PROGRESS' | 'COMPLETED',
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                  >
                    <option value="TODO">TODO</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
              </div>

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
                  {isSubmitting ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
