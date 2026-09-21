import { useState } from 'react';
import {
  Sparkle,
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  UploadSimple,
  Layout,
  DownloadSimple,
  MagnifyingGlass,
  BookmarkSimple,
  X,
  CaretDown,
} from '@phosphor-icons/react';
import type { Project, TemplateId } from '../domain/project';
import { categories, samples, templates } from '../data';
import PosterImage from '../components/PosterImage';
export default function Home({
  projects,
  bookmarks,
  start,
  onOpen,
  onUse,
  onTemplates,
  onBookmark,
  nextOffset,
  onLoadMore,
}: {
  projects: Project[];
  bookmarks: string[];
  start: (template?: TemplateId) => void;
  onOpen: (p: Project) => void;
  onUse: (p: Project) => void;
  onTemplates: () => void;
  onBookmark: (id: string) => void;
  nextOffset: number | null;
  onLoadMore: () => void;
}) {
  const [category, setCategory] = useState('全部作品'),
    [query, setQuery] = useState(''),
    [bookmarkedOnly, setBookmarkedOnly] = useState(false),
    [sort, setSort] = useState('curated');
  const source = projects.length ? projects : samples;
  const filtered = source.filter(
    (p) =>
      (category === '全部作品' || p.category === category) &&
      (!bookmarkedOnly || bookmarks.includes(p.id)) &&
      (!query || (p.title + p.subtitle + p.category).toLowerCase().includes(query.toLowerCase())),
  );
  const visible =
    sort === 'title'
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
      : filtered;
  const toggleBookmark = onBookmark;
  return (
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-icon">
              <Sparkle size={14} weight="fill" />
            </span>
            给毕业设计，一个新的开始
          </div>
          <h1>
            让毕业设计，
            <br />
            成为你的<span>代表作。</span>
          </h1>
          <p>
            从最后一次作业，到第一张名片。
            <br />
            图片、视频、过程与源码，完整讲述你的创作。
          </p>
          <div className="hero-actions">
            <button className="button primary large" onClick={() => start()}>
              创建作品
              <ArrowUpRight size={19} />
            </button>
            <button className="button text-button large" onClick={() => onUse(samples[0])}>
              体验示例
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <div className="hero-art" aria-label="三种毕业设计展示版式预览">
          <div className="hero-backdrop" />
          <button
            className="hero-print print-back"
            onClick={() => onOpen(samples[2])}
            aria-label="查看一叶之间示例"
          >
            <PosterImage project={samples[2]} width={480} />
          </button>
          <button
            className="hero-print print-front"
            onClick={() => onOpen(samples[0])}
            aria-label="查看栖居之间示例"
          >
            <PosterImage project={samples[0]} width={800} />
          </button>
          <button
            className="hero-print print-side"
            onClick={() => onOpen(samples[1])}
            aria-label="查看潮汐来信示例"
          >
            <PosterImage project={samples[1]} width={480} />
          </button>
        </div>
      </section>
      <section className="workflow container" aria-label="创作流程">
        <div className="workflow-intro">
          <span>专注创作，</span>
          <strong>把展示交给展序。</strong>
        </div>
        <div className="workflow-item">
          <UploadSimple size={24} weight="light" />
          <div>
            <strong>上传作品</strong>
            <span>图片、视频与项目文件</span>
          </div>
        </div>
        <ArrowRight className="workflow-arrow" size={18} />
        <div className="workflow-item">
          <Layout size={24} weight="light" />
          <div>
            <strong>组织项目</strong>
            <span>分模块讲清你的创作</span>
          </div>
        </div>
        <ArrowRight className="workflow-arrow" size={18} />
        <div className="workflow-item">
          <DownloadSimple size={24} weight="light" />
          <div>
            <strong>发布与导出</strong>
            <span>完整项目页与多页展示图</span>
          </div>
        </div>
      </section>
      <section className="discover-section container" id="discover">
        <div className="section-title">
          <h2>每一份热爱，都有自己的形状。</h2>
          <p>探索不同的展示方式，找到属于你的那一种。</p>
        </div>
        <div className="discovery-tools">
          <div className="category-tabs" aria-label="按作品方向筛选">
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? 'selected' : ''}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="search-controls">
            <label className="search-field">
              <MagnifyingGlass size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索作品"
                aria-label="搜索作品"
                enterKeyHint="search"
              />
              {query && (
                <button
                  className="icon-button small"
                  onClick={() => setQuery('')}
                  aria-label="清除搜索"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <button
              className={'icon-button bookmark-filter ' + (bookmarkedOnly ? 'selected' : '')}
              onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
              aria-pressed={bookmarkedOnly}
              aria-label="只看收藏"
            >
              <BookmarkSimple size={19} weight={bookmarkedOnly ? 'fill' : 'regular'} />
            </button>
          </div>
        </div>
        <div className="results-meta">
          <span>
            {bookmarkedOnly ? '已收藏的作品' : projects.length ? '公开项目' : '展示灵感'}{' '}
            <span className="count">{visible.length}</span>
          </span>
          <label className="sort-label">
            <select aria-label="作品排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="curated">推荐顺序</option>
              <option value="title">名称排序</option>
            </select>
            <CaretDown size={12} />
          </label>
        </div>
        {visible.length ? (
          <div className="project-grid">
            {visible.map((project, index) => (
              <article
                className="project-card"
                key={project.id}
                style={{ '--item-index': index } as React.CSSProperties}
              >
                <button
                  className="project-thumbnail"
                  onClick={() => onOpen(project)}
                  aria-label={'查看' + project.title}
                >
                  <PosterImage project={project} width={560} />
                  <span className="project-open">
                    <ArrowUpRight size={21} />
                  </span>
                </button>
                <div className="project-info">
                  <div>
                    <button className="project-title" onClick={() => onOpen(project)}>
                      {project.title}
                    </button>
                    <p>
                      {project.category}
                      <span>/</span>
                      {project.subtitle}
                    </p>
                  </div>
                  <button
                    className={
                      'icon-button save-project ' +
                      (bookmarks.includes(project.id) ? 'is-saved' : '')
                    }
                    aria-label={
                      (bookmarks.includes(project.id) ? '取消收藏' : '收藏') + project.title
                    }
                    aria-pressed={bookmarks.includes(project.id)}
                    onClick={() => toggleBookmark(project.id)}
                  >
                    <BookmarkSimple
                      size={19}
                      weight={bookmarks.includes(project.id) ? 'fill' : 'regular'}
                    />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <MagnifyingGlass size={37} weight="light" />
            <h3>{bookmarkedOnly ? '还没有收藏的作品' : '没有找到相关作品'}</h3>
            <p>
              {bookmarkedOnly
                ? '点击作品旁的收藏按钮，留住喜欢的展示方式。'
                : '试试其他关键词，或换一个作品方向。'}
            </p>
            <button
              className="button secondary"
              onClick={() => {
                setQuery('');
                setCategory('全部作品');
                setBookmarkedOnly(false);
              }}
            >
              查看全部作品
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        {nextOffset !== null && (
          <button className="button secondary load-more" onClick={onLoadMore}>
            加载更多项目
            <ArrowDown size={17} />
          </button>
        )}
        <p className="sample-caption">
          {projects.length ? '项目由创作者自主发布。' : '以上为排版概念示例，用于体验展示效果。'}
        </p>
      </section>
      <section className="template-feature container">
        <div className="template-feature-copy">
          <span className="mini-label">少一点排版负担</span>
          <h2>
            你的作品，
            <br />
            不止一种表达。
          </h2>
          <p>
            克制的留白、大胆的色彩、清晰的叙事。
            <br />
            选一种版式，让作品说自己的话。
          </p>
          <button className="button secondary" onClick={() => onTemplates()}>
            挑选展示模板
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="template-feature-gallery">
          {templates.map((template, index) => (
            <button
              key={template.id}
              className="mini-template"
              onClick={() => start(template.id)}
              aria-label={'使用' + template.name + '模板'}
            >
              <PosterImage project={{ ...samples[0], template: template.id }} width={360} />
              <span>
                {template.name}
                <ArrowUpRight size={14} />
              </span>
              <small>
                {index === 0
                  ? '内容与视觉的平衡'
                  : index === 1
                    ? '给作品更多呼吸感'
                    : '让第一眼更有力量'}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section className="closing container">
        <div>
          <h2>
            毕业不是句号。
            <br />
            <span>让作品，继续出发。</span>
          </h2>
          <p>为一次答辩，也为下一次机会。</p>
        </div>
        <button className="button primary large" onClick={() => start()}>
          创建作品
          <ArrowUpRight size={19} />
        </button>
      </section>
    </main>
  );
}
