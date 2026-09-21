import {
  ArrowUpRight,
  FilePdf,
  DownloadSimple,
  Code,
  Play,
  Link as LinkIcon,
} from '@phosphor-icons/react';
import type { Project, ProjectImage } from '../data';
export default function Showcase({
  project,
  onUse,
  embedded = false,
}: {
  project: Project;
  onUse?: (project: Project) => void;
  onToast?: (message: string) => void;
  embedded?: boolean;
}) {
  const Heading = embedded ? 'h2' : 'h1';
  const attachments = project.attachments || [],
    videos = attachments.filter((a) => a.kind === 'video' && a.visible),
    documents = attachments.filter((a) => a.kind !== 'video' && a.visible);
  const sections = project.sections || [];
  const grouped = new Set(sections.flatMap((section) => section.imageIds));
  const gallery = project.images.slice(1).filter((image) => !grouped.has(image.id));
  function figure(image: ProjectImage) {
    return (
      <figure key={image.id}>
        <img src={image.src} alt={image.name} loading="lazy" />
        <figcaption>{image.name}</figcaption>
      </figure>
    );
  }
  return (
    <article className={'showcase ' + (embedded ? 'embedded-showcase' : '')}>
      <div className="showcase-meta">
        <span>{project.category}</span>
        <span>{project.year}</span>
      </div>
      <Heading className="showcase-title">{project.title || '我的毕业设计'}</Heading>
      {project.subtitle && <p className="showcase-subtitle">{project.subtitle}</p>}
      <div className="showcase-author">
        {project.author || '作品创作者'}
        {project.sample && <span>概念示例</span>}
      </div>
      {(project.demoUrl || project.repositoryUrl) && (
        <div className="project-links">
          {project.demoUrl && (
            <a
              className="button primary"
              href={project.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              在线体验
              <ArrowUpRight size={17} />
            </a>
          )}
          {project.repositoryUrl && (
            <a
              className="button secondary"
              href={project.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Code size={18} />
              查看源码
            </a>
          )}
        </div>
      )}
      {project.images[0] ? (
        <img className="showcase-hero" src={project.images[0].src} alt={project.images[0].name} />
      ) : (
        <div className="project-image-empty">上传第一张图片，作为项目的开场。</div>
      )}
      <nav className="project-outline" aria-label="项目内容">
        <a href="#project-background">项目介绍</a>
        {videos.length > 0 && <a href="#project-videos">演示视频</a>}
        {sections.map((section) => (
          <a key={section.id} href={'#section-' + section.id}>
            {section.title}
          </a>
        ))}
        {documents.length > 0 && <a href="#project-documents">完整资料</a>}
      </nav>
      <div className="showcase-story" id="project-background">
        <h3>关于这个项目</h3>
        <p>{project.intro || '在左侧补充项目背景、目标与成果，让观众理解你的创作。'}</p>
        {project.role && (
          <>
            <h3>我在项目中做了什么</h3>
            <p>{project.role}</p>
          </>
        )}
        {project.tools && (
          <div className="tool-list">
            <span>制作工具 / 技术栈</span>
            <p>{project.tools}</p>
          </div>
        )}
        {project.process && (
          <>
            <h3>从想法到作品</h3>
            <p>{project.process}</p>
          </>
        )}
      </div>
      {videos.length > 0 && (
        <section className="showcase-section" id="project-videos">
          <h3>
            <Play size={20} />
            演示视频
          </h3>
          {videos.map((video) => (
            <figure key={video.id}>
              <video controls preload="metadata" playsInline src={video.src} />
              <figcaption>{video.caption || video.name}</figcaption>
            </figure>
          ))}
        </section>
      )}
      {sections.map((section) => (
        <section className="showcase-section" key={section.id} id={'section-' + section.id}>
          <h3>{section.title || '内容模块'}</h3>
          <p>{section.body}</p>
          {section.imageIds
            .map((id) => project.images.find((image) => image.id === id))
            .filter((image): image is ProjectImage => !!image)
            .map(figure)}
        </section>
      ))}
      {gallery.length > 0 && (
        <section className="showcase-section">
          <h3>更多作品细节</h3>
          {gallery.map(figure)}
        </section>
      )}
      {documents.length > 0 && (
        <section className="showcase-section" id="project-documents">
          <h3>完整项目资料</h3>
          <div className="document-list">
            {documents.map((file) => (
              <a
                key={file.id}
                href={file.kind === 'pdf' ? file.src + '?inline=1' : file.src}
                target="_blank"
                rel="noopener noreferrer"
                className="document-link"
              >
                {file.kind === 'pdf' ? <FilePdf size={26} /> : <Code size={26} />}
                <span>
                  <strong>{file.caption || file.name}</strong>
                  <small>
                    {file.kind === 'pdf' ? '查看完整PDF' : '下载项目文件'} /{' '}
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </small>
                </span>
                {file.kind === 'pdf' ? <LinkIcon size={18} /> : <DownloadSimple size={18} />}
              </a>
            ))}
          </div>
        </section>
      )}
      {onUse && !embedded && (
        <div className="showcase-actions">
          <button className="button primary" onClick={() => onUse(project)}>
            {project.sample ? '用这个模板创作' : '继续编辑'}
            <ArrowUpRight size={18} />
          </button>
        </div>
      )}
      {project.sample && !embedded && (
        <p className="sample-note">这是排版概念示例，不是真实学生投稿。</p>
      )}
    </article>
  );
}
