const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function request<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.idempotencyKey ? { 'X-Idempotency-Key': options.idempotencyKey } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    const err = new Error(body.error || `Request failed: ${res.status}`) as any;
    err.status = res.status;
    err.code = body.code;
    err.details = body;
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  // Users
  getMe: () => request<{ data: any }>('/users/me'),
  searchUsers: (q: string) => request<{ data: any[] }>(`/users/search?q=${encodeURIComponent(q)}`),

  // Teams
  getTeams: () => request<{ data: any[] }>('/teams'),
  createTeam: (name: string) =>
    request<{ data: any }>('/teams', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getTeamMembers: (id: string) =>
    request<{ data: any[] }>(`/teams/${id}/members`),
  addTeamMember: (id: string, userId: string, role: string) =>
    request<{ data: any }>(`/teams/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    }),
  removeTeamMember: (id: string, userId: string) =>
    request<{ data: any }>(`/teams/${id}/members/${userId}`, {
      method: 'DELETE',
    }),

  // Work Items
  getWorkItems: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ data: any[]; total: number; page: number; pageSize: number }>(
      `/work-items${qs ? `?${qs}` : ''}`
    );
  },

  getWorkItem: (id: string) =>
    request<{ data: any }>(`/work-items/${id}`),

  createWorkItem: (body: any, idempotencyKey?: string) =>
    request<{ data: any }>('/work-items', {
      method: 'POST',
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  updateWorkItem: (id: string, body: any, idempotencyKey?: string) =>
    request<{ data: any }>(`/work-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  claimWorkItem: (id: string, idempotencyKey?: string) =>
    request<{ data: any }>(`/work-items/${id}/claim`, {
      method: 'POST',
      idempotencyKey,
    }),

  getEvents: (id: string) =>
    request<{ data: any[] }>(`/work-items/${id}/events`),

  getComments: (id: string) =>
    request<{ data: any[] }>(`/work-items/${id}/comments`),

  addComment: (id: string, body: string, idempotencyKey?: string) =>
    request<{ data: any }>(`/work-items/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
      idempotencyKey,
    }),
};
