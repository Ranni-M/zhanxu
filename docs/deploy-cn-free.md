# 国内云免费试用部署（不需要信用卡）

面向"没有信用卡、想用公网访问"的场景。全程只需**实名认证**（身份证 + 人脸/微信/支付宝），不需要绑定信用卡。

配套文件都在 [`deploy/`](../deploy/) 目录：

| 文件                    | 用途                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `deploy/bootstrap.sh`   | 服务器一键初始化：Node 24、中文字体、swap、用户、构建、systemd、Caddy |
| `deploy/zhanxu.service` | systemd 常驻服务定义（含安全加固）                                    |
| `deploy/Caddyfile`      | Caddy 反向代理 + 自动 HTTPS                                           |
| `deploy/update.sh`      | 后续更新部署（拉代码 → 构建 → 重启 → 健康检查）                       |

---

## 0. 先选路线，这决定了后面所有配置

| 路线                | 访问地址                        | 备案                                     | 加密          | 适合                  |
| ------------------- | ------------------------------- | ---------------------------------------- | ------------- | --------------------- |
| **A. 纯 IP**        | `http://公网IP:3001`            | 不需要                                   | ❌ HTTP 明文  | 最快，自己/老师临时看 |
| **B. 域名 + Caddy** | `https://你的域名`              | **必须 ICP 备案**                        | ✅ 自动 HTTPS | 正规长期使用          |
| **C. 隧道回源**     | `https://xxx.trycloudflare.com` | 技术可行，但**面向公众提供服务仍应备案** | ✅ HTTPS      | 过渡期应急            |

> ⚠️ **备案是国内服务器的硬门槛**：未备案的域名解析到国内 IP，80/443 会被云厂商接入层拦截。隧道方案虽然源站是出站连接、不触发拦截，但按规定面向公众提供服务的网站仍应办理备案，不要拿它当长期合规方案。
>
> 路线 A 的代价要说清楚：**HTTP 明文传输，登录密码不加密**。只适合演示期临时用，别在里面放真实敏感信息。

---

## 1. 领机器（实名认证，不要卡）

**腾讯云**（轻量应用服务器 2C2G 免费试用 3 个月）

1. 注册腾讯云账号 → **实名认证**（微信/支付宝人脸，几分钟）
2. 进入「云产品免费体验馆」→ 找到**轻量应用服务器 Lighthouse** → 选 2C2G 套餐试用 3 个月
3. 限"产品新用户"：同实名主体名下任何账号买过/试用过该产品就没有资格

**阿里云**（新用户试用额度，个人 300 元）

1. 注册 → 实名认证 → `free.aliyun.com` 领取试用额度
2. 用额度开一台 ECS（突发性能实例即可）

**选型提示**：这台机器要跑 Node + SQLite + 图片导出，**内存 ≥2GB、磁盘 ≥40GB** 比较稳。

---

## 2. 创建实例并放行端口

- 镜像：**Ubuntu 24.04 LTS**（本部署脚本按 Ubuntu/Debian 写）
- 登录方式：设置 root 密码，或绑定 SSH 密钥
- **控制台防火墙/安全组**放行：

| 端口     | 用途                       | 何时需要                             |
| -------- | -------------------------- | ------------------------------------ |
| 22       | SSH                        | 必须                                 |
| 80 + 443 | Caddy（HTTP 跳转 + HTTPS） | 路线 B                               |
| 3001     | 应用直连                   | **仅路线 A**，且建议演示期结束后关掉 |

> 路线 B 下**不要**放行 3001，一切走 Caddy 反代。
> 如果服务器启用了 `ufw`，还要 `ufw allow 22,80,443/tcp`。

---

## 3. 一键部署

用 root 登录服务器后：

```sh
# 1) 拉代码（GitHub 慢/失败见下方备选方案）
git clone https://github.com/Ranni-M/zhanxu.git /opt/zhanxu

# 2) 路线 B：已备案且有域名
DOMAIN=zhanxu.example.com bash /opt/zhanxu/deploy/bootstrap.sh

#    路线 A：还没备案、没域名
bash /opt/zhanxu/deploy/bootstrap.sh
```

脚本会依次完成：装基础依赖 → **装 Node 24** → **装 fonts-noto-cjk 中文字体** → 内存不足时加 2G swap → 建 `zhanxu` 系统用户和 `/var/lib/zhanxu` 数据目录 → `npm ci` + `npm run build` → 写 `.env` → 装 systemd 服务 →（路线 B）装 Caddy 自动申请证书。

首次约 2–5 分钟。结束时会打印访问地址。

**GitHub 拉取慢或超时的备选方案**：在本地打包上传（排除依赖与数据）：

```sh
# 本地执行
tar --exclude=node_modules --exclude=data --exclude=dist -czf zhanxu.tar.gz .
scp zhanxu.tar.gz root@你的服务器IP:/root/

# 服务器执行
mkdir -p /opt/zhanxu && tar xzf /root/zhanxu.tar.gz -C /opt/zhanxu
bash /opt/zhanxu/deploy/bootstrap.sh
```

### `.env` 关键项（脚本已自动生成，理解一下便于排查）

