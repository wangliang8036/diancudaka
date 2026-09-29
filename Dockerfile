FROM node:18-alpine

WORKDIR /app

# 单独拷贝依赖文件以利用 Docker 缓存
COPY package*.json ./
RUN npm install --production --registry=https://registry.npmmirror.com

# 拷贝其余源码
COPY . .

# 云托管默认期望容器监听 80 端口
EXPOSE 80

CMD ["node", "server.js"]
