import type { Project, Attachment, TemplateId } from '../domain/project';
export type User = { id: string; email: string; name: string };
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
  publish: (id: string, revision: number) =>
    request<{ slug: string; project: Project }>('/projects/' + id + '/publish', {
      method: 'POST',
      body: JSON.stringify({ revision }),
    }),
  unpublish: (id: string) =>
    request<{ project: Project }>('/projects/' + id + '/publication', { method: 'DELETE' }),
  publications: (offset = 0) =>
    request<{ projects: Project[]; nextOffset: number | null }>('/publications?offset=' + offset),
  publication: (slug: string) =>
    request<{ project: Project }>('/publications/' + encodeURIComponent(slug)),
  bookmarks: () => request<{ ids: string[] }>('/bookmarks'),
  bookmark: (id: string, saved: boolean) =>
    request('/bookmarks/' + id, { method: 'PUT', body: JSON.stringify({ saved }) }),
  export: (id: string, revision: number, format: 'cover' | 'bundle') =>
    request<{ id: string }>('/projects/' + id + '/exports', {
      method: 'POST',
      body: JSON.stringify({ revision, format }),
    }),
  job: (id: string) =>
    request<{
      job: { id: string; status: string; error: string | null; downloadUrl: string | null };
    }>('/jobs/' + id),
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
    xhr.timeout = 180000;
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
