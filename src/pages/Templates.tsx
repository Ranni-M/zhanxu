import { ArrowLeft, ArrowUpRight, ImageSquare } from '@phosphor-icons/react';
import { samples, templates } from '../data';
import type { TemplateId } from '../data';
import PosterImage from '../components/PosterImage';
export default function Templates({
  onBack,
  start,
}: {
  onBack: () => void;
  start: (template: TemplateId) => void;
}) {
  return (
    <main className="container templates-page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        返回首页
      </button>
      <div className="page-heading">
        <span className="mini-label">为作品找到合适的表达</span>
        <h1>好的封面，让人愿意点进来。</h1>
        <p>选一种视觉语言作为项目入口，完整内容始终在项目页中展开。</p>
      </div>
      <div className="templates-grid">
        {templates.map((t) => (
          <article className="template-full" key={t.id}>
            <button
              className="template-full-preview"
              onClick={() => start(t.id)}
              aria-label={'选择' + t.name}
            >
              <PosterImage project={{ ...samples[0], template: t.id }} width={750} />
            </button>
            <div className="template-full-info">
              <div>
                <h2>
                  {t.name}
                  <span>{t.english}</span>
                </h2>
                <p>{t.description}</p>
              </div>
              <button
                className="icon-button circled"
                onClick={() => start(t.id)}
                aria-label={'使用' + t.name + '模板'}
              >
                <ArrowUpRight size={22} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="template-note">
        <ImageSquare size={23} />
        <p>
          封面用于分享，项目页承载完整成果。
          <br />
          <span>图文导出按内容分页，不把整个项目压进一张图。</span>
        </p>
      </div>
    </main>
  );
}
