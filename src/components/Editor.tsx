import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  UploadSimple,
  X,
  ArrowUp,
  ArrowDown,
  FloppyDisk,
  Eye,
  Check,
  Plus,
  Info,
  DownloadSimple,
  Globe,
  Link as LinkIcon,
  FilePdf,
  FilmStrip,
  Code,
  ImageSquare,
  Trash,
  ArrowRight,
} from '@phosphor-icons/react';
import { categories, templates } from '../data';
import type { Project, ProjectSection, Attachment } from '../domain/project';
import { api, uploadAsset, message } from '../lib/api';
import { projectService } from '../services/project-service';
import { importFiles } from '../lib/import';
import PosterImage from './PosterImage';
import Showcase from './Showcase';
type Tab = 'content' | 'media' | 'sections' | 'publish';
function recovered(initial: Project) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('zhanxu:recovery:' + initial.id) || 'null');
    if (saved?.revision === initial.revision) return saved as Project;
  } catch {}
  return initial;
}
export default function Editor({
  initial,
  onBack,
  onSaved,
  onToast,
}: {
  initial: Project;
  onBack: () => void;
  onSaved: (p: Project) => void;
  onToast: (m: string) => void;
}) {
  const [project, setProject] = useState(() => recovered(initial));
  const [dirty, setDirty] = useState(() => recovered(initial) !== initial);
  const [tab, setTab] = useState<Tab>('content');
  const [view, setView] = useState<'page' | 'cover'>('page');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() =>
    recovered(initial) !== initial ? '已恢复此页面未保存的修改。' : '',
  );
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [exportFormat, setExportFormat] = useState<'cover' | 'bundle'>('bundle');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const uploadLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    try {
      if (dirty) sessionStorage.setItem('zhanxu:recovery:' + project.id, JSON.stringify(project));
      else sessionStorage.removeItem('zhanxu:recovery:' + project.id);
    } catch {}
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, project]);
  function update(patch: Partial<Project>) {
    setProject((p) => ({ ...p, ...patch }));
    setDirty(true);
    setError('');
  }
  function leave() {
    if (busy) return;
    if (dirty && !window.confirm('还有未保存的修改。确定返回吗？修改会临时保留在此页面。')) return;
    onBack();
  }
  async function saveCurrent() {
    if (!project.title.trim()) {
      setTab('content');
      setError('请先填写项目名称。');
      requestAnimationFrame(() => titleInput.current?.focus());
      throw new Error('请先填写项目名称。');
    }
    const saved = await projectService.save(project);
    if (alive.current) {
      setProject(saved);
      setDirty(false);
      onSaved(saved);
      setNotice('');
    }
    return saved;
  }
  async function save() {
    setBusy('save');
    setError('');
    try {
      await saveCurrent();
      onToast('项目已保存到账号。');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  }
  async function publish() {
    setBusy('publish');
    setError('');
    try {
      const saved = dirty ? await saveCurrent() : project;
      const result = await api.publish(saved.id, saved.revision!);
      setProject(result.project);
      setDirty(false);
      setPublishConfirm(false);
      setTab('publish');
      onSaved(result.project);
      onToast('项目已发布，可通过展示链接访问。');
    } catch (e) {
      setPublishConfirm(false);
      setError(message(e));
    } finally {
      setBusy('');
    }
  }
  async function unpublish() {
    if (!window.confirm('撤回后，访客将无法访问这个项目。确定撤回吗？')) return;
    setBusy('unpublish');
    try {
      const result = await api.unpublish(project.id);
      setProject((p) => ({
        ...p,
        publishedSlug: result.project.publishedSlug,
        publishedRevision: result.project.publishedRevision,
      }));
      onSaved(result.project);
      onToast('项目已撤回，草稿仍然保留。');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  }
  async function exportProject() {
    setBusy('export');
    setError('');
    try {
      const saved = dirty ? await saveCurrent() : project;
      const result = await api.export(saved.id, saved.revision!, exportFormat);
      let complete = false;
      for (let attempt = 0; attempt < 150 && alive.current; attempt++) {
        const { job } = await api.job(result.id);
        setProgress(
          job.status === 'queued'
            ? '导出任务正在排队'
            : '正在生成' + (exportFormat === 'bundle' ? '多页图文包' : '封面'),
        );
        if (job.status === 'failed') throw new Error(job.error || '导出失败。');
        if (job.status === 'succeeded' && job.downloadUrl) {
          const a = document.createElement('a');
          a.href = job.downloadUrl;
          a.download = '';
          a.click();
          complete = true;
          onToast(
            exportFormat === 'bundle' ? '多页图文包已生成，正在下载。' : '封面已生成，正在下载。',
          );
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!complete && alive.current) throw new Error('生成耗时较长，可稍后再次点击导出获取结果。');
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) {
        setBusy('');
        setProgress('');
      }
    }
  }
  async function upload(files: File[]) {
    if (uploadLock.current || !files.length) return;
    if (files.length > 8) {
      setError('一次最多选择8个文件。');
      return;
    }
    uploadLock.current = true;
    setBusy('upload');
    setError('');
    setNotice('');
    let count = project.images.length;
    let attachmentCount = (project.attachments || []).length;
    try {
      for (const file of files) {
        const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
        if (isImage && count >= 24) throw new Error('最多24张展示图片，已导入的文件仍然保留。');
        if (!isImage && attachmentCount >= 12) throw new Error('最多12个视频或文件附件。');
        const uploaded = await uploadAsset(project.id, file, (p) =>
          setProgress('上传 ' + file.name + ' ' + p + '%'),
        );
        if (uploaded.kind === 'image') {
          count++;
          setProject((p) => ({
            ...p,
            title: p.title || file.name.replace(/\.[^.]+$/, ''),
            images: [...p.images, { id: uploaded.id, src: uploaded.src, name: uploaded.name }],
          }));
        } else {
          attachmentCount++;
          setProject((p) => ({
            ...p,
            attachments: [...(p.attachments || []), uploaded as Attachment],
          }));
          if (uploaded.kind === 'pdf' && count < 24) {
            try {
              const result = await importFiles([file], setProgress, 24 - count);
              if (result.intro) setProject((p) => ({ ...p, intro: p.intro || result.intro }));
              for (const preview of result.images) {
                const bytes = Uint8Array.from(atob(preview.src.split(',')[1]), (char) =>
                  char.charCodeAt(0),
                );
                const blob = new Blob([bytes], { type: 'image/jpeg' });
                const pageFile = new File([blob], preview.name + '.jpg', { type: 'image/jpeg' });
                const image = await uploadAsset(project.id, pageFile, (n) =>
                  setProgress('保存PDF预览 ' + n + '%'),
                );
                count++;
                setProject((p) => ({
                  ...p,
                  images: [...p.images, { id: image.id, src: image.src, name: preview.name }],
                }));
              }
            } catch (e) {
              console.warn('PDF preview:', message(e));
              setNotice(
                '完整PDF已上传，预览页未能解析：' +
                  message(e) +
                  '。可以补充截图，发布时仍可公开完整PDF。',
              );
            }
          }
        }
        setDirty(true);
      }
      setNotice((n) => n || '素材已上传。PDF和项目包默认私有，发布前可逐一选择是否公开。');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
      setProgress('');
      uploadLock.current = false;
      if (input.current) input.current.value = '';
    }
  }
  function removeImage(id: string) {
    update({
      images: project.images.filter((i) => i.id !== id),
      sections: (project.sections || []).map((s) => ({
        ...s,
        imageIds: s.imageIds.filter((i) => i !== id),
      })),
    });
  }
  function moveImage(index: number, delta: number) {
    const images = [...project.images];
    [images[index], images[index + delta]] = [images[index + delta], images[index]];
    update({ images });
  }
  function sectionChange(id: string, patch: Partial<ProjectSection>) {
    update({
      sections: (project.sections || []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  function moveSection(index: number, delta: number) {
    const sections = [...(project.sections || [])];
    [sections[index], sections[index + delta]] = [sections[index + delta], sections[index]];
    update({ sections });
  }
  const link = project.publishedSlug ? window.location.origin + '/p/' + project.publishedSlug : '';
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      onToast('展示链接已复制。');
    } catch {
      setError('无法自动复制，请选中下方链接后复制。');
    }
  }
  return (
    <main className="editor-shell full-project-editor">
      <div className="editor-top">
        <div className="editor-heading">
          <button
            className="icon-button"
            aria-label="返回我的作品"
            onClick={leave}
            disabled={!!busy}
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1>{project.title || '创建你的项目'}</h1>
            <span>
              {dirty
                ? '有未保存的修改'
                : project.publishedSlug
                  ? '已发布 / 草稿已保存'
                  : '草稿已保存到账号'}
            </span>
          </div>
        </div>
        <div className="editor-actions">
          <button className="button secondary" onClick={save} disabled={!!busy}>
            <FloppyDisk size={17} />
            <span>{busy === 'save' ? '保存中' : '保存修改'}</span>
          </button>
          <button
            className="button primary"
            onClick={() => setPublishConfirm(true)}
            disabled={!!busy}
          >
            <Globe size={17} />
            {project.publishedSlug ? '更新发布' : '发布项目'}
          </button>
        </div>
      </div>
      <div className="editor-grid">
        <aside className="editor-controls">
          <nav className="studio-tabs" aria-label="编辑内容">
            {(
              [
                ['content', '项目介绍'],
                ['media', '作品素材'],
                ['sections', '内容模块'],
                ['publish', '发布导出'],
              ] as [Tab, string][]
            ).map(([id, name]) => (
              <button
                key={id}
                className={tab === id ? 'selected' : ''}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {name}
              </button>
            ))}
          </nav>
          <fieldset disabled={!!busy}>
            {tab === 'content' && (
              <div className="control-section">
                <h2>完整地介绍你的项目</h2>
                <label className="field">
                  项目名称 *
                  <input
                    ref={titleInput}
                    value={project.title}
                    maxLength={64}
                    placeholder="你的毕业设计叫什么？"
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                <label className="field">
                  英文标题 / 副标题
                  <input
                    value={project.subtitle}
                    maxLength={80}
                    onChange={(e) => update({ subtitle: e.target.value })}
                  />
                </label>
                <div className="field-columns">
                  <label className="field">
                    创作者
                    <input
                      value={project.author}
                      maxLength={80}
                      onChange={(e) => update({ author: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    毕业年份
                    <input
                      value={project.year}
                      maxLength={4}
                      inputMode="numeric"
                      onChange={(e) => update({ year: e.target.value.replace(/\D/g, '') })}
                    />
                  </label>
                </div>
                <label className="field">
                  作品方向
                  <select
                    aria-label="作品方向"
                    value={project.category}
                    onChange={(e) => update({ category: e.target.value })}
                  >
                    {categories.slice(1).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  项目介绍 *
                  <textarea
                    value={project.intro}
                    maxLength={2000}
                    rows={5}
                    placeholder="背景、目标、解决的问题，以及最终成果。"
                    onChange={(e) => update({ intro: e.target.value })}
                  />
                </label>
                <label className="field">
                  我的职责
                  <textarea
                    value={project.role || ''}
                    maxLength={1200}
                    rows={3}
                    placeholder="独立完成了什么？团队项目中你负责哪些部分？"
                    onChange={(e) => update({ role: e.target.value })}
                  />
                </label>
                <label className="field">
                  制作工具 / 技术栈
                  <input
                    value={project.tools || ''}
                    maxLength={250}
                    placeholder="例如：Blender、After Effects，或 React、Node.js"
                    onChange={(e) => update({ tools: e.target.value })}
                  />
                </label>
                <label className="field">
                  制作过程
                  <textarea
                    value={project.process}
                    maxLength={2000}
                    rows={4}
                    onChange={(e) => update({ process: e.target.value })}
                  />
                </label>
                <label className="field">
                  在线体验地址
                  <input
                    type="url"
                    value={project.demoUrl || ''}
                    maxLength={1000}
                    placeholder="https://…"
                    onChange={(e) => update({ demoUrl: e.target.value })}
                  />
                </label>
                <label className="field">
                  源码仓库地址
                  <input
                    type="url"
                    value={project.repositoryUrl || ''}
                    maxLength={1000}
                    placeholder="https://github.com/…"
                    onChange={(e) => update({ repositoryUrl: e.target.value })}
                  />
                </label>
              </div>
            )}
            {tab === 'media' && (
              <div className="control-section">
                <div className="section-label">
                  <h2>让项目真正可看、可用</h2>
                  <span>{project.images.length} / 24 张图片</span>
                </div>
                <input
                  type="file"
                  className="sr-only"
                  ref={input}
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4,.webm,.zip"
                  aria-label="上传项目素材"
                  onChange={(e) => e.target.files && void upload(Array.from(e.target.files))}
                />
                <button
                  className={'upload-zone ' + (dragging ? 'dragging' : '')}
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!busy) void upload(Array.from(e.dataTransfer.files));
                  }}
                >
                  <UploadSimple size={30} />
                  <strong>拖入文件，或点击上传</strong>
                  <span>图片、PDF、视频、ZIP项目包</span>
                  <small>图片12MB / PDF25MB / 视频100MB / ZIP50MB</small>
                </button>
                <p className="field-help">
                  PDF保留完整文件，并尝试生成前6页预览。ZIP仅存储与下载，不运行其中的程序。
                </p>
                <div className="asset-list">
                  {project.images.map((image, index) => (
                    <div className="asset-row" key={image.id}>
                      <img src={image.src} alt={image.name} />
                      <div>
                        <input
                          className="asset-caption"
                          aria-label={'图片说明 ' + (index + 1)}
                          value={image.name}
                          maxLength={160}
                          onChange={(e) =>
                            update({
                              images: project.images.map((i) =>
                                i.id === image.id ? { ...i, name: e.target.value } : i,
                              ),
                            })
                          }
                        />
                        <span>{index === 0 ? '封面图片' : '展示图片'}</span>
                      </div>
                      <button
                        className="icon-button small"
                        disabled={index === 0}
                        onClick={() => moveImage(index, -1)}
                        aria-label={'上移图片 ' + (index + 1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button small"
                        disabled={index === project.images.length - 1}
                        onClick={() => moveImage(index, 1)}
                        aria-label={'下移图片 ' + (index + 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon-button small"
                        onClick={() => removeImage(image.id)}
                        aria-label={'移除图片 ' + (index + 1)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {(project.attachments || []).length > 0 && (
                  <div className="attachment-manager">
                    <h3>视频与完整文件</h3>
                    {project.attachments!.map((file) => (
                      <div className="attachment-item" key={file.id}>
                        <div className="attachment-heading">
                          {file.kind === 'video' ? (
                            <FilmStrip size={21} />
                          ) : file.kind === 'pdf' ? (
                            <FilePdf size={21} />
                          ) : (
                            <Code size={21} />
                          )}
                          <span title={file.name}>
                            {file.name}
                            <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
                          </span>
                          <button
                            className="icon-button small"
                            aria-label={'移除附件 ' + file.name}
                            onClick={() =>
                              update({
                                attachments: project.attachments!.filter((a) => a.id !== file.id),
                              })
                            }
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <label className="field">
                          展示说明
                          <input
                            value={file.caption || ''}
                            maxLength={160}
                            placeholder={file.name}
                            onChange={(e) =>
                              update({
                                attachments: project.attachments!.map((a) =>
                                  a.id === file.id ? { ...a, caption: e.target.value } : a,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={file.visible}
                            onChange={(e) =>
                              update({
                                attachments: project.attachments!.map((a) =>
                                  a.id === file.id ? { ...a, visible: e.target.checked } : a,
                                ),
                              })
                            }
                          />
                          {file.kind === 'video' ? '发布时展示此视频' : '发布时允许访客查看或下载'}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === 'sections' && (
              <div className="control-section">
                <h2>按你的项目组织内容</h2>
                <p className="field-help">
                  例如“功能介绍”“角色设定”“技术架构”“实验结果”。每个模块可以关联多张图片，最多8个模块。
                </p>
                {(project.sections || []).map((section, index) => (
                  <section className="section-editor" key={section.id}>
                    <div className="section-editor-actions">
                      <strong>内容模块 {index + 1}</strong>
                      <button
                        className="icon-button small"
                        disabled={index === 0}
                        aria-label={'上移模块 ' + (index + 1)}
                        onClick={() => moveSection(index, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button small"
                        disabled={index === (project.sections || []).length - 1}
                        aria-label={'下移模块 ' + (index + 1)}
                        onClick={() => moveSection(index, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon-button small"
                        aria-label={'删除模块 ' + (index + 1)}
                        onClick={() =>
                          update({ sections: project.sections!.filter((s) => s.id !== section.id) })
                        }
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                    <label className="field">
                      模块标题
                      <input
                        value={section.title}
                        maxLength={80}
                        onChange={(e) => sectionChange(section.id, { title: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      模块说明
                      <textarea
                        value={section.body}
                        maxLength={2000}
                        rows={4}
                        onChange={(e) => sectionChange(section.id, { body: e.target.value })}
                      />
                    </label>
                    {project.images.length > 0 && (
                      <div className="section-image-picker" aria-label="选择模块图片">
                        {project.images.map((image) => (
                          <button
                            key={image.id}
                            className={section.imageIds.includes(image.id) ? 'selected' : ''}
                            aria-label={'将' + image.name + '关联到' + section.title}
                            aria-pressed={section.imageIds.includes(image.id)}
                            onClick={() =>
                              sectionChange(section.id, {
                                imageIds: section.imageIds.includes(image.id)
                                  ? section.imageIds.filter((id) => id !== image.id)
                                  : [...section.imageIds, image.id],
                              })
                            }
                          >
                            <img src={image.src} alt={image.name} />
                            {section.imageIds.includes(image.id) && <Check size={15} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
                <button
                  className="button secondary full-width"
                  disabled={(project.sections || []).length >= 8}
                  onClick={() =>
                    update({
                      sections: [
                        ...(project.sections || []),
                        { id: crypto.randomUUID(), title: '新的内容模块', body: '', imageIds: [] },
                      ],
                    })
                  }
                >
                  <Plus size={17} />
                  添加内容模块
                </button>
              </div>
            )}
            {tab === 'publish' && (
              <div className="control-section">
                <h2>一个链接，展示完整项目</h2>
                <p className="field-help">
                  公开页包含介绍、图片、内容模块、已公开附件与体验链接。图片只是展示的入口。
                </p>
                {link ? (
                  <>
                    <label className="field">
                      公开展示链接
                      <input readOnly value={link} onFocus={(e) => e.target.select()} />
                    </label>
                    <div className="publish-link-actions">
                      <button className="button secondary" onClick={copy}>
                        <LinkIcon size={16} />
                        复制链接
                      </button>
                      <a
                        className="button secondary"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        查看公开页
                        <ArrowRight size={16} />
                      </a>
                    </div>
                    <p className="field-help">
                      {dirty || project.revision !== project.publishedRevision
                        ? '草稿有新修改，需要更新发布后访客才能看到。'
                        : '访客看到的是当前已保存版本。'}
                    </p>
                    <button className="text-link danger" onClick={unpublish}>
                      撤回公开展示
                    </button>
                  </>
                ) : (
                  <div className="publish-empty">
                    <Globe size={30} />
                    <p>还没有发布。准备好后，给作品一个自己的页面。</p>
                  </div>
                )}
                <button
                  className="button primary full-width"
                  onClick={() => setPublishConfirm(true)}
                >
                  <Globe size={17} />
                  {link ? '更新发布' : '发布项目'}
                </button>
                <div className="export-settings">
                  <h3>把介绍带到其他地方</h3>
                  <label className="field">
                    导出形式
                    <select
                      aria-label="导出形式"
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as 'cover' | 'bundle')}
                    >
                      <option value="bundle">多页图文展示包（ZIP）</option>
                      <option value="cover">项目封面（PNG）</option>
                    </select>
                  </label>
                  <p className="field-help">
                    图文包按内容自动分页，包含介绍与图片。视频、完整PDF和源码通过项目页访问，不会被压成一张图。
                  </p>
                  <button className="button secondary full-width" onClick={exportProject}>
                    <DownloadSimple size={17} />
                    导出{exportFormat === 'bundle' ? '图文包' : '封面'}
                  </button>
                </div>
              </div>
            )}
          </fieldset>
          {notice && (
            <p className="field-notice">
              <Info size={16} />
              {notice}
            </p>
          )}
        </aside>
        <section
          className={'editor-canvas ' + (view === 'page' ? 'page-preview-mode' : '')}
          aria-label="项目预览"
        >
          <div className="preview-toolbar">
            <div className="segmented">
              <button
                className={view === 'page' ? 'selected' : ''}
                aria-pressed={view === 'page'}
                onClick={() => setView('page')}
              >
                <Eye size={16} />
                完整项目页
              </button>
              <button
                className={view === 'cover' ? 'selected' : ''}
                aria-pressed={view === 'cover'}
                onClick={() => setView('cover')}
              >
                <ImageSquare size={16} />
                分享封面
              </button>
            </div>
            <span className="preview-scale">实时预览</span>
          </div>
          <div className="canvas-stage">
            {view === 'page' ? (
              <div className="live-project-preview">
                <Showcase project={project} embedded />
              </div>
            ) : (
              <PosterImage project={project} width={900} className="editor-poster" />
            )}
          </div>
          <div className="template-bar">
            <div>
              <strong>封面风格</strong>
              <span>完整项目内容始终保留。</span>
            </div>
            <div className="template-options">
              {templates.map((t) => (
                <button
                  key={t.id}
                  className={'template-option ' + (project.template === t.id ? 'selected' : '')}
                  aria-label={'选择' + t.name + '模板'}
                  aria-pressed={project.template === t.id}
                  disabled={!!busy}
                  onClick={() => {
                    update({ template: t.id });
                    setView('cover');
                  }}
                >
                  <span className="template-swatch" style={{ background: t.color }}>
                    {project.template === t.id ? <Check size={15} /> : <Plus size={15} />}
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
      {busy && (
        <div className="operation-status" role="status">
          <span className="activity-dot" />
          {progress ||
            '正在' +
              (busy === 'save' ? '保存项目' : busy === 'publish' ? '发布项目' : '处理，请稍候')}
        </div>
      )}
      {error && (
        <div className="editor-error" role="alert">
          <Info size={18} />
          {error}
          <button
            className="icon-button small"
            aria-label="关闭错误提示"
            onClick={() => setError('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="editor-mobile-export">
        <button
          className="button primary"
          disabled={!!busy}
          onClick={() => setPublishConfirm(true)}
        >
          {project.publishedSlug ? '更新发布' : '发布完整项目'}
          <Globe size={18} />
        </button>
      </div>
      <Dialog.Root
        open={publishConfirm}
        onOpenChange={(open) => {
          if (!busy) setPublishConfirm(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="guide-dialog auth-dialog">
            <Dialog.Title>
              {project.publishedSlug ? '更新公开项目' : '发布你的完整项目'}
            </Dialog.Title>
            <Dialog.Description>
              访客将看到项目信息、{project.images.length}张图片，以及
              {(project.attachments || []).filter((a) => a.visible).length}
              个已勾选公开的附件。未公开的PDF与项目包仍保持私有。
            </Dialog.Description>
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="关闭发布确认"
              disabled={!!busy}
            >
              <X size={22} />
            </Dialog.Close>
            <p className="field-help publish-confirm-note">
              请确认你有权公开这些内容。发布后仍可继续修改草稿，或随时撤回。
            </p>
            <button className="button primary full-width" disabled={!!busy} onClick={publish}>
              {busy === 'publish' ? '发布中' : '确认发布'}
              <ArrowUpRightIcon />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={18} />;
}
