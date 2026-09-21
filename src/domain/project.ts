export type TemplateId = 'editorial' | 'gallery' | 'bold';
export type ProjectImage = { id: string; src: string; name: string };
export type Attachment = {
  id: string;
  src: string;
  name: string;
  kind: 'video' | 'pdf' | 'archive';
  size: number;
  visible: boolean;
  caption?: string;
};
export type ProjectSection = { id: string; title: string; body: string; imageIds: string[] };
export type Project = {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  category: string;
  year: string;
  intro: string;
  process: string;
  template: TemplateId;
  images: ProjectImage[];
  updatedAt: number;
  sample?: boolean;
  revision?: number;
  role?: string;
  tools?: string;
  demoUrl?: string;
  repositoryUrl?: string;
  attachments?: Attachment[];
  sections?: ProjectSection[];
  publishedSlug?: string;
  publishedRevision?: number;
};
export function createProject(): Project {
  return {
    id: crypto.randomUUID(),
    title: '',
    subtitle: '',
    author: '',
    category: '视觉传达',
    year: String(new Date().getFullYear()),
    intro: '',
    process: '',
    template: 'editorial',
    images: [],
    attachments: [],
    sections: [],
    role: '',
    tools: '',
    demoUrl: '',
    repositoryUrl: '',
    updatedAt: 0,
  };
}
