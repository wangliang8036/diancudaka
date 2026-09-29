// 打卡小程序后端入口
// 提供打卡记录的提交、查询接口
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 80;

app.use(cors());
app.use(express.json());

// 内存存储（演示用），上线前请替换为数据库
const records = [];

// 健康检查（云托管必需）
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'checkin-server', time: new Date().toISOString() });
});

// 提交打卡
// body: { openid: 'xxx', note: '今天完成了xxx' }
app.post('/api/checkin', (req, res) => {
  const { openid, note } = req.body || {};
  if (!openid) {
    return res.status(400).json({ code: -1, msg: 'openid 不能为空' });
  }
  const record = {
    id: records.length + 1,
    openid,
    note: note || '',
    time: new Date().toISOString(),
  };
  records.push(record);
  res.json({ code: 0, msg: '打卡成功', data: record });
});

// 查询打卡列表
// query: openid=xxx
app.get('/api/checkin/list', (req, res) => {
  const { openid } = req.query;
  if (!openid) {
    return res.status(400).json({ code: -1, msg: 'openid 不能为空' });
  }
  const list = records.filter(r => r.openid === openid);
  res.json({ code: 0, data: list });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`checkin-server listening on port ${PORT}`);
});
