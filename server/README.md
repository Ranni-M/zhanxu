# 展序服务端

可运行的Express模块化单体服务。Node.js 24内置SQLite提供持久数据库，本地私有目录存储素材；Worker线程生成PNG与图文ZIP。

从项目根目录运行npm run dev:api，或npm run build后运行npm start。

- 实际数据结构：db/schema-sqlite.sql
- 架构：../docs/architecture.md
- API：../docs/api.md
- 部署与备份：../docs/deployment.md

原PostgreSQL规划已移至docs/postgresql-schema-draft.sql，不作为当前运行依赖。
