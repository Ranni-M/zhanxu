# 验证记录

## 已通过

- 前端TypeScript、服务端TypeScript与Vite生产构建。
- 单元与集成测试共39项通过：海报渲染的骨架/配色/二维码、压缩包解析规则、公开/私密发布、备份与恢复。
- API与管理测试20项通过：未登录与来源校验、账号隔离、文件校验、私有文件保护、版本冲突、危险URL拒绝、快照发布更新撤回、公开/私密发布与切换公开范围、管理接口权限、删除文件同步清理草稿与快照、删除项目与账号、孤儿文件清理、PNG与ZIP导出、删除与退出登录。
- 浏览器完整流程21项通过：注册、创建、图片/两页PDF/WebM/ZIP上传、模块关联、保存刷新、未保存内容恢复、发布、匿名访问、PDF公开控制、私密发布后匿名既打不开也搜不到、切回公开恢复访问、真实PNG/ZIP/作品集PDF下载、零填写导入压缩包、游客模式建草稿与登录后迁移、首页功能区的对比滑杆与二维码、工作台与深色模式、390px布局、手机编辑器、减少动态效果、无障碍、撤回。
- 服务端PNG封面1600×2000；ZIP包含分页PNG与说明文本；测试实际读取文件签名与尺寸。
- 真正启动Chromium，在生产构建页面上执行流程；没有仅靠模拟接口。
- 公开项目页WCAG 2 A/AA自动检查通过；曾发现按钮与说明文字对比度不足，已经修复。
- 浏览器最终运行无未捕获页面错误。

结果文件：output/playwright/e2e-results.json、accessibility.json。
截图：home-desktop.png、editor-desktop.png、public-project-desktop.png、public-project-mobile.png、home-mobile.png、workspace.png、workspace-dark.png。

## 已修复的实际问题

- PDF预览生成后通过fetch读取data URL触发CSP，改为本机字节转换。
- 导出下拉框缺少明确无障碍名称，补齐标签。
- 中文文件名与权限读取按服务端真实元数据处理。
- 新建草稿状态、异步导入覆盖刚输入的内容、保存后恢复提示残留。
- 提交版本过期时返回冲突，防止另一页面静默覆盖。

## 尚未验证或不属于当前功能

- 未连接实体手机，iOS键盘、浏览器栏、刘海安全区域与实际触感仍需真机测试。
- 本机没有Docker，Dockerfile/Compose仅检查配置，尚未实际构建运行。
- 开发服务器的 localhost 链接不会自动对远程访客可用；公网访问使用下节的独立部署。
- 没有AI语义摘要、OCR、邮件验证/找回、视频转码或内容审核。
- 视觉、动效与移动端体验规范不只是写成文档，已全部落实到代码并逐项修订，详见 docs/design.md 与 docs/motion-review.md。

## 首屏性能

本机Lighthouse模拟移动设备测试：性能95、无障碍100、最佳实践100、SEO100；LCP约2.4秒、TBT130毫秒、CLS为0。属于实验室结果，不代表公网访问或真实设备用户指标。

优化：示例封面在构建时生成，浏览器不重复渲染；首屏图片预加载；生产JS/CSS/Worker提供Brotli与Gzip；PDF只在导入时加载。完整报告为output/playwright/lighthouse-final.report.html和同名JSON。

备份验证：成功生成可独立读取的数据库与完整素材副本，拒绝覆盖已有备份和把备份目录放进数据源内部。

## 公网部署

2026-09 用 Ubuntu 24.04、systemd 与 Caddy（Let's Encrypt 自动证书）部署到 https://ryhtest.cn：Node 24 直接运行 server/index.ts，SQLite 与上传素材放在 /var/lib/zhanxu（与代码目录分离，更新不丢数据），服务只监听 127.0.0.1:3001，由 Caddy 终止 TLS。步骤见 docs/deploy-cn-free.md。

线上验证：首页与 /api/health 返回200；http 全量308跳转https；带 www 的域名301到主域；伪造 Origin 的写请求被403拒绝；未登录访问 /api/admin/* 返回401、非管理员403；服务器上渲染导出封面得到真实中文字形（已安装 fonts-noto-cjk）。

注意：仓库自带的 deploy/Caddyfile 曾写死 email admin@example.com，Let's Encrypt 会以 invalidContact 拒绝签发，部署时需改成真实邮箱。
