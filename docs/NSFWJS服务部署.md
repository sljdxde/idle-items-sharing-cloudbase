# NSFWJS 图片审核服务部署说明

本地自托管、免费、无限次。与主站 Worker 通过 HTTP 接口通信。

## 1. 安装（在有 Node 的服务器上，一次即可）



```
cd server

npm install

\# tfjs-node 原生模块需本地编译（首次 3-10 分钟，需已装 Xcode CLT / build-essential）：

npm rebuild @tensorflow/tfjs-node --build-addon-from-source
```

> 已在本机验证通过：
>
> `npm install`
>
>  → 
>
> `npm rebuild`
>
>  → 启动 → 
>
> `/health`
>
>  返回 
>
> `model: loaded`
>
> 。

## 2. 启动（常驻）



```
cd server

nohup node nsfwjs-server.mjs > nsfwjs.log 2>&1 &
```

默认监听 `127.0.0.1:8090`。首次调用会从 nsfwjs 托管地址自动下载模型（约 20MB），之后常驻内存。

可选环境变量：



| 变量               | 默认          | 说明                           |
| ---------------- | ----------- | ---------------------------- |
| `NSFW_HOST`      | `127.0.0.1` | 监听地址（只允许本机时保持默认）             |
| `NSFW_PORT`      | `8090`      | 端口                           |
| `NSFW_MODEL`     | 空（托管模型）     | 本地模型目录（file://）              |
| `NSFW_THRESHOLD` | `0.4`       | Porn+Hentai+Sexy 概率和阈值，越高越宽松 |

验证：



```
curl http://127.0.0.1:8090/health

\# {"ok":true,"model":"loaded","threshold":0.4}
```

## 3. 暴露公网（Worker 云端访问必需）

Worker 跑在 Cloudflare 云端，必须通过公网 URL 调用本服务。任选其一：

### 方式 A：nginx 反代（推荐，若已有公网 nginx）

在 nginx 配置里加一个 location，转发到本地 8090：



```
\# /etc/nginx/conf.d/ 下对应 server 块内新增

location /audit-image {

&#x20;   proxy\_pass http://127.0.0.1:8090/audit-image;

&#x20;   proxy\_http\_version 1.1;

&#x20;   proxy\_set\_header Host \$host;

&#x20;   proxy\_read\_timeout 15s;

&#x20;   proxy\_request\_buffering on;

&#x20;   client\_max\_body\_size 1m;

}
```

重载 nginx 后，公网地址形如：`https://你的域名/audit-image`。

### 方式 B：Cloudflare Tunnel（免费，无需公网 IP）



```
cloudflared tunnel --url http://127.0.0.1:8090

\# 会得到一个 https://xxx.trycloudflare.com 临时公网地址
```

稳定使用可配置 named tunnel + 自有域名。

## 4. 配置 Worker 并通知我

拿到公网 URL 后（形如 `https://域名/audit-image`），告诉我即可。我会：



1. 设置 Worker 环境变量 `NSFWJS_URL=<你的公网URL>`、`AUDIT_MODE=nsfwjs`

2. 清理旧的百度相关 secret

3. 部署并冒烟验证「带图发布 → NSFWJS 审核 → 落库」

## 接口协议（Worker 侧已按此实现）



```
POST /audit-image

{ "image": "\<base64 图片，不含 data: 前缀>" }

200 → { "ok": true, "unsafe": boolean, "score": number }

&#x20;    unsafe=true 表示判定违规（拒绝发布）

错误 → { "ok": false, "error": "..." } 或非 200
```