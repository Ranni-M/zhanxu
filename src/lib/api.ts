import type { Project, Attachment, TemplateId, Birth } from '../domain/project';
export type User = { id: string; email: string; name: string; isAdmin?: boolean };
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  created_at: number;
  project_count: number;
  file_count: number;
  live_count: number;
  private_count: number;
  bytes: number;
};
export type AdminProject = {
  id: string;
  title: string;
  category: string;
  year: string;
  revision: number;
  updatedAt: number;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  fileCount: number;
  bytes: number;
  slug: string | null;
  visibility: 'public' | 'private' | null;
};
export type AdminAsset = {
  id: string;
  name: string;
  mime: string;
  kind: string;
  bytes: number;
  createdAt: number;
  used: boolean;
};
export type AdminOverview = {
  users: AdminUser[];
  totals: {
    users: number;
    projects: number;
    live: number;
    live_private: number;
    files: number;
    bytes: number;
    adminEmails: string[];
  };
  disk: { free: number; total: number } | null;
  maxUserBytes: number;
};
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + url, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Zhanxu-Request': '1', ...options.headers },
  });
  const payload = await response
    .json()
    .catch(() => ({ error: '服务返回了无效内容，请确认后端已经启动。' }));
  if (!response.ok) throw new ApiError(response.status, payload.error || '请求失败，请重试。');
  if (payload.error) throw new ApiError(502, payload.error);
  return payload;
}
export type ExportFormat = 'cover' | 'bundle' | 'pdf';
export const api = {
  me: () => request<{ user: User | null }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, password: string) =>
    request('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, password }),
    }),
  projects: () => request<{ projects: Project[] }>('/projects'),
  project: (id: string) => request<{ project: Project }>('/projects/' + encodeURIComponent(id)),
  birth: (id: string) =>
    request<{ birth: Birth }>('/projects/' + encodeURIComponent(id) + '/birth'),
  create: (template: TemplateId) =>
    request<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ template }),
    }),
  save: (project: Project) =>
    request<{ project: Project }>('/projects/' + project.id, {
      method: 'PUT',
      body: JSON.stringify(project),
    }),
  remove: (id: string) => request('/projects/' + id, { method: 'DELETE' }),
  publish: (id: string, revision: number, visibility: 'public' | 'private' = 'public') =>
    request<{ slug: string; visibility: 'public' | 'private'; project: Project }>(
      '/projects/' + id + '/publish',
      {
        method: 'POST',
        body: JSON.stringify({ revision, visibility }),
      },
    ),
  setVisibility: (id: string, visibility: 'public' | 'private') =>
    request<{ visibility: 'public' | 'private'; project: Project }>(
      '/projects/' + id + '/publication',
      { method: 'PUT', body: JSON.stringify({ visibility }) },
    ),
  unpublish: (id: string) =>
    request<{ project: Project }>('/projects/' + id + '/publication', { method: 'DELETE' }),
  publications: (offset = 0) =>
    request<{ projects: Project[]; nextOffset: number | null }>('/publications?offset=' + offset),
  publication: (slug: string) =>
    request<{ project: Project }>('/publications/' + encodeURIComponent(slug)),
  bookmarks: () => request<{ ids: string[] }>('/bookmarks'),
  bookmark: (id: string, saved: boolean) =>
    request('/bookmarks/' + id, { method: 'PUT', body: JSON.stringify({ saved }) }),
  export: (id: string, revision: number, format: ExportFormat) =>
    request<{ id: string }>('/projects/' + id + '/exports', {
      method: 'POST',
      body: JSON.stringify({ revision, format }),
    }),
  job: (id: string) =>
    request<{
      job: { id: string; status: string; error: string | null; downloadUrl: string | null };
    }>('/jobs/' + id),
  adminOverview: () => request<AdminOverview>('/admin/overview'),
  adminProjects: () => request<{ projects: AdminProject[] }>('/admin/projects'),
  adminAssets: (projectId: string) =>
    request<{ project: { id: string; title: string }; assets: AdminAsset[] }>(
      '/admin/projects/' + encodeURIComponent(projectId) + '/assets',
    ),
  adminDeleteAsset: (id: string) =>
    request<{ ok: true; name: string }>('/admin/assets/' + encodeURIComponent(id), {
      method: 'DELETE',
    }),
  adminDeleteProject: (id: string) =>
    request<{ ok: true; removedFiles: number }>('/admin/projects/' + encodeURIComponent(id), {
      method: 'DELETE',
    }),
  adminDeleteUser: (id: string) =>
    request<{ ok: true; removedFiles: number }>('/admin/users/' + encodeURIComponent(id), {
      method: 'DELETE',
    }),
  adminOrphans: () =>
    request<{ files: { name: string; bytes: number; ageHours: number }[]; total: number }>(
      '/admin/orphans',
    ),
  adminPurgeOrphans: () => request<{ removed: number }>('/admin/orphans', { method: 'DELETE' }),
};
export type UploadedAsset = Omit<Attachment, 'kind'> & { kind: Attachment['kind'] | 'image' };
export function uploadAsset(
  id: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/projects/' + id + '/assets');
    xhr.setRequestHeader('X-Zhanxu-Request', '1');
    xhr.timeout = 600000;
    const data = new FormData();
    data.append('file', file);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error('网络中断，请重试上传。'));
    xhr.ontimeout = () => reject(new Error('上传超时，请重试。'));
    xhr.onload = () => {
      let payload;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error('上传服务返回了无效结果。'));
      }
      if (xhr.status < 200 || xhr.status >= 300)
        return reject(new ApiError(xhr.status, payload.error || '上传失败。'));
      resolve(payload.asset);
    };
    xhr.send(data);
  });
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
