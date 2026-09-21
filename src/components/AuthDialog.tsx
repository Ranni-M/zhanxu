import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ArrowRight, Eye, EyeSlash } from '@phosphor-icons/react';
import { api, message } from '../lib/api';
import type { User } from '../lib/api';
export default function AuthDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (user: User) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(name, email, password);
      setPassword('');
      onSuccess(result.user);
      onOpenChange(false);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          onOpenChange(value);
          setError('');
          setPassword('');
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="guide-dialog auth-dialog">
          <Dialog.Title>
            {mode === 'login' ? '欢迎回到展序' : '把作品，变成新的开始。'}
          </Dialog.Title>
          <Dialog.Description>
            {mode === 'login'
              ? '登录后继续编辑、发布和分享你的项目。'
              : '创建账号，保存完整项目，让别人看见你的创作。'}
          </Dialog.Description>
          <Dialog.Close className="dialog-close icon-button" aria-label="关闭登录" disabled={busy}>
            <X size={22} />
          </Dialog.Close>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {mode === 'register' && (
                <label className="field">
                  你的名字
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={40}
                  />
                </label>
              )}
              <label className="field">
                邮箱
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                />
              </label>
              <label className="field">
                密码
                <span className="password-field">
                  <input
                    type={visible ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={10}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? '隐藏密码' : '显示密码'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                <span className="field-help">至少10个字符</span>
              </label>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary auth-submit" type="submit">
                {busy ? '正在处理' : mode === 'login' ? '登录' : '注册账号'}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
          <button
            className="text-link"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
            disabled={busy}
          >
            {mode === 'login' ? '还没有账号？注册一个' : '已有账号？直接登录'}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
