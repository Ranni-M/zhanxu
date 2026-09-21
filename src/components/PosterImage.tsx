import { useEffect, useState } from 'react';
import type { Project } from '../data';
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
  const staticPreview = project.sample
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
    <div className={'poster-image ' + className} style={{ aspectRatio: '4 / 5' }}>
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
