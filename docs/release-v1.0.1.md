# 展序 v1.0.1

毕业设计完整项目展示平台，包含账号、项目与素材管理、模块化作品页、公开发布及撤回、PNG封面与多页图文ZIP导出。

修复 v1.0.0 的打包遗漏：将运行数据目录的忽略规则限定在仓库根目录，确保 src/data/catalog.ts 随源码发布。

运行：Node.js 24+，执行 npm ci、npm run build、npm start，访问本机3001端口。网站与API部署见 docs/deployment.md。

源码不包含实际用户数据库、上传文件、环境密钥和测试产物。
