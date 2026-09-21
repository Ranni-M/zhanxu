import { useState } from 'react';
import { api, message } from '../lib/api';
import type { User } from '../lib/api';
export default function Account({
  user,
  onToast,
}: {
  user: User;
  onToast: (message: string) => void;
}) {
  const [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.changePassword(current, password);
      setCurrent('');
      setPassword('');
      onToast('密码已更新，其他设备的登录已失效。');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container account-page">
      <div className="page-heading">
        <h1>账号设置</h1>
        <p>
          {user.name} / {user.email}
        </p>
      </div>
      <form className="account-form" onSubmit={submit}>
        <h2>修改密码</h2>
        <fieldset disabled={busy}>
          <label className="field">
            当前密码
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label className="field">
            新密码
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              maxLength={128}
              required
            />
          </label>
          <p className="field-help">至少10个字符。修改后其他设备需要重新登录。</p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" type="submit">
            {busy ? '正在更新' : '更新密码'}
          </button>
        </fieldset>
      </form>
    </main>
  );
}
