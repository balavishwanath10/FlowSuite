const BASE_URL = '/api/v1';

export interface ApiErrorResponse {
  code: string;
  message: string;
  errors?: any;
}

export class ApiError extends Error {
  code: string;
  errors?: any;

  constructor(code: string, message: string, errors?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.errors = errors;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  let data: any = {};
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const code = data?.code || 'API_ERROR';
    const message = data?.message || 'An unexpected error occurred';
    const errors = data?.errors || data?.details;
    throw new ApiError(code, message, errors);
  }

  return data as T;
}

export async function loginApi(credentials: { email: string; password: string }) {
  return request<{
    code: string;
    message: string;
    data: {
      user: { id: string; name: string; email: string };
      organization: { id: string };
      accessToken: string;
      refreshToken: string;
    };
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function registerApi(data: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}) {
  return request<{
    code: string;
    message: string;
    data: {
      user: { id: string; name: string; email: string };
      organization: { id: string; name: string };
      accessToken: string;
      refreshToken: string;
    };
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getMeApi(token: string) {
  return request<{
    code: string;
    message: string;
    data: {
      userId: string;
      organizationId: string;
    };
  }>('/auth/me', { method: 'GET' }, token);
}

export async function refreshTokenApi(refreshToken: string) {
  return request<{
    code: string;
    message: string;
    data: {
      accessToken: string;
      refreshToken: string;
    };
  }>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logoutApi(token: string) {
  return request<{
    code: string;
    message: string;
  }>('/auth/logout', { method: 'POST' }, token);
}

export async function getSubscriptionApi(token: string) {
  return request<{
    code: string;
    subscription: {
      id: string;
      organizationId: string;
      planId: string;
      status: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
      plan: {
        id: string;
        name: string;
        priceInPaise: number;
        seatLimit: number;
        projectLimit: number | null;
        apiRequestLimit: number;
        advancedAnalytics: boolean;
      };
    };
  }>('/subscription', { method: 'GET' }, token);
}

export async function getUsageApi(token: string) {
  return request<{
    code: string;
    usage: {
      organizationId: string;
      apiRequests: number;
      apiRequestLimit: number;
      periodStart: string;
      periodEnd: string;
    };
  }>('/usage', { method: 'GET' }, token);
}

/* ==========================================================================
   DAY 17: PROJECTS, TASKS & MEMBERSHIPS API CONTRACTS
   ========================================================================== */

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  assigneeId: string | null;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  project?: {
    id: string;
    name: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface Member {
  id: string;
  organizationId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export async function getProjectsApi(token: string) {
  return request<{
    code: string;
    projects: Project[];
  }>('/projects', { method: 'GET' }, token);
}

export async function createProjectApi(
  data: { name: string; description?: string },
  token: string,
) {
  return request<{
    code: string;
    message: string;
    project: Project;
  }>('/projects', { method: 'POST', body: JSON.stringify(data) }, token);
}

export async function updateProjectApi(
  projectId: string,
  data: { name?: string; description?: string; status?: 'ACTIVE' | 'ARCHIVED' },
  token: string,
) {
  return request<{
    code: string;
    message: string;
    project: Project;
  }>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
}

export async function archiveProjectApi(projectId: string, token: string) {
  return request<{
    code: string;
    message: string;
    project: Project;
  }>(`/projects/${projectId}/archive`, { method: 'POST' }, token);
}

export async function getTasksApi(
  token: string,
  params?: { projectId?: string; assigneeId?: string; status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' },
) {
  const query = new URLSearchParams();
  if (params?.projectId) query.append('projectId', params.projectId);
  if (params?.assigneeId) query.append('assigneeId', params.assigneeId);
  if (params?.status) query.append('status', params.status);
  const queryString = query.toString() ? `?${query.toString()}` : '';

  return request<{
    code: string;
    tasks: Task[];
  }>(`/tasks${queryString}`, { method: 'GET' }, token);
}

export async function createTaskApi(
  data: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string | null;
    status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
  },
  token: string,
) {
  return request<{
    code: string;
    message: string;
    task: Task;
  }>('/tasks', { method: 'POST', body: JSON.stringify(data) }, token);
}

export async function updateTaskApi(
  taskId: string,
  data: {
    title?: string;
    description?: string;
    status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
    assigneeId?: string | null;
  },
  token: string,
) {
  return request<{
    code: string;
    message: string;
    task: Task;
  }>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
}

export async function updateTaskStatusApi(
  taskId: string,
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED',
  token: string,
) {
  return request<{
    code: string;
    message: string;
    task: Task;
  }>(`/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
}

export async function assignTaskApi(
  taskId: string,
  assigneeId: string | null,
  token: string,
) {
  return request<{
    code: string;
    message: string;
    task: Task;
  }>(`/tasks/${taskId}/assign`, { method: 'PATCH', body: JSON.stringify({ assigneeId }) }, token);
}

export async function getMembersApi(token: string) {
  return request<{
    code: string;
    members: Member[];
  }>('/memberships', { method: 'GET' }, token);
}

/* ==========================================================================
   DAY 18: CUSTOMERS & CUSTOMER-PROJECT ASSOCIATION API CONTRACTS
   ========================================================================== */

export interface Customer {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  projects?: Project[];
}

export async function getCustomersApi(token: string) {
  return request<{
    code: string;
    customers: Customer[];
  }>('/customers', { method: 'GET' }, token);
}

export async function createCustomerApi(
  data: { name: string; email?: string | null; phone?: string | null },
  token: string,
) {
  return request<{
    code: string;
    message: string;
    customer: Customer;
  }>('/customers', { method: 'POST', body: JSON.stringify(data) }, token);
}

export async function updateCustomerApi(
  customerId: string,
  data: { name?: string; email?: string | null; phone?: string | null },
  token: string,
) {
  return request<{
    code: string;
    message: string;
    customer: Customer;
  }>(`/customers/${customerId}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
}

export async function deleteCustomerApi(customerId: string, token: string) {
  return request<{
    code: string;
    message: string;
  }>(`/customers/${customerId}`, { method: 'DELETE' }, token);
}

export async function getCustomerProjectsApi(customerId: string, token: string) {
  return request<{
    code: string;
    projects: Project[];
  }>(`/customers/${customerId}/projects`, { method: 'GET' }, token);
}

export async function linkCustomerProjectApi(
  customerId: string,
  projectId: string,
  token: string,
) {
  return request<{
    code: string;
    message: string;
    customer: Customer;
  }>(`/customers/${customerId}/projects/${projectId}`, { method: 'POST' }, token);
}

export async function unlinkCustomerProjectApi(
  customerId: string,
  projectId: string,
  token: string,
) {
  return request<{
    code: string;
    message: string;
  }>(`/customers/${customerId}/projects/${projectId}`, { method: 'DELETE' }, token);
}
