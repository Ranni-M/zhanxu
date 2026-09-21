import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Trash, PencilSimple, ArrowUpRight } from '@phosphor-icons/react';
import type { Project } from '../domain/project';
import { message } from '../lib/api';
import { projectService } from '../services/project-service';
import PosterImage from '../components/PosterImage';
export default function Works({
  start,
  onEdit,
  onToast,
}: {
  start: () => void;
  onEdit: (p: Project) => void;
  onToast: (m: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      setProjects(await projectService.list());
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function remove(project: Project) {
    if (
      !window.confirm(
        '删除“' + (project.title || '未命名项目') + '”及全部素材？公开页也将撤回，无法恢复。',
      )
    )
      return;
    try {
      await projectService.remove(project.id);
      sessionStorage.removeItem('zhanxu:recovery:' + project.id);
      setProjects((p) => p.filter((i) => i.id !== project.id));
      onToast('项目已删除。');
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <main className="container works-page">
      <div className="page-heading">
        <span className="mini-label">你的创作空间</span>
        <h1>把认真的痕迹，留下来。</h1>
        <p>你的项目与素材保存在账号中。草稿和公开展示分别管理。</p>
      </div>
      {error && (
        <div className="error-card" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={load}>
            重新加载
          </button>
        </div>
      )}
      {loading ? (
        <div className="project-grid">
          {[0, 1, 2].map((i) => (
            <div className="skeleton work-skeleton" key={i} />
          ))}
        </div>
      ) : projects.length ? (
        <div className="project-grid saved-grid">
          <button className="new-project-card" onClick={start}>
            <span>
              <Plus size={29} />
            </span>
            <strong>开始一个新项目</strong>
            <p>图片、视频、过程与成果，都在这里。</p>
          </button>
          {projects.map((p) => (
            <article className="project-card" key={p.id}>
              <button
                className="project-thumbnail"
                onClick={() => onEdit(p)}
                aria-label={'编辑' + (p.title || '未命名项目')}
              >
                <PosterImage project={p} width={560} />
              </button>
              <div className="project-info">
                <div>
                  <button className="project-title" onClick={() => onEdit(p)}>
                    {p.title || '未命名项目'}
                  </button>
                  <p>
                    {p.publishedSlug ? '已发布' : '草稿'}
                    <span>/</span>
                    {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                  </p>
                  {p.publishedSlug && (
                    <a
                      className="draft-public-link"
                      href={'/p/' + p.publishedSlug}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      查看公开页
                      <ArrowUpRight size={13} />
                    </a>
                  )}
                </div>
                <div className="draft-actions">
                  <button
                    className="icon-button"
                    onClick={() => onEdit(p)}
                    aria-label={'编辑项目 ' + p.title}
                  >
                    <PencilSimple size={17} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => remove(p)}
                    aria-label={'删除项目 ' + p.title}
                  >
                    <Trash size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-state works-empty">
            <span className="empty-icon">
              <FolderOpen size={43} />
            </span>
            <h2>你的第一份代表作，从这里开始。</h2>
            <p>上传作品，记录过程，为完整项目建立一个自己的展示页。</p>
            <button className="button primary" onClick={start}>
              创建作品
              <Plus size={18} />
            </button>
          </div>
        )
      )}
    </main>
  );
}
