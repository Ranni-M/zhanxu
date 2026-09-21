import type { Project } from './project';
/** Persistence contract shared by the application service and HTTP adapter. */
export interface ProjectRepository {
  list(): Promise<Project[]>;
  save(project: Project): Promise<Project>;
  remove(id: string): Promise<void>;
}
