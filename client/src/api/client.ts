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
