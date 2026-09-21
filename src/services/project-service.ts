import type { ProjectRepository } from '../domain/project-repository';
import type { Project } from '../domain/project';
import { httpProjectRepository } from '../infrastructure/http-project-repository';
import { localProjectRepository } from '../infrastructure/local-project-repository';
let guest = false;
/**
 * 游客模式：不登录也能建作品、加图片、导出海报与 PDF，
 * 区别只有一个 —— 草稿存在浏览器里，而且不能发布。
 */
export function setGuestMode(on: boolean) {
  guest = on;
}
export const isGuestMode = () => guest;
export function createProjectService(getRepository: () => ProjectRepository) {
  return {
    list: () => getRepository().list(),
    save: (project: Project) => {
      if (!project.title.trim()) throw new Error('请填写项目名称。');
      return getRepository().save(project);
    },
    remove: (id: string) => getRepository().remove(id),
  };
}
export const projectService = createProjectService(() =>
  guest ? localProjectRepository : httpProjectRepository,
);
export const listProjects = projectService.list;
export const saveProject = projectService.save;
export const deleteProject = projectService.remove;
