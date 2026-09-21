import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, message } from '../lib/api';
import type { AdminAsset, AdminOverview, AdminProject } from '../lib/api';

function size(bytes: number) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function when(value: number) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

const kindLabel: Record<string, string> = {
  image: '图片',
  pdf: 'PDF',
  video: '视频',
  archive: 'ZIP',
};

export default function Admin({ onToast }: { onToast: (text: string) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [orphans, setOrphans] = useState<{ name: string; bytes: number; ageHours: number }[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [assets, setAssets] = useState<AdminAsset[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [info, list, files] = await Promise.all([
        api.adminOverview(),
        api.adminProjects(),
        api.adminOrphans(),
      ]);
      setOverview(info);
      setProjects(list.projects);
      setOrphans(files.files);
      setError('');
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(project: AdminProject) {
    if (open === project.id) {
      setOpen(null);
      setAssets([]);
      return;
    }
    setBusy('assets');
    try {
      const result = await api.adminAssets(project.id);
      setAssets(result.assets);
      setOpen(project.id);
    } catch (e) {
      onToast(message(e));
    } finally {
      setBusy('');
    }
  }

  async function run(key: string, task: () => Promise<string>) {
    setBusy(key);
    try {
      onToast(await task());
      await load();
      if (open) {
        const result = await api.adminAssets(open);
        setAssets(result.assets);
        if (!result.assets.length) setOpen(null);
      }
    } catch (e) {
      onToast(message(e));
    } finally {
      setBusy('');
    }
  }

  const visible = owner ? projects.filter((project) => project.ownerId === owner) : projects;
  const quota = overview?.maxUserBytes || 0;
  // 1 小时内新产生的文件可能是正在进行的上传，只在列表里展示，不参与清理
  const purgeable = orphans.filter((file) => file.ageHours >= 1);

  return (
    <main className="container admin-page">
      <div className="page-heading">
        <h1>站点管理</h1>
        <p>
          查看每个账号的占用，删除已上传的文件或整个项目。
          {overview?.totals.adminEmails.length
            ? ' 管理员：' + overview.totals.adminEmails.join('、')
            : ' 当前没有配置管理员（ADMIN_EMAILS 为空）。'}
        </p>
      </div>

      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}

      {overview && (
        <section className="admin-stats" aria-label="站点概况">
          <div className="admin-stat">
            <span>账号</span>
            <strong>{overview.totals.users}</strong>
          </div>
          <div className="admin-stat">
            <span>项目</span>
            <strong>{overview.totals.projects}</strong>
          </div>
          <div className="admin-stat">
            <span>已发布</span>
            <strong>{overview.totals.live}</strong>
            <small>
              公开 {overview.totals.live - overview.totals.live_private} · 私密{' '}
              {overview.totals.live_private}
            </small>
          </div>
          <div className="admin-stat">
            <span>素材</span>
            <strong>{overview.totals.files}</strong>
            <small>{size(overview.totals.bytes)}</small>
          </div>
          <div className="admin-stat">
            <span>孤儿文件</span>
            <strong>{orphans.length}</strong>
            <small>{size(orphans.reduce((sum, file) => sum + file.bytes, 0))}</small>
          </div>
          {overview.disk && (
            <div className="admin-stat">
              <span>磁盘剩余</span>
              <strong>{size(overview.disk.free)}</strong>
              <small>共 {size(overview.disk.total)}</small>
            </div>
          )}
          <div className="admin-stat">
            <span>单人配额</span>
            <strong>{size(overview.maxUserBytes)}</strong>
          </div>
        </section>
      )}

      <section className="admin-section">
        <h2>账号与占用</h2>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>账号</th>
                <th>昵称</th>
                <th>注册时间</th>
                <th className="num">项目</th>
                <th className="num">已发布</th>
                <th className="num">文件</th>
                <th className="num">占用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {overview?.users.map((user) => (
                <tr key={user.id} className={owner === user.id ? 'is-selected' : ''}>
                  <td>{user.email}</td>
                  <td>{user.name}</td>
                  <td>{when(user.created_at)}</td>
                  <td className="num">{user.project_count}</td>
                  <td className="num">
                    {user.live_count}
                    {user.private_count > 0 && (
                      <small className="admin-muted">私密 {user.private_count}</small>
                    )}
                  </td>
                  <td className="num">{user.file_count}</td>
                  <td className="num">
                    {size(user.bytes)}
                    {quota > 0 && (
                      <small className="admin-muted">
                        {Math.round((user.bytes / quota) * 100)}% 配额
                      </small>
                    )}
                  </td>
                  <td className="admin-actions">
                    <button
                      className="button secondary small"
                      onClick={() => setOwner(owner === user.id ? null : user.id)}
                    >
                      {owner === user.id ? '显示全部项目' : '只看此账号'}
                    </button>
                    <button
                      className="button text-button small danger"
                      disabled={busy !== ''}
                      onClick={() => {
                        if (
                          !window.confirm(
                            '删除账号 ' +
                              user.email +
                              '：\n\n' +
                              user.project_count +
                              ' 个项目、' +
                              user.file_count +
                              ' 个文件（' +
                              size(user.bytes) +
                              '）会被永久删除，无法恢复。\n\n确定继续？',
                          )
                        )
                          return;
                        void run('user:' + user.id, async () => {
                          const result = await api.adminDeleteUser(user.id);
                          return '账号已删除，同时清理 ' + result.removedFiles + ' 个文件。';
                        });
                      }}
                    >
                      删除账号
                    </button>
                  </td>
                </tr>
              ))}
              {!overview?.users.length && (
                <tr>
                  <td colSpan={8}>还没有账号。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>
          项目
          {owner && (
            <>
              {' '}
              <button className="button text-button small" onClick={() => setOwner(null)}>
                清除筛选（{visible.length} / {projects.length}）
              </button>
            </>
          )}
        </h2>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>作者</th>
                <th>分类</th>
                <th>更新</th>
                <th className="num">文件</th>
                <th className="num">占用</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((project) => (
                <Fragment key={project.id}>
                  <tr className={open === project.id ? 'is-selected' : ''}>
                    <td className="admin-title">{project.title}</td>
                    <td>
                      {project.ownerName}
                      <small className="admin-muted">{project.ownerEmail}</small>
                    </td>
                    <td>
                      {project.category}
                      <small className="admin-muted">{project.year}</small>
                    </td>
                    <td>{when(project.updatedAt)}</td>
                    <td className="num">{project.fileCount}</td>
                    <td className="num">{size(project.bytes)}</td>
                    <td>
                      {project.slug ? (
                        <a href={'/p/' + project.slug} target="_blank" rel="noreferrer">
                          {project.visibility === 'private' ? '私密' : '已发布'}
                        </a>
                      ) : (
                        <span className="admin-muted">草稿</span>
                      )}
                    </td>
                    <td className="admin-actions">
                      <button
                        className="button secondary small"
                        disabled={busy === 'assets' || !project.fileCount}
                        onClick={() => void toggle(project)}
                      >
                        {open === project.id ? '收起文件' : '查看文件'}
                      </button>
                      <button
                        className="button text-button small danger"
                        disabled={busy !== ''}
                        onClick={() => {
                          if (
                            !window.confirm(
                              '删除项目「' +
                                project.title +
                                '」：\n\n' +
                                '作者：' +
                                project.ownerEmail +
                                '\n' +
                                project.fileCount +
                                ' 个文件（' +
                                size(project.bytes) +
                                '）与发布快照都会被永久删除，无法恢复。\n\n确定继续？',
                            )
                          )
                            return;
                          void run('project:' + project.id, async () => {
                            const result = await api.adminDeleteProject(project.id);
                            return '项目已删除，清理 ' + result.removedFiles + ' 个文件。';
                          });
                        }}
                      >
                        删除项目
                      </button>
                    </td>
                  </tr>
                  {open === project.id && (
                    <tr>
                      <td colSpan={8} className="admin-assets">
                        <table className="admin-table inner">
                          <thead>
                            <tr>
                              <th>文件名</th>
                              <th>类型</th>
                              <th className="num">大小</th>
                              <th>上传时间</th>
                              <th>被项目引用</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assets.map((asset) => (
                              <tr key={asset.id}>
                                <td className="admin-title">{asset.name}</td>
                                <td>{kindLabel[asset.kind] || asset.kind}</td>
                                <td className="num">{size(asset.bytes)}</td>
                                <td>{when(asset.createdAt)}</td>
                                <td>{asset.used ? '是' : '否'}</td>
                                <td className="admin-actions">
                                  <button
                                    className="button text-button small danger"
                                    disabled={busy !== ''}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          '删除文件「' +
                                            asset.name +
                                            '」（' +
                                            size(asset.bytes) +
                                            '）：\n\n' +
                                            (asset.used
                                              ? '它正被项目引用，删除后会同时从项目与已发布页面移除。\n'
                                              : '') +
                                            '此操作无法恢复。\n\n确定继续？',
                                        )
                                      )
                                        return;
                                      void run('asset:' + asset.id, async () => {
                                        await api.adminDeleteAsset(asset.id);
                                        return '已删除「' + asset.name + '」。';
                                      });
                                    }}
                                  >
                                    删除文件
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {!assets.length && (
                              <tr>
                                <td colSpan={6}>这个项目没有文件。</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={8}>没有项目。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>孤儿文件</h2>
        <p className="field-help">
          数据库里没有记录、但磁盘上还留着的文件（上传中断、导出失败等）。 清理只删除 1
          小时以前的文件，不会影响正在进行的上传。
        </p>
        {orphans.length ? (
          <>
            <ul className="admin-orphans">
              {orphans.slice(0, 20).map((file) => (
                <li key={file.name}>
                  <code>{file.name}</code>
                  <span>
                    {size(file.bytes)} · {file.ageHours} 小时前
                    {file.ageHours < 1 ? ' · 暂不清理' : ''}
                  </span>
                </li>
              ))}
            </ul>
            {orphans.length > 20 && (
              <p className="field-help">另有 {orphans.length - 20} 个未显示。</p>
            )}
            <button
              className="button secondary"
              disabled={busy !== '' || !purgeable.length}
              onClick={() => {
                if (
                  !window.confirm(
                    '清理 ' +
                      purgeable.length +
                      ' 个孤儿文件？\n\n1 小时内新产生的文件会保留（可能是正在进行的上传）。此操作无法恢复。',
                  )
                )
                  return;
                void run('orphans', async () => {
                  const result = await api.adminPurgeOrphans();
                  return '已清理 ' + result.removed + ' 个孤儿文件。';
                });
              }}
            >
              {busy === 'orphans' ? '正在清理' : '清理 ' + purgeable.length + ' 个孤儿文件'}
            </button>
          </>
        ) : (
          <p className="field-help">没有孤儿文件。</p>
        )}
      </section>
    </main>
  );
}
