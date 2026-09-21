import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  SquaresFour,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Moon,
  Sun,
  List,
  X,
  Check,
  UploadSimple,
  Layout,
  DownloadSimple,
  Globe,
  SignOut,
} from '@phosphor-icons/react';
import type { Project, TemplateId } from './data';
import { createProject, samples } from './data';
import { api, message, uploadAsset } from './lib/api';
import { readArchive } from './lib/archive';
import { putAsset, dataUrlFile } from './services/asset-service';
import { projectService, setGuestMode } from './services/project-service';
import { readGuestProjects, clearGuestProjects } from './infrastructure/local-project-repository';
import type { User } from './lib/api';
import Home from './pages/Home';
import Templates from './pages/Templates';
import Works from './pages/Works';
import Account from './pages/Account';
import Admin from './pages/Admin';
import AuthDialog from './components/AuthDialog';
import Showcase from './components/Showcase';
const Editor = lazy(() => import('./components/Editor'));
function getTheme() {
  try {
    return (
      localStorage.getItem('zhanxu-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  } catch {
    return 'light';
  }
}
export default function App() {
  return (
    <BrowserRouter>
      <Application />
    </BrowserRouter>
  );
}
function Application() {
  const navigate = useNavigate(),
    location = useLocation();
  const [user, setUser] = useState<User | null>(null),
    [sessionLoading, setSessionLoading] = useState(true),
    [authOpen, setAuthOpen] = useState(false),
    [serverError, setServerError] = useState('');
  const [theme, setTheme] = useState(getTheme),
    [menu, setMenu] = useState(false),
    [guide, setGuide] = useState(false),
    [toast, setToast] = useState(''),
    [creating, setCreating] = useState(false),
    [worksKey, setWorksKey] = useState(0);
  const [importing, setImporting] = useState(false),
    [importText, setImportText] = useState('');
  const [published, setPublished] = useState<Project[]>([]),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [bookmarks, setBookmarks] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pending = useRef<(() => void) | null>(null);
  const editorRoute = location.pathname.startsWith('/studio/');
  const notify = useCallback((value: string) => {
    setToast(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 4500);
  }, []);
  async function refreshPublic(offset = 0) {
    try {
      const result = await api.publications(offset);
      setPublished((p) => (offset ? [...p, ...result.projects] : result.projects));
      setNextOffset(result.nextOffset);
    } catch (e) {
      setServerError(message(e));
    }
  }
  async function session() {
    setSessionLoading(true);
    try {
      const next = (await api.me()).user;
      setUser(next);
      setGuestMode(!next);
      setServerError('');
    } catch (e) {
      setServerError(message(e));
    } finally {
      setSessionLoading(false);
    }
  }
  useEffect(() => {
    void session();
    void refreshPublic();
    return () => clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (user)
      api
        .bookmarks()
        .then((r) => setBookmarks(r.ids))
        .catch(() => {});
    else setBookmarks([]);
  }, [user]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#191c19' : '#fafaf8');
    try {
      localStorage.setItem('zhanxu-theme', theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.page = editorRoute ? 'editor' : 'site';
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname, editorRoute]);
  useEffect(() => {
    const key = () => {
        document.documentElement.dataset.input = 'keyboard';
      },
      pointer = () => {
        document.documentElement.dataset.input = 'pointer';
      };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', pointer, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', pointer, true);
    };
  }, []);
  function signIn(after?: () => void) {
    pending.current = after || null;
    setAuthOpen(true);
  }
  async function createRemote(template: TemplateId) {
    setCreating(true);
    try {
      const result = await api.create(template);
      navigate('/studio/' + result.project.id);
    } catch (e) {
      notify(message(e));
    } finally {
      setCreating(false);
    }
  }
  /**
   * 零填写导入：压缩包 → 规则解析 → 自动建项目、传图、回填文字。
   * 解析全部在浏览器里做（见 lib/archive.ts），服务端只负责存。
   */
  async function importArchive(file: File) {
    if (!/\.zip$/i.test(file.name)) {
      notify('先把文件夹压成 .zip 再拖进来，其他格式还在路上。');
      return;
    }
    setImporting(true);
    setImportText('正在打开压缩包…');
    try {
      // 游客也能用：没有账号就建一个只存在这台浏览器里的草稿
      const created = user
        ? (await api.create('editorial')).project
        : await projectService.save({ ...createProject(), title: '未命名作品' });
      const id = created.id;
      const parsed = await readArchive(file, setImportText);
      const images: Project['images'] = [];
      for (const [index, image] of parsed.images.entries()) {
        setImportText('正在上传图片 ' + (index + 1) + ' / ' + parsed.images.length);
        const uploaded = await putAsset(id, image, () => {});
        if (uploaded.kind === 'image')
          images.push({ id: uploaded.id, src: uploaded.src, name: uploaded.name });
      }
      setImportText('正在生成展示页…');
      const filled = { ...created, ...parsed.patch, images };
      if (user) await api.save(filled);
      else await projectService.save(filled);
      notify(parsed.notice);
      navigate('/studio/' + id);
    } catch (e) {
      notify(message(e));
    } finally {
      setImporting(false);
      setImportText('');
    }
  }
  /**
   * 游客模式：不登录也能开工。草稿进浏览器，导出在本地算，只有发布要账号。
   */
  async function startGuest(template: TemplateId) {
    clearTimeout(timer.current);
    const draft = await projectService.save({ ...createProject(), template, title: '未命名作品' });
    navigate('/studio/' + draft.id);
  }
  function start(template: TemplateId = 'editorial') {
    if (!user) {
      setGuestMode(true);
      void startGuest(template);
      return;
    }
    void createRemote(template);
  }
  /** 登录后把浏览器里的草稿搬进账号：图片重新上传，随后清掉本地副本 */
  async function migrateGuestDrafts() {
    const drafts = await readGuestProjects();
    if (!drafts.length) return 0;
    let moved = 0;
    for (const draft of drafts) {
      try {
        const created = (await api.create(draft.template)).project;
        const images: Project['images'] = [];
        const remap = new Map<string, string>();
        for (const [index, image] of draft.images.entries()) {
          if (!image.src.startsWith('data:')) {
            images.push(image);
            continue;
          }
          const file = await dataUrlFile(image.src, image.name || 'image-' + (index + 1));
          const uploaded = await uploadAsset(created.id, file, () => {});
          if (uploaded.kind !== 'image') continue;
          remap.set(image.id, uploaded.id);
          images.push({ id: uploaded.id, src: uploaded.src, name: uploaded.name });
        }
        const ids = (list: string[]) => list.map((id) => remap.get(id) || id).filter(Boolean);
        await api.save({
          ...created,
          title: draft.title,
          subtitle: draft.subtitle,
          author: draft.author,
          category: draft.category,
          year: draft.year,
          intro: draft.intro,
          process: draft.process,
          role: draft.role,
          tools: draft.tools,
          demoUrl: draft.demoUrl,
          repositoryUrl: draft.repositoryUrl,
          template: draft.template,
          coverIndex: draft.coverIndex,
          skeleton: draft.skeleton,
          posterSize: draft.posterSize,
          meta: draft.meta,
          colorways: draft.colorways,
          options: (draft.options || []).map((o) => ({ ...o, imageIds: ids(o.imageIds) })),
          compares: (draft.compares || []).map((c) => ({
            ...c,
            before: remap.get(c.before) || c.before,
            after: remap.get(c.after) || c.after,
          })),
          sections: (draft.sections || []).map((s) => ({ ...s, imageIds: ids(s.imageIds) })),
          images,
          attachments: [],
        });
        moved++;
      } catch (e) {
        notify('有一份本地草稿没能搬进账号：' + message(e));
      }
    }
    if (moved) {
      await clearGuestProjects();
      notify('已把 ' + moved + ' 份浏览器草稿搬进账号。');
    }
    return moved;
  }
  function openProject(project: Project) {
    navigate(project.sample ? '/demo/' + project.id : '/p/' + project.publishedSlug);
  }
  async function bookmark(id: string) {
    if (!user) {
      signIn();
      return;
    }
    const saved = !bookmarks.includes(id);
    try {
      await api.bookmark(id, saved);
      setBookmarks((b) => (saved ? [...b, id] : b.filter((i) => i !== id)));
    } catch (e) {
      notify(message(e));
    }
  }
  async function logout() {
    try {
      await api.logout();
      setUser(null);
      navigate('/');
      notify('已退出登录。');
    } catch (e) {
      notify(message(e));
    }
  }
  function protectedPage(content: React.ReactNode) {
    if (sessionLoading) return <Loading />;
    if (!user)
      return (
        <main className="container">
          <div className="empty-state auth-gate">
            <h1>为你的项目，留一个位置。</h1>
            <p>登录后保存完整作品，发布展示页，并在不同设备继续编辑。</p>
            <button className="button primary" onClick={() => signIn()}>
              登录 / 注册
              <ArrowRight size={18} />
            </button>
          </div>
        </main>
      );
    return content;
  }
  const nav = (
    <>
      <NavLink to="/" end>
        发现作品
      </NavLink>
      <NavLink to="/templates">展示模板</NavLink>
      <NavLink to="/works">我的作品</NavLink>
      {user?.isAdmin && <NavLink to="/admin">站点管理</NavLink>}
    </>
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      {!editorRoute && (
        <header className="site-header">
          <div className="header-inner">
            <button className="brand" onClick={() => navigate('/')} aria-label="展序首页">
              <span className="brand-symbol">
                <SquaresFour size={24} weight="fill" />
              </span>
              <span className="brand-name">
                展序<span>ZHANXU</span>
              </span>
            </button>
            <nav className="desktop-nav" aria-label="主导航">
              {nav}
            </nav>
            <div className="header-actions">
              <button className="guide-link" onClick={() => setGuide(true)}>
                创作指南
                <ArrowUpRight size={13} />
              </button>
              <button
                className="icon-button theme-toggle"
                aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
                onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              >
                {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
              </button>
              {user ? (
                <>
                  <button
                    className="account-button"
                    onClick={() => navigate('/account')}
                    title={user.email}
                  >
                    {user.name.slice(0, 5)}
                  </button>
                  <button
                    className="icon-button signout-button"
                    onClick={logout}
                    aria-label="退出登录"
                  >
                    <SignOut size={17} />
                  </button>
                </>
              ) : (
                <button className="login-link" onClick={() => signIn()}>
                  登录
                </button>
              )}
              <button
                className="button primary header-create"
                onClick={() => start()}
                disabled={creating}
              >
                <Plus size={17} />
                {creating ? '创建中' : '创建作品'}
              </button>
              <button
                className="icon-button mobile-menu-toggle"
                aria-label={menu ? '关闭导航' : '打开导航'}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X size={23} /> : <List size={23} />}
              </button>
            </div>
          </div>
          {menu && (
            <nav className="mobile-nav" aria-label="手机导航">
              {nav}
              <button onClick={() => setGuide(true)}>创作指南</button>
              {user && <button onClick={logout}>退出登录</button>}
            </nav>
          )}
        </header>
      )}
      {serverError && (
        <div className="connection-error" role="alert">
          服务连接失败：{serverError}
          <button
            onClick={() => {
              void session();
              void refreshPublic();
            }}
          >
            重试连接
          </button>
        </div>
      )}
      <div id="main-content" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <Home
                projects={published}
                bookmarks={bookmarks}
                start={start}
                onOpen={openProject}
                onUse={(p) => navigate('/demo/' + p.id)}
                onTemplates={() => navigate('/templates')}
                onBookmark={bookmark}
                onImportZip={(file) => void importArchive(file)}
                importing={importing}
                importText={importText}
                nextOffset={nextOffset}
                onLoadMore={() => {
                  if (nextOffset !== null) void refreshPublic(nextOffset);
                }}
              />
            }
          />
          <Route
            path="/templates"
            element={<Templates onBack={() => navigate('/')} start={start} />}
          />
          <Route
            path="/works"
            element={
              <Works
                key={worksKey}
                guest={!user}
                start={() => start()}
                onSignIn={() => signIn()}
                onEdit={(p) => navigate('/studio/' + p.id)}
                onToast={notify}
              />
            }
          />
          <Route
            path="/account"
            element={protectedPage(user ? <Account user={user} onToast={notify} /> : null)}
          />
          <Route
            path="/studio/:id"
            element={
              <Studio
                guest={!user}
                onSaved={() => void refreshPublic()}
                onSignIn={() => signIn()}
                onToast={notify}
              />
            }
          />
          <Route
            path="/admin"
            element={protectedPage(
              user?.isAdmin ? (
                <Admin onToast={notify} />
              ) : (
                <main className="container">
                  <div className="empty-state">
                    <h1>没有访问权限。</h1>
                    <p>这个页面只对站点管理员开放。</p>
                  </div>
                </main>
              ),
            )}
          />
          <Route path="/p/:slug" element={<PublicProject onUse={(p) => start(p.template)} />} />
          <Route
            path="/demo/:slug"
            element={<PublicProject demo onUse={(p) => start(p.template)} />}
          />
          <Route
            path="*"
            element={
              <main className="container">
                <div className="empty-state">
                  <h1>这个页面还没有作品。</h1>
                  <button className="button primary" onClick={() => navigate('/')}>
                    返回首页
                  </button>
                </div>
              </main>
            }
          />
        </Routes>
      </div>
      {!editorRoute && (
        <footer className="site-footer container">
          <div className="footer-brand">
            <SquaresFour size={20} weight="fill" />
            <strong>展序</strong>
            <span>让好作品，被好好看见。</span>
          </div>
          <div>
            <button onClick={() => setGuide(true)}>使用说明</button>
            <span>为每一位认真创作的人而做</span>
          </div>
        </footer>
      )}
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSuccess={(next) => {
          setUser(next);
          setGuestMode(false);
          void migrateGuestDrafts().then(() => setWorksKey((k) => k + 1));
          const action = pending.current;
          pending.current = null;
          action?.();
        }}
      />
      <Dialog.Root open={guide} onOpenChange={setGuide}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="guide-dialog">
            <Dialog.Title>展示一个完整的项目。</Dialog.Title>
            <Dialog.Description>封面只是入口，你的创作值得被完整看见。</Dialog.Description>
            <Dialog.Close className="dialog-close icon-button" aria-label="关闭创作指南">
              <X size={22} />
            </Dialog.Close>
            <div className="guide-steps">
              <div>
                <UploadSimple size={25} />
                <h3>带上真实成果</h3>
                <p>上传图片、完整PDF、演示视频或ZIP项目包。PDF自动尝试生成预览与提取摘要。</p>
              </div>
              <div>
                <Layout size={25} />
                <h3>按内容组织</h3>
                <p>填写职责、过程和工具，添加功能、角色、架构等模块，并关联对应图片。</p>
              </div>
              <div>
                <Globe size={25} />
                <h3>发布项目页</h3>
                <p>选择要公开的附件，发布后通过独立链接访问完整项目。草稿修改后可更新发布。</p>
              </div>
              <div>
                <DownloadSimple size={25} />
                <h3>导出求职材料</h3>
                <p>下载1600像素封面，或自动分页的图文ZIP包。视频与完整文件保留在项目页。</p>
              </div>
            </div>
            <div className="guide-local">
              <Check size={18} />
              <p>原始PDF与项目包默认私有。公开页只提供你选择公开的内容。ZIP不解压、不执行。</p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setGuide(false);
                start();
              }}
            >
              创建作品
              <ArrowRight size={17} />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className={'toast ' + (toast ? 'visible' : '')} role="status" aria-live="polite">
        {toast && (
          <>
            <Check size={18} />
            {toast}
            <button
              className="icon-button small"
              onClick={() => setToast('')}
              aria-label="关闭提示"
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </>
  );
}
function Loading() {
  return (
    <div className="editor-loading" role="status">
      <div className="skeleton" />
      <p>正在加载项目…</p>
    </div>
  );
}
function Studio({
  guest,
  onSaved,
  onSignIn,
  onToast,
}: {
  guest: boolean;
  onSaved: () => void;
  onSignIn: () => void;
  onToast: (m: string) => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setProject(null);
    setError('');
    // 游客草稿在浏览器里，登录后的项目在服务端
    const load = guest
      ? projectService.list().then((list) => {
          const found = list.find((item) => item.id === id);
          if (!found) throw new Error('这台浏览器里没有这份草稿，可能是换了设备或清了缓存。');
          return { project: found };
        })
      : api.project(id!);
    load
      .then((r) => {
        if (active) setProject(r.project);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [id, guest]);
  if (error)
    return (
      <div className="empty-state">
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => navigate('/works')}>
          返回我的作品
        </button>
      </div>
    );
  if (!project) return <Loading />;
  return (
    <Suspense fallback={<Loading />}>
      <Editor
        key={project.id}
        initial={project}
        guest={guest}
        onBack={() => navigate('/works')}
        onSaved={onSaved}
        onSignIn={onSignIn}
        onToast={onToast}
      />
    </Suspense>
  );
}
function PublicProject({ demo = false, onUse }: { demo?: boolean; onUse: (p: Project) => void }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setProject(null);
    setError('');
    if (demo) {
      const sample = samples.find((p) => p.id === slug);
      if (sample) setProject(sample);
      else setError('示例不存在。');
    } else
      api
        .publication(slug!)
        .then((r) => {
          if (active) setProject(r.project);
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    return () => {
      active = false;
    };
  }, [slug, demo]);
  useEffect(() => {
    if (project) document.title = project.title + ' | 展序';
    return () => {
      document.title = '展序 ZHANXU · 毕设作品展示';
    };
  }, [project]);
  return (
    <main className="public-project container">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={16} />
        发现更多作品
      </button>
      {error ? (
        <div className="empty-state">
          <h1>这个作品暂时无法访问。</h1>
          <p>{error}</p>
        </div>
      ) : project ? (
        <Showcase project={project} onUse={demo ? onUse : undefined} />
      ) : (
        <Loading />
      )}
    </main>
  );
}
