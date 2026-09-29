// 打卡小程序后端入口
// 提供打卡记录的提交、查询接口
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 80;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 生产环境（微信云托管）下，openid 应由云托管通过 X-WX-OPENID 头注入，
// 不再接受 body / query 里客户端自行传入的 openid，避免被伪造。
const TRUST_HEADER_FOR_PROXY = NODE_ENV === 'production';

// 数据库配置：MYSQL_HOST 存在则走 MySQL，否则保持内存存储（开发模式）
const DB_CONFIG = process.env.MYSQL_HOST
  ? {
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'checkin',
    }
  : null;

let pool = null;
let memoryStore = [];

async function initDb() {
  if (!DB_CONFIG) {
    console.log('[db] MYSQL_HOST 未配置，使用内存存储（重启即丢失）');
    return;
  }
  pool = mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: false,
  });
  // 启动时建表，云托管重启场景下幂等
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkin_records (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      openid VARCHAR(64) NOT NULL,
      note VARCHAR(500) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_openid_created (openid, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log(`[db] 已连接 MySQL ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
}

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

const fail = (res, status, msg) => res.status(status).json({ code: -1, msg });
const ok = (res, data, msg = 'ok') => res.json({ code: 0, msg, data });

// 解析当前请求对应的 openid
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
  res.json({
    ok: true,
    service: 'checkin-server',
    env: NODE_ENV,
    db: pool ? 'mysql' : 'memory',
    time: new Date().toISOString(),
  });
});

// 提交打卡
app.post('/api/checkin', async (req, res, next) => {
  try {
    const openid = resolveOpenid(req, (req.body && req.body.openid) || '');
    const note = (req.body && typeof req.body.note === 'string')
      ? req.body.note.trim().slice(0, 500)
      : '';
    let record;
    if (pool) {
      const [ins] = await pool.execute(
        'INSERT INTO checkin_records (openid, note) VALUES (?, ?)',
        [openid, note]
      );
      const [rows] = await pool.execute(
        'SELECT id, openid, note, created_at FROM checkin_records WHERE id = ?',
        [ins.insertId]
      );
      record = rows[0];
    } else {
      record = {
        id: memoryStore.length + 1,
        openid,
        note,
        created_at: new Date(),
      };
      memoryStore.push(record);
    }
    ok(res, record, '打卡成功');
  } catch (err) {
    next(err);
  }
});

// 查询打卡列表
app.get('/api/checkin/list', async (req, res, next) => {
  try {
    const openid = resolveOpenid(req, req.query.openid || '');
    let list;
    if (pool) {
      const [rows] = await pool.execute(
        'SELECT id, openid, note, created_at FROM checkin_records WHERE openid = ? ORDER BY created_at ASC',
        [openid]
      );
      list = rows;
    } else {
      list = memoryStore.filter(r => r.openid === openid);
    }
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

initDb()
  .catch((err) => {
    console.error('[fatal] 数据库初始化失败:', err);
    process.exit(1);
  })
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`checkin-server listening on port ${PORT} (env=${NODE_ENV})`);
    });
  });
