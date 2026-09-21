import { get, set } from 'idb-keyval';
import type { ProjectRepository } from '../domain/project-repository';
import type { Project } from '../domain/project';
/** 游客模式的草稿存在这台浏览器里：不登录也能反复打开，清缓存才会没 */
const KEY = 'zhanxu:guest-projects';
export async function readGuestProjects(): Promise<Project[]> {
  const store = (await get<Record<string, Project>>(KEY)) || {};
  return Object.values(store).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
async function write(projects: Project[]) {
  const store: Record<string, Project> = {};
  for (const project of projects) store[project.id] = project;
  await set(KEY, store);
}
export const localProjectRepository: ProjectRepository = {
  list: readGuestProjects,
  save: async (project) => {
    const saved = { ...project, updatedAt: Date.now() };
    await write([saved, ...(await readGuestProjects()).filter((item) => item.id !== saved.id)]);
    return saved;
  },
  remove: async (id) => {
    await write((await readGuestProjects()).filter((item) => item.id !== id));
  },
};
export async function clearGuestProjects() {
  await write([]);
}
