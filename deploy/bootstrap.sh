#!/usr/bin/env bash
# 展序 ZHANXU — 服务器一键初始化（Ubuntu 22.04 / 24.04）
#
# 用法：
#   已备案 + 有域名（自动 HTTPS）：
#     sudo DOMAIN=zhanxu.example.com bash deploy/bootstrap.sh
#
#   还没备案 / 没有域名（用 http://公网IP:3001 访问）：
#     sudo bash deploy/bootstrap.sh
#
# 幂等：可重复执行；已存在的 .env 不会被覆盖。

set -euo pipefail

APP_USER="${APP_USER:-zhanxu}"
APP_DIR="${APP_DIR:-/opt/zhanxu}"
DATA_DIR="${DATA_DIR:-/var/lib/zhanxu}"
REPO_URL="${REPO_URL:-https://github.com/Ranni-M/zhanxu.git}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
DOMAIN="${DOMAIN:-}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[提示] %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
	echo "请用 root 运行：sudo bash deploy/bootstrap.sh" >&2
	exit 1
fi

if ! grep -qi ubuntu /etc/os-release && ! grep -qi debian /etc/os-release; then
	warn "本脚本面向 Ubuntu/Debian。其他发行版请手动安装 Node 24 + 中文字体。"
fi

# ---------------------------------------------------------------- 1. 基础依赖
log "1/8 安装基础依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends git curl ca-certificates gnupg

# ---------------------------------------------------------------- 2. Node 24
log "2/8 安装 Node.js 24"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v24.* ]]; then
	curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
	apt-get install -y -qq nodejs
fi
echo "node $(node -v) / npm $(npm -v)"
if [[ "$(node -v)" != v24.* ]]; then
	warn "当前 Node 不是 v24，package.json 要求 >=24，可能存在兼容问题。"
fi

# ---------------------------------------------------------------- 3. 中文字体
log "3/8 安装中文字体（封面/图文包导出中文渲染必需）"
apt-get install -y -qq --no-install-recommends fonts-noto-cjk
fc-cache -f >/dev/null 2>&1 || true

# ---------------------------------------------------------------- 4. swap
log "4/8 检查内存与 swap"
mem_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
if [[ $mem_mb -lt 1900 ]] && ! swapon --show 2>/dev/null | grep -q .; then
	fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
	chmod 600 /swapfile
	mkswap /swapfile >/dev/null
	swapon /swapfile
	grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
	echo "内存 ${mem_mb}MB，已启用 2G swap"
else
	echo "内存 ${mem_mb}MB，无需 swap"
fi

# ---------------------------------------------------------------- 5. 用户与目录
log "5/8 创建运行用户与数据目录"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
	useradd --system --create-home --shell /bin/bash "$APP_USER"
fi
mkdir -p "$APP_DIR" "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"
echo "代码 $APP_DIR / 数据 $DATA_DIR"

# ---------------------------------------------------------------- 6. 拉代码构建
log "6/8 拉取代码并构建（首次约 2-5 分钟）"
if [[ -d "$APP_DIR/.git" ]]; then
	sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only ||
		warn "git pull 失败（网络或冲突），继续使用本地已有代码"
else
	# 允许脚本自身就在仓库里运行时，直接用本地副本
	if [[ -f "$(dirname "$0")/../package.json" && -d "$(dirname "$0")/../.git" ]]; then
		src="$(cd "$(dirname "$0")/.." && pwd)"
		if [[ "$src" != "$APP_DIR" ]]; then
			cp -a "$src/." "$APP_DIR/"
			chown -R "$APP_USER:$APP_USER" "$APP_DIR"
		fi
	else
		sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
	fi
fi

sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm config set registry '$NPM_REGISTRY' >/dev/null && npm ci --registry='$NPM_REGISTRY'"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run build"

# ---------------------------------------------------------------- 7. .env
log "7/8 生成 .env 配置"
ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
	echo ".env 已存在，保持不变（如需修改请手动编辑）"
