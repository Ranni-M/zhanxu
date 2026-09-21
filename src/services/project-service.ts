import type { ProjectRepository } from '../domain/project-repository';
import type { Project } from '../domain/project';
import { httpProjectRepository } from '../infrastructure/http-project-repository';
export function createProjectService(repository: ProjectRepository) {
  return {
    list: () => repository.list(),
    save: (project: Project) => {
      if (!project.title.trim()) throw new Error('请填写项目名称。');
      return repository.save(project);
    },
    remove: (id: string) => repository.remove(id),
  };
}
export const projectService = createProjectService(httpProjectRepository);
export const listProjects = projectService.list;
export const saveProject = projectService.save;
export const deleteProject = projectService.remove;
