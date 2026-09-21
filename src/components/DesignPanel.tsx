import { useState } from 'react';
import {
  Check,
  Plus,
  Trash,
  Palette,
  ArrowsLeftRight,
  Images,
  Tag,
  CircleNotch,
} from '@phosphor-icons/react';
import type { Colorway, ComparePair, Project, ProjectOption } from '../domain/project';
import { coverImage, emptyMeta } from '../domain/project';
import { colorwayFilter, dominantColor, hueDelta } from '../lib/colorway';
import CompareSlider from './CompareSlider';
// 可选的目标色：都是能靠色相偏移真正做出来的颜色（白与黑做不出来，所以不在列表里）
const TARGETS = [
  '#b8422b',
  '#c2410c',
  '#e65938',
  '#f2b705',
  '#d4ef75',
  '#526659',
  '#2f4858',
  '#2563eb',
];
const LABELS = ['方案 A', '方案 B', '方案 C', '方案 D', '方案 E', '方案 F'];
export default function DesignPanel({
  project,
  update,
  busy,
}: {
  project: Project;
  update: (patch: Partial<Project>) => void;
  busy: boolean;
}) {
  const meta = project.meta || emptyMeta();
  const colorways = project.colorways || [];
  const options = project.options || [];
  const compares = project.compares || [];
  const cover = coverImage(project);
  const [sampling, setSampling] = useState(false);
  function setMeta(patch: Partial<typeof meta>) {
    update({ meta: { ...meta, ...patch } });
  }
  function patchColorway(id: string, patch: Partial<Colorway>) {
    update({ colorways: colorways.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  /** 换目标色时重算色相偏移，这样同一个配色改来改去都不会漂 */
  function retarget(colorway: Colorway, color: string) {
    patchColorway(colorway.id, { color, hue: hueDelta(colorway.source, color) });
  }
  async function addColorway() {
    setSampling(true);
    const source =
      (cover ? await dominantColor(cover.src).catch(() => undefined) : undefined) || '#808080';
    const color = TARGETS[0];
    update({
      colorways: [
        ...colorways,
        {
          id: crypto.randomUUID(),
          label: '配色 ' + (colorways.length + 1),
          source,
          hue: hueDelta(source, color),
          saturation: 1,
          brightness: 1,
          color,
        },
      ],
    });
    setSampling(false);
  }
  function patchOption(id: string, patch: Partial<ProjectOption>) {
    update({ options: options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  }
  function patchCompare(id: string, patch: Partial<ComparePair>) {
    update({ compares: compares.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  return (
    <div className="control-section design-panel">
      <fieldset disabled={busy} className="design-fields">
        <section className="design-block">
          <div className="design-head">
            <h2>
              <Images size={18} />
              封面图片
            </h2>
            <span className="design-hint">点一张图设为封面</span>
          </div>
          {project.images.length ? (
            <div className="cover-picker">
              {project.images.map((image, index) => {
                const selected = (project.coverIndex ?? 0) === index;
                return (
                  <button
                    key={image.id}
                    className={'cover-thumb' + (selected ? ' selected' : '')}
                    aria-pressed={selected}
                    aria-label={'把第' + (index + 1) + '张设为封面'}
                    onClick={() => update({ coverIndex: index })}
                  >
                    <img src={image.src} alt="" loading="lazy" />
                    {selected && <Check size={13} weight="bold" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="field-help">先上传图片，这里就会出现可选封面。</p>
          )}
        </section>
        <section className="design-block">
          <div className="design-head">
            <h2>
              <Palette size={18} />
              材质配色
            </h2>
            <span className="design-hint">只影响展示页，导出仍用原图</span>
          </div>
          <p className="field-help">
            从作品里取一个色，再选想换成什么色，系统换算成色相偏移。适合展示同一款式的不同材质。
          </p>
          {colorways.map((colorway) => (
            <div className="design-item" key={colorway.id}>
              <div className="design-item-head">
                <input
                  className="design-title"
                  value={colorway.label}
                  maxLength={24}
                  placeholder="配色名称"
                  aria-label="配色名称"
                  onChange={(e) => patchColorway(colorway.id, { label: e.target.value })}
                />
                <button
                  className="icon-button small"
                  aria-label={'删除' + (colorway.label || '配色')}
                  onClick={() =>
                    update({ colorways: colorways.filter((c) => c.id !== colorway.id) })
                  }
                >
                  <Trash size={14} />
                </button>
              </div>
              <div className="colorway-row">
                {cover && (
                  <img
                    className="colorway-preview"
                    src={cover.src}
                    alt=""
                    style={{ filter: colorwayFilter(colorway) }}
                  />
                )}
                <div className="colorway-controls">
                  <div className="swatch-row">
                    {TARGETS.map((hex) => (
                      <button
                        key={hex}
                        className={'swatch' + (colorway.color === hex ? ' selected' : '')}
                        style={{ background: hex }}
                        aria-label={'换成' + hex}
                        aria-pressed={colorway.color === hex}
                        onClick={() => retarget(colorway, hex)}
                      />
                    ))}
                    <label className="swatch custom" title="自定义颜色">
                      <input
                        type="color"
                        value={colorway.color}
                        aria-label="自定义目标颜色"
                        onChange={(e) => retarget(colorway, e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="range-row">
                    <label>
                      饱和度
                      <input
                        type="range"
                        min={0.5}
                        max={1.5}
                        step={0.05}
                        value={colorway.saturation}
                        aria-label={(colorway.label || '配色') + '饱和度'}
                        onChange={(e) =>
                          patchColorway(colorway.id, { saturation: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      明度
                      <input
                        type="range"
                        min={0.5}
                        max={1.5}
                        step={0.05}
                        value={colorway.brightness}
                        aria-label={(colorway.label || '配色') + '明度'}
                        onChange={(e) =>
                          patchColorway(colorway.id, { brightness: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <p className="design-note">
                    取材色 {colorway.source} → 目标 {colorway.color}，色相偏移 {colorway.hue}°。
                    对纯黑、纯白和低饱和区域不生效。
                  </p>
                </div>
              </div>
            </div>
          ))}
          <button
            className="button secondary full-width"
            onClick={() => void addColorway()}
            disabled={sampling || !cover}
          >
            {sampling ? <CircleNotch size={16} /> : <Plus size={16} />}
            {sampling ? '正在取作品主色' : '添加一套配色'}
          </button>
        </section>
        <section className="design-block">
          <div className="design-head">
            <h2>
              <ArrowsLeftRight size={18} />
              前后对比
            </h2>
            <span className="design-hint">给评委看改动</span>
          </div>
          <p className="field-help">选两张同角度的图，访客可以拖动滑杆看变化。</p>
          {compares.map((pair) => {
            const before = project.images.find((i) => i.id === pair.before);
            const after = project.images.find((i) => i.id === pair.after);
            return (
              <div className="design-item" key={pair.id}>
                <div className="design-item-head">
                  <input
                    className="design-title"
                    value={pair.label}
                    maxLength={40}
                    placeholder="对比标题"
                    aria-label="对比标题"
                    onChange={(e) => patchCompare(pair.id, { label: e.target.value })}
                  />
                  <button
                    className="icon-button small"
                    aria-label={'删除对比' + (pair.label || '')}
                    onClick={() => update({ compares: compares.filter((c) => c.id !== pair.id) })}
                  >
                    <Trash size={14} />
                  </button>
                </div>
                <div className="pair-row">
                  <label className="field">
                    之前
                    <select
                      value={pair.before}
                      aria-label={'对比' + (pair.label || '') + '之前的图片'}
                      onChange={(e) => patchCompare(pair.id, { before: e.target.value })}
                    >
                      {project.images.map((image) => (
                        <option key={image.id} value={image.id}>
                          {image.name || '未命名图片'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    之后
                    <select
                      value={pair.after}
                      aria-label={'对比' + (pair.label || '') + '之后的图片'}
                      onChange={(e) => patchCompare(pair.id, { after: e.target.value })}
                    >
                      {project.images.map((image) => (
                        <option key={image.id} value={image.id}>
                          {image.name || '未命名图片'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {before && after && before.id !== after.id && (
                  <CompareSlider
                    before={before.src}
                    after={after.src}
                    label={pair.label || undefined}
                  />
                )}
              </div>
            );
          })}
          <button
            className="button secondary full-width"
            disabled={project.images.length < 2}
            onClick={() =>
              update({
                compares: [
                  ...compares,
                  {
                    id: crypto.randomUUID(),
                    label: '改动对比 ' + (compares.length + 1),
                    before: project.images[0].id,
                    after: project.images[1].id,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            添加一组对比
          </button>
        </section>
        <section className="design-block">
          <div className="design-head">
            <h2>
              <Tag size={18} />
              多方案
            </h2>
            <span className="design-hint">访客可切换</span>
          </div>
          <p className="field-help">
            同一个题目的不同方案，勾选属于它的图片。展示页上会多出一排切换按钮。
          </p>
          {options.map((option) => (
            <div className="design-item" key={option.id}>
              <div className="design-item-head">
                <input
                  className="design-title"
                  value={option.label}
                  maxLength={24}
                  placeholder="方案名称"
                  aria-label="方案名称"
                  onChange={(e) => patchOption(option.id, { label: e.target.value })}
                />
                <button
                  className="icon-button small"
                  aria-label={'删除' + (option.label || '方案')}
                  onClick={() => update({ options: options.filter((o) => o.id !== option.id) })}
                >
                  <Trash size={14} />
                </button>
              </div>
              <input
                className="design-note-input"
                value={option.note}
                maxLength={200}
                placeholder="一句话说明这个方案的取舍（可留空）"
                aria-label={(option.label || '方案') + '说明'}
                onChange={(e) => patchOption(option.id, { note: e.target.value })}
              />
              <div
                className="option-thumbs"
                role="group"
                aria-label={(option.label || '方案') + '包含的图片'}
              >
                {project.images.map((image) => {
                  const on = option.imageIds.includes(image.id);
                  return (
                    <button
                      key={image.id}
                      className={'cover-thumb tiny' + (on ? ' selected' : '')}
                      aria-pressed={on}
                      aria-label={
                        (image.name || '图片') +
                        (on ? ' 已加入' : ' 未加入') +
                        (option.label || '本方案')
                      }
                      onClick={() =>
                        patchOption(option.id, {
                          imageIds: on
                            ? option.imageIds.filter((id) => id !== image.id)
                            : [...option.imageIds, image.id],
                        })
                      }
                    >
                      <img src={image.src} alt="" loading="lazy" />
                      {on && <Check size={12} weight="bold" />}
                    </button>
                  );
                })}
              </div>
              {colorways.length > 0 && (
                <label className="field">
                  这套方案的配色
                  <select
                    value={option.colorwayId || ''}
                    aria-label={(option.label || '方案') + '配色'}
                    onChange={(e) =>
                      patchOption(option.id, { colorwayId: e.target.value || undefined })
                    }
                  >
                    <option value="">不套配色</option>
                    {colorways.map((colorway) => (
                      <option key={colorway.id} value={colorway.id}>
                        {colorway.label || '未命名配色'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {option.imageIds.length === 0 && (
                <p className="design-note">还没有勾选图片，发布时这一项会被忽略。</p>
              )}
            </div>
          ))}
          <button
            className="button secondary full-width"
            disabled={options.length >= 6 || !project.images.length}
            onClick={() =>
              update({
                options: [
                  ...options,
                  {
                    id: crypto.randomUUID(),
                    label: LABELS[options.length] || '方案 ' + (options.length + 1),
                    note: '',
                    imageIds: [],
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            添加一个方案
          </button>
        </section>
        <section className="design-block">
          <div className="design-head">
            <h2>展签信息</h2>
            <span className="design-hint">海报与 PDF 上会用到</span>
          </div>
          <p className="field-help">都可以留空，留空就自动用项目里的信息。</p>
          <div className="meta-grid">
            <label className="field">
              学校
              <input
                value={meta.school}
                maxLength={80}
                onChange={(e) => setMeta({ school: e.target.value })}
              />
            </label>
            <label className="field">
              院系 / 专业
              <input
                value={meta.major}
                maxLength={80}
                onChange={(e) => setMeta({ major: e.target.value })}
              />
            </label>
            <label className="field">
              指导教师
              <input
                value={meta.advisor}
                maxLength={80}
                onChange={(e) => setMeta({ advisor: e.target.value })}
              />
            </label>
            <label className="field">
              展位
              <input
                value={meta.booth}
                maxLength={40}
                placeholder="例如 A-12"
                onChange={(e) => setMeta({ booth: e.target.value })}
              />
            </label>
            <label className="field">
              展期
              <input
                value={meta.period}
                maxLength={60}
                placeholder="例如 2026.05.20 — 06.10"
                onChange={(e) => setMeta({ period: e.target.value })}
              />
            </label>
            <label className="field">
              一句话标语
              <input
                value={meta.tagline}
                maxLength={120}
                placeholder="印在项目名下面的一行话"
                onChange={(e) => setMeta({ tagline: e.target.value })}
              />
            </label>
          </div>
        </section>
      </fieldset>
    </div>
  );
}
