import { useEffect, useState } from 'react';
import type { Project } from '../data';
const ratios: Record<string, number> = {
  a4: 4 / 5,
  print: 900 / 1273,
  story: 9 / 16,
  og: 1200 / 630,
  square: 1,
};
function ratio(project: Project) {
  return { aspectRatio: String(ratios[project.posterSize ?? 'a4'] ?? 4 / 5) };
}
export default function PosterImage({
  project,
  width = 640,
  className = '',
}: {
  project: Project;
  width?: number;
  className?: string;
}) {
  const [src, setSrc] = useState(''),
    [error, setError] = useState('');
  // 样例用的静态预览图只覆盖 A4 尺寸，其他尺寸现场渲染
  const staticPreview =
    project.sample && (!project.posterSize || project.posterSize === 'a4')
      ? '/previews/' + project.id + '-' + project.template + '.webp'
      : '';
  useEffect(() => {
    if (staticPreview) return;
    let active = true;
    setError('');
    const timer = setTimeout(() => {
      import('../lib/poster')
        .then(({ renderPoster }) => renderPoster(project, width))
        .then((canvas) => {
          if (active) setSrc(canvas.toDataURL('image/webp', 0.9));
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 70);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project, width, staticPreview]);
  if (error)
    return (
      <div className={'poster-error ' + className} role="status">
        {error}
      </div>
    );
  return (
    <div className={'poster-image ' + className} style={ratio(project)}>
      {staticPreview || src ? (
        <img
          src={staticPreview || src}
          alt={(project.title || '你的毕业设计') + '的封面'}
          width={800}
          height={1000}
          decoding="async"
        />
      ) : (
        <div className="skeleton poster-skeleton" aria-label="正在生成预览" />
      )}
    </div>
  );
}