| 配置                 | 路线 A（IP:3001）     | 路线 B（域名） | 说明                                                    |
| -------------------- | --------------------- | -------------- | ------------------------------------------------------- |
| `NODE_ENV`           | production            | production     | 影响静态资源缓存头                                      |
| `HOST`               | `0.0.0.0`             | `127.0.0.1`    | 路线 B 只监听本机，由 Caddy 转发                        |
| `DATA_DIR`           | `/var/lib/zhanxu`     | 同             | SQLite 与上传素材，**备份就是备份这个目录**             |
| `PUBLIC_ORIGIN`      | `http://IP:3001`      | `https://域名` | **必须与浏览器地址完全一致**，否则登录/发布链接异常     |
| `COOKIE_SECURE`      | **false**             | true           | HTTP 下必须 false，否则浏览器不存会话 Cookie → 登录失败 |
| `TRUST_PROXY`        | 不设置                | `1`            | 只在确实有一层可信反代时开                              |
| `ALLOW_REGISTRATION` | true → 注册后改 false | 同             | 脚本默认 true 以便你注册首个账号                        |

---

## 4. 部署后必做

```sh
# 先注册账号（此时 ALLOW_REGISTRATION 还是 true）
# 浏览器打开部署输出的地址，注册并登录

# 注册成功后关掉注册入口，防止陌生人占磁盘
sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=false/' /opt/zhanxu/.env
systemctl restart zhanxu
```

然后自己走一遍完整链路：**上传素材 → 发布 → 用匿名窗口打开公开链接 → 导出封面/图文包**。

---

## 5. 验证与日常运维

```sh
systemctl status zhanxu                      # 服务状态
journalctl -u zhanxu -f                      # 实时日志
curl -s http://127.0.0.1:3001/api/health     # {"ok":true}
journalctl -u caddy -n 50 --no-pager         # 证书申请结果（路线 B）

sudo bash /opt/zhanxu/deploy/update.sh       # 更新部署
```

**备份**（先停写入，保持数据库与文件一致）：

```sh
sudo systemctl stop zhanxu
sudo -u zhanxu bash -lc 'cd /opt/zhanxu && npm run backup -- /var/backups/zhanxu-$(date +%F)'
sudo systemctl start zhanxu
```

目标目录必须**尚不存在**且不在 `DATA_DIR` 内。恢复时把备份里的 `zhanxu.sqlite` 与 `files/` 放回 `DATA_DIR`，保留原目录作回退，再启动服务。

**试用到期怎么办**：数据都在 `/var/lib/zhanxu`，与代码分离，所以可以直接打包迁走：

```sh
tar czf zhanxu-data.tar.gz -C /var/lib zhanxu
```

新服务器重跑 `bootstrap.sh`，解包数据目录，改 `.env` 里的 `PUBLIC_ORIGIN` 即可。

---

## 6. 备案（路线 B 的前置条件）

腾讯云/阿里云控制台「网站备案」提交，材料一般包括：域名（已实名）、服务器实例（**包月时长 ≥3 个月，且备案期间剩余有效期 ≥1 个月**）、身份证、真实性核验（APP 人脸或幕布拍照）。管局审核通常 1–20 个工作日。

**备案审核期间 80/443 不可用**，所以推荐顺序：先按路线 A 用 `IP:3001` 把功能跑通并演示，备案通过后再切路线 B（改 `.env` + 装 Caddy，几分钟）。

---

## 7. 常见故障排查

| 现象                          | 原因                                                                     | 解决                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 注册时报错，无法建账号        | `ALLOW_REGISTRATION=false`                                               | 改回 true，重启服务，注册后改回 false                                                           |
| 能登录，但刷新/跳转后就掉登录 | `COOKIE_SECURE=true` 却用 HTTP 访问；或 `PUBLIC_ORIGIN` 与实际地址不一致 | 校准这两项，必须与浏览器地址栏完全一致                                                          |
| 上传大文件返回 413            | 反代的请求体上限                                                         | Caddy 已在 `deploy/Caddyfile` 设 105MB；Nginx 用 `client_max_body_size 105m`                    |
| 导出/上传时进程被杀           | 内存不足（构建与 PNG 渲染吃内存）                                        | 确认 2G swap 已启用：`swapon --show`                                                            |
| 导出封面中文变方框            | 缺中文字体                                                               | `apt-get install -y fonts-noto-cjk && fc-cache -f`，再重启服务                                  |
| 视频无法播放                  | 文件编码浏览器不支持（非服务端问题）                                     | 换 H.264/AAC MP4 或 WebM                                                                        |
| 502 Bad Gateway               | 应用没起来                                                               | `journalctl -u zhanxu -n 50 --no-pager`                                                         |
| Caddy 申请证书失败            | 80/443 未放行，或域名未解析/未备案                                       | 检查安全组、A 记录、备案状态                                                                    |
| `npm ci` 卡住                 | 国内访问 npm 官方源慢                                                    | 脚本已用 `registry.npmmirror.com`；`sharp`/`@napi-rs/canvas` 的平台二进制也走 npm，镜像同样生效 |

---

## 8. 已知边界（部署前要有预期）

- 单实例 Node + SQLite：**不要把同一个 SQLite 卷挂给多台应用服务器**
- 轻量服务器 2C2G 上并发上传/导出会明显变慢，演示场景够用，别当生产集群
- 免费试用到期需付费续费，或按第 5 节迁走
- 项目没有邮件找回密码、第三方登录、内容审核、AI 摘要等能力，公开运营前需要补
