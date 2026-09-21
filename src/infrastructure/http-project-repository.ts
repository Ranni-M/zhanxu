import type { ProjectRepository } from '../domain/project-repository';
import { api } from '../lib/api';
export const httpProjectRepository: ProjectRepository = {
  list: async () => (await api.projects()).projects,
  save: async (project) => (await api.save(project)).project,
  remove: async (id) => {
    await api.remove(id);
  },
};
