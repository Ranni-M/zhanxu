#!/usr/bin/env bash
# 展序 ZHANXU — 服务器更新部署
#
# 用法：sudo bash /opt/zhanxu/deploy/update.sh
#
# 流程：拉取最新代码 → 重装依赖 → 重新构建 → 重启服务 → 健康检查
# 数据不会丢失：SQLite 与上传素材都在 /var/lib/zhanxu，与代码分离。

set -euo pipefail

APP_USER="${APP_USER:-zhanxu}"
APP_DIR="${APP_DIR:-/opt/zhanxu}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

if [[ $EUID -ne 0 ]]; then
	echo "请用 root 运行：sudo bash $APP_DIR/deploy/update.sh" >&2
	exit 1
fi

echo "==> 1/4 拉取代码"
sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only || {
	echo "git pull 失败（网络或本地改动冲突），停止更新以免部署到旧代码" >&2
	echo "排查：sudo -u $APP_USER git -C $APP_DIR status" >&2
	exit 1
}

echo "==> 2/4 安装依赖"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm ci --registry='$NPM_REGISTRY'"

echo "==> 3/4 生产构建"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run build"

echo "==> 4/4 重启并检查"
systemctl restart zhanxu
sleep 3
if curl -fsS --max-time 5 http://127.0.0.1:3001/api/health >/dev/null; then
	echo "更新完成，服务正常"
else
	echo "健康检查失败！回滚代码后重试，或查看日志：" >&2
	echo "  journalctl -u zhanxu -n 50 --no-pager" >&2
	exit 1
fi
