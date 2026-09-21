# 展序 API

响应为JSON；失败格式为 {"error":"可读的错误说明"}。写入请求必须带 X-Zhanxu-Request: 1；浏览器Origin必须符合PUBLIC_ORIGIN。会话由HttpOnly Cookie管理。

| 方法   | 地址                          | 作用                                      |
| ------ | ----------------------------- | ----------------------------------------- |
| GET    | /api/health                   | 健康检查                                  |
| GET    | /api/auth/me                  | 当前登录用户，未登录返回null              |
| POST   | /api/auth/register            | name、email、password注册                 |
| POST   | /api/auth/login               | email、password登录                       |
| POST   | /api/auth/logout              | 退出会话                                  |
| POST   | /api/auth/password            | currentPassword、password修改密码         |
| GET    | /api/projects                 | 当前账号的项目                            |
| POST   | /api/projects                 | 指定template创建项目                      |
| GET    | /api/projects/:id             | 读取自己项目                              |
| PUT    | /api/projects/:id             | 保存完整document字段和revision            |
| DELETE | /api/projects/:id             | 删除项目、发布快照与文件                  |
| POST   | /api/projects/:id/assets      | multipart/form-data中的file字段上传       |
| GET    | /api/assets/:id               | 仅作者可读的文件                          |
| POST   | /api/projects/:id/publish     | 发布指定revision，返回slug                |
| DELETE | /api/projects/:id/publication | 撤回公开展示                              |
| GET    | /api/publications?offset=0    | 已发布项目摘要，一页最多50个              |
| GET    | /api/publications/:slug       | 完整公开项目快照                          |
| GET    | /api/public-assets/:slug/:id  | 快照中允许公开的资产                      |
| GET    | /api/bookmarks                | 当前账号收藏ID列表                        |
| PUT    | /api/bookmarks/:id            | saved=true/false更新收藏                  |
| POST   | /api/projects/:id/exports     | format=cover或bundle，revision必填        |
| GET    | /api/jobs/:id                 | queued/running/succeeded/failed及下载地址 |
| GET    | /api/jobs/:id/download        | 获取已经生成的PNG/ZIP                     |

## 项目文档

必填：title、category、year、template、revision、images。

可选：subtitle、author、intro、process、role、tools、demoUrl、repositoryUrl、attachments、sections。

images元素：id、name；src由服务器按所属资产生成，不接受任意远程图片地址。

attachments元素：id、visible、caption；文件类型、大小与地址均由服务器读取真实资产记录。

sections元素：id、title、body、imageIds；关联图片必须属于当前项目的images。

上传限制：图片12MB、PDF25MB、MP4/WebM100MB、ZIP50MB。图片解码上限4000万像素，存储图最长边2000px。PDF与视频保留原文件。

## 常用状态码

- 400：字段或文件类型错误。
- 401：需要登录。
- 403：来源校验失败或关闭注册。
- 404：不存在或无权访问，避免泄漏他人私有对象。
- 409：保存版本冲突。
- 413：文件、请求或空间超过上限。
- 429：请求频率超限。

公开文件同样使用no-store，撤回后再次请求不应通过浏览器缓存继续获取。已经下载到访客设备的文件无法远程收回。
