// 打卡小程序后端入口
// 提供打卡记录的提交、查询接口
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 80;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 生产环境（微信云托管）下，openid 应由云托管通过 X-WX-OPENID 头注入，
// 不再接受 body / query 里客户端自行传入的 openid，避免被伪造。
const TRUST_HEADER_FOR_PROXY = NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// 简单请求日志，方便在云托管控制台查看
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// 内存存储（演示用），上线前请替换为数据库
const records = [];

const fail = (res, status, msg) => res.status(status).json({ code: -1, msg });
const ok = (res, data, msg = 'ok') => res.json({ code: 0, msg, data });

// 解析当前请求对应的 openid
// - 生产环境：必须由微信云托管在请求头里注入 X-WX-OPENID，body / query 里的值被忽略
// - 本地开发：未注入头时，回退使用客户端传入的 openid，便于 curl / Postman 调试
function resolveOpenid(req, fallback) {
  const fromHeader = req.header('x-wx-openid');
  if (TRUST_HEADER_FOR_PROXY) {
    if (!fromHeader) {
      const err = new Error('生产环境缺少 X-WX-OPENID 头，请通过微信云托管调用本服务');
      err.status = 401;
      throw err;
    }
    return fromHeader;
  }
  return fromHeader || fallback;
}

// 健康检查（云托管必需）
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'checkin-server', env: NODE_ENV, time: new Date().toISOString() });
});

// 提交打卡
// body: { note?: string }
app.post('/api/checkin', (req, res, next) => {
  try {
    const openid = resolveOpenid(req, (req.body && req.body.openid) || '');
    const note = (req.body && typeof req.body.note === 'string') ? req.body.note.trim() : '';
    const record = {
      id: records.length + 1,
      openid,
      note,
      time: new Date().toISOString(),
    };
    records.push(record);
    ok(res, record, '打卡成功');
  } catch (err) {
    next(err);
  }
});

// 查询打卡列表
app.get('/api/checkin/list', (req, res, next) => {
  try {
    const openid = resolveOpenid(req, req.query.openid || '');
    const list = records.filter(r => r.openid === openid);
    ok(res, list);
  } catch (err) {
    next(err);
  }
});

// 404 兜底
app.use((req, res) => fail(res, 404, `路由不存在: ${req.method} ${req.originalUrl}`));

// 全局错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const msg = err.message || '服务异常，请稍后再试';
  console.error(`[error] ${status} ${msg}`);
  fail(res, status, msg);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`checkin-server listening on port ${PORT} (env=${NODE_ENV})`);
});
