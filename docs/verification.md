# 验证记录

## 已通过

- 前端TypeScript、服务端TypeScript与Vite生产构建。
- API与备份测试11项通过：未登录与来源校验、账号隔离、文件校验、私有文件保护、版本冲突、危险URL拒绝、快照发布更新撤回、PNG与ZIP导出、删除与退出登录。
- 浏览器完整流程15项通过：注册、创建、图片/两页PDF/WebM/ZIP上传、模块关联、保存刷新、未保存内容恢复、发布、匿名访问、PDF公开控制、真实PNG/ZIP下载、工作台与深色模式、390px布局、手机编辑器、减少动态效果、无障碍、撤回。
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
- 未部署公网域名；本机链接不会让远程访客自动可用。
- 没有AI语义摘要、OCR、邮件验证/找回、视频转码或内容审核。
- 不把已有技能的安装等同于应用；本项目已经实际读取并按taste-skill、Emil设计工程和mobile-native进行了实现与修订。

## 首屏性能

本机Lighthouse模拟移动设备测试：性能95、无障碍100、最佳实践100、SEO100；LCP约2.4秒、TBT130毫秒、CLS为0。属于实验室结果，不代表公网访问或真实设备用户指标。

优化：示例封面在构建时生成，浏览器不重复渲染；首屏图片预加载；生产JS/CSS/Worker提供Brotli与Gzip；PDF只在导入时加载。完整报告为output/playwright/lighthouse-final.report.html和同名JSON。

备份验证：成功生成可独立读取的数据库与完整素材副本，拒绝覆盖已有备份和把备份目录放进数据源内部。
