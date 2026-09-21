import { useRef, useState } from 'react';
/** 前后对比：两张图叠在一起，用一条滑杆裁切。滑杆本体是 range 控件，键盘也能用 */
export default function CompareSlider({
  before,
  after,
  label,
  beforeLabel = '改造前',
  afterLabel = '改造后',
}: {
  before: string;
  after: string;
  label?: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [position, setPosition] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const time = useRef(0);
  function move(next: number) {
    const now = performance.now();
    // 拖动时不要每像素都重排一次
    if (now - time.current < 16) return;
    time.current = now;
    setPosition(next);
  }
  return (
    <figure className="compare">
      <div className="compare-frame" ref={frame}>
        <img
          className="compare-image"
          src={after}
          alt={label ? label + '（' + afterLabel + '）' : afterLabel}
          draggable={false}
        />
        <img
          className="compare-image compare-top"
          src={before}
          alt={label ? label + '（' + beforeLabel + '）' : beforeLabel}
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <span className="compare-tag is-before" aria-hidden="true">
          {beforeLabel}
        </span>
        <span className="compare-tag is-after" aria-hidden="true">
          {afterLabel}
        </span>
        <span className="compare-handle" style={{ left: position + '%' }} aria-hidden="true">
          <span />
        </span>
        <input
          className="compare-range"
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={position}
          aria-label={(label ? label + '：' : '') + '拖动对比' + beforeLabel + '与' + afterLabel}
          onChange={(e) => move(Number(e.target.value))}
        />
      </div>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
