# 部署、备份与恢复

## 本地运行

Node.js 24+：npm ci → npm run dev。打开 http://127.0.0.1:5173 。

使用打包后版本：npm run build → npm start。打开 http://127.0.0.1:3001 。

不要只部署dist到静态托管平台：账号、上传与发布依赖/api后端。

## 单服务器部署

1. 在服务器安装Node.js 24、中文字体与反向代理。Linux建议Noto CJK字体。
2. 拉取代码，执行npm ci和npm run build。
3. 复制.env.example为.env。设置NODE_ENV=production、PUBLIC_ORIGIN=https://你的域名、DATA_DIR为持久路径。HTTPS时COOKIE_SECURE=true。
4. 如果确实只经过一层可信反向代理，可设置TRUST_PROXY=1。不要在暴露给不可信代理的场景随意开启。
5. 用systemd、进程管理器或Docker运行npm start，反向代理转发到本机3001端口。
6. 代理请求体至少允许100MB，并保留Range请求与Cookie。上传请求超时应足够长。
7. 初次注册一个自己的账号，测试发布链接后，再让别人使用。

### Nginx示例

以下放入已有HTTPS站点的server块；证书、域名和TLS配置由部署环境提供。

```nginx
client_max_body_size 105m;
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
}
```

## Docker

```sh
docker compose up --build -d
```

本机默认 http://localhost:3001 。容器数据库与文件位于zhanxu-data命名卷。

公开部署需设置环境变量PUBLIC_ORIGIN和COOKIE_SECURE=true后重新创建容器。对外提供HTTPS的反向代理必须与PUBLIC_ORIGIN一致。

注意：不使用docker compose down -v，除非明确要删除全部账号和上传资料。当前环境未安装Docker，配置尚未实机验证。

## 备份

为保持数据库与文件一致，先停止应用写入，再运行：

```sh
npm run backup -- ./backups/your-backup-name
```

备份脚本读取.env中的DATA_DIR，创建独立SQLite副本并复制files目录。目标目录必须尚不存在且不在DATA_DIR内部。

Docker部署可先停止容器，再备份整个数据卷。不要只复制运行中的SQLite主文件而忽略WAL；最简单的方式是停服后复制整个数据目录。

## 恢复

停止应用，把备份中的zhanxu.sqlite与files目录恢复到新的DATA_DIR，保留原目录作为回退。设置DATA_DIR指向新目录，再启动应用。核对账号、私有素材、公开链接和下载。

恢复旧备份会回退账号与项目状态，应提前确认恢复时间点。

## 日常维护

- 数据库、上传文件和导出包都在DATA_DIR，监控磁盘容量并定期备份。
- MAX_USER_STORAGE_MB限制上传素材，不包括导出文件。目前导出文件随项目删除而回收，需要定期查看磁盘用量。
- ALLOW_REGISTRATION=false可以关闭新注册，已有用户仍能登录。
- 使用npm audit检查依赖更新；升级前保留数据库与文件备份。
- SQLite模式仅运行一个应用实例，不直接横向扩容。
- 当前没有自动邮件找回、内容举报与审核流程；公开运营时需要补齐对应服务或明确采用受邀的小范围使用方式。