else
	public_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || echo '你的服务器IP')"
	if [[ -n "$DOMAIN" ]]; then
		cat >"$ENV_FILE" <<EOF
# 展序 ZHANXU 生产配置（已备案域名 + Caddy 自动 HTTPS）
NODE_ENV=production
PORT=3001
HOST=127.0.0.1
DATA_DIR=$DATA_DIR
PUBLIC_ORIGIN=https://$DOMAIN
COOKIE_SECURE=true
TRUST_PROXY=1
MAX_USER_STORAGE_MB=500
# 先保持 true 以便你注册第一个账号；注册完成后改成 false 再 systemctl restart zhanxu
ALLOW_REGISTRATION=true
EOF
	else
		cat >"$ENV_FILE" <<EOF
# 展序 ZHANXU 生产配置（无域名，直接 http://IP:3001 访问）
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATA_DIR=$DATA_DIR
PUBLIC_ORIGIN=http://$public_ip:3001
# HTTP 下必须为 false，否则浏览器不保存会话 Cookie，登录会失败
COOKIE_SECURE=false
# 未经过反向代理，不要设置 TRUST_PROXY
MAX_USER_STORAGE_MB=500
# 先保持 true 以便你注册第一个账号；注册完成后改成 false 再 systemctl restart zhanxu
ALLOW_REGISTRATION=true
EOF
	fi
	chown "$APP_USER:$APP_USER" "$ENV_FILE"
	chmod 600 "$ENV_FILE"
	echo "已写入 $ENV_FILE"
fi

# ---------------------------------------------------------------- 8. systemd / Caddy
log "8/8 安装 systemd 服务"
install -m 644 "$APP_DIR/deploy/zhanxu.service" /etc/systemd/system/zhanxu.service
systemctl daemon-reload
systemctl enable zhanxu >/dev/null
systemctl restart zhanxu

sleep 3
if curl -fsS --max-time 5 http://127.0.0.1:3001/api/health >/dev/null; then
	echo "应用已启动：/api/health OK"
else
	warn "健康检查失败，请查看：journalctl -u zhanxu -n 50 --no-pager"
fi

if [[ -n "$DOMAIN" ]]; then
	log "配置 Caddy 自动 HTTPS"
	export DEBIAN_FRONTEND=noninteractive
	if ! command -v caddy >/dev/null 2>&1; then
		apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
		curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
			gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
		curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
			>/etc/apt/sources.list.d/caddy-stable.list
		apt-get update -qq
		apt-get install -y -qq caddy
	fi
	sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/" "$APP_DIR/deploy/Caddyfile" >/etc/caddy/Caddyfile
	mkdir -p /var/log/caddy
	chown -R caddy:caddy /var/log/caddy
	systemctl enable caddy >/dev/null 2>&1 || true
	systemctl restart caddy
	echo "Caddy 已启动，证书申请日志：journalctl -u caddy -n 50 --no-pager"
fi

cat <<EOF

================================================================
部署完成

$(if [[ -n "$DOMAIN" ]]; then echo "访问地址：https://$DOMAIN"; else echo "访问地址：$(grep '^PUBLIC_ORIGIN' "$ENV_FILE" | cut -d= -f2-)"; fi)

常用命令：
  查看状态   systemctl status zhanxu
  查看日志   journalctl -u zhanxu -f
  重启       sudo systemctl restart zhanxu
  更新部署   sudo bash $APP_DIR/deploy/update.sh

务必先做的事：
  1. 浏览器打开上面地址，注册你自己的第一个账号
  2. 注册成功后，把 $ENV_FILE 里的 ALLOW_REGISTRATION 改成 false，
     再执行 sudo systemctl restart zhanxu，防止陌生人注册占用你的磁盘
  3. 把 .env 里的 PUBLIC_ORIGIN 与实际访问地址核对一致（协议+域名/端口必须完全一致）
  4. 首次公开前先自己走一遍：上传素材 → 发布 → 匿名窗口打开公开链接 → 导出封面
================================================================
EOF
