# 打卡小程序后端 (checkin-server)

微信小程序打卡功能的后端服务，基于 Node.js 18 + Express 4，部署目标为**微信云托管**。

## 功能

- `POST /api/checkin` 提交一次打卡
- `GET /api/checkin/list` 查询当前用户的打卡记录
- `GET /` 健康检查（云托管必需）

## 接口约定

所有响应统一格式：

```json
{ "code": 0, "msg": "ok", "data": {} }
```

错误响应 `code` 为 -1，并通过 HTTP 状态码区分错误类型（400 / 401 / 404 / 500）。

### 1. 提交打卡

```
POST /api/checkin
Content-Type: application/json

{ "note": "今天完成了 XXX" }
```

`note` 可省略，最长 500 字。返回示例：

```json
{
  "code": 0,
  "msg": "打卡成功",
  "data": { "id": 1, "openid": "oXXXX", "note": "...", "time": "2026-09-29T..." }
}
```

### 2. 查询打卡列表

```
GET /api/checkin/list
```

返回当前用户的所有打卡记录，按提交时间正序。

## openid 来源

生产环境（`NODE_ENV=production`）下，本服务**只信任**请求头里的 `X-WX-OPENID`——这个头由微信云托管网关自动注入，对应小程序调用方的真实身份，客户端无法伪造。body / query 里传的 `openid` 会被忽略。

本地开发环境（默认）下未注入 `X-WX-OPENID` 时，会回退到 body / query 的 `openid`，便于 curl / Postman 调试。

## 数据库

通过环境变量切换存储后端：

- **配了 `MYSQL_HOST`**：使用 MySQL，重启不丢数据，适合生产
- **没配 `MYSQL_HOST`**：使用内存数组，重启即清空，仅供本地调试

启用 MySQL 时需要的环境变量（见 `.env.example`）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `MYSQL_HOST` | 是 | 数据库地址 |
| `MYSQL_PORT` | 否 | 默认 `3306` |
| `MYSQL_USER` | 是 | 数据库用户名 |
| `MYSQL_PASSWORD` | 是 | 数据库密码 |
| `MYSQL_DATABASE` | 否 | 默认 `checkin`，需提前创建好库 |

服务启动时会自动执行 `CREATE TABLE IF NOT EXISTS checkin_records (...)`，云托管场景下重启幂等。

表结构：

```sql
CREATE TABLE checkin_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_openid_created (openid, created_at)
);
```

## 本地运行

```bash
npm install
npm start
```

默认监听 `http://localhost:80`，可通过环境变量覆盖：`PORT=3000 npm start`。

本地没有微信云托管网关，所以默认 `NODE_ENV=development`、客户端需要传 `openid`。

## Docker 构建与运行

```bash
docker build -t checkin-server .
docker run --rm -p 8080:80 -e NODE_ENV=development checkin-server
```

## 部署到微信云托管

1. 推送代码到当前仓库：`git push`
2. 微信云托管控制台 → 创建新服务 → 选择「镜像部署」或「代码部署」
3. 端口填写 `80`，环境变量设置 `NODE_ENV=production`
4. 配置小程序后台的「服务器域名」白名单，把云托管给定的域名加到 `request` 合法域名
5. 小程序代码里用 `wx.cloud.callContainer` 或 `wx.request` 调用本服务，云托管网关会自动注入 `X-WX-OPENID` 头

## 待办

- [ ] 把内存存储替换为真实数据库（云托管 MySQL 或云开发数据库）
- [ ] 接入 GitHub Actions 自动化构建镜像并推送
- [ ] `app.js` 接入小程序前端（当前为空文件占位）
