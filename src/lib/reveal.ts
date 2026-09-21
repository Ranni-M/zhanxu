import { useEffect, useRef } from 'react';

/**
 * 进入视口再播放入场动画（一次性）。样式写在 .reveal / .reveal.is-visible 里，
 * 并且只在 prefers-reduced-motion: no-preference 下才隐藏初始状态，
 * 所以减少动态偏好或不支持 IntersectionObserver 的浏览器都能直接看到内容。
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          node.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.06 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}
