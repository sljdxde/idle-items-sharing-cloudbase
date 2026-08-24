# E2E 测试报告 — 邻里好物 v2 全流程走查

- **日期**：2026-08-21
- **执行**：AI 代理（以真实 GitHub 数据链路为准，非 mock）
- **环境**：本地 `npm run dev`（端口 5180）+ 生产仓库 `sljdxde/idle-items-sharing-cloudbase`（public，viewerPermission=ADMIN）+ 真实 GitHub Actions
- **身份视角**：
  - **物主/管理员**＝仓库协作者 sljdxde（gh CLI，ADMIN）
  - **借阅人A**＝在 Issue 下留言的邻居（GitHub 登录态）
  - **匿名访客**＝无凭证 curl
- **测试数据**：【E2E】露营四人间帐篷(#3, outdoor)、小米加湿器4L(#4, electronics)、旧台灯(#5, home)，测后已全部物理删除，仓库恢复基线（#1、#2）

## 一、流程矩阵（全部走通 ✅）

| # | 流程 | 操作方 | 实际动作 | 结果 |
|---|------|--------|----------|------|
| 1 | **发布** | 物主 | 以与 `buildPublishUrl` 逐字节一致的模板创建带 `item` 标签的 Issue | ✅ 快照出现该物品，name/category/status/坐标/楼号全字段正确 |
| 2 | **展示** | 所有人 | 重生成 items.json + 匿名 API 双路读取 | ✅ 两路一致（4 件） |
| 3 | **借阅** | 借阅人A | 在物品 Issue 下留言申请（含昵称/楼号/事由），物主收 GitHub 通知 | ✅ 评论落库可见；状态不变（方案1 中「待确认」态无写入端，见发现③） |
| 4 | **确认借出** | 物主 | 打 `lent` 标签 | ✅ 状态→`borrowed`（前端渲染「已借出」徽标并禁用「我想借」） |
| 5 | **归还** | 物主 | 摘除 `lent` 标签 | ✅ 状态→`available` |
| 6 | **再次上架** | 系统（归还即上架） | 同一 listing 复用，编号不变 | ✅ 无需重新发布 |
| 7 | **下架** | 物主 | 关闭 Issue | ✅ 从快照消失，站点不可见（可恢复） |
| 8 | **重新上架** | 物主 | Reopen Issue | ✅ 原编号原数据恢复为闲置中 |
| 9 | **删除** | 管理员 | GraphQL `deleteIssue`（永久） | ✅ 直查返回 **410 Gone "This issue was deleted"**，快照消失，不可恢复 |
| 10 | **越权-匿名打标签 / 关 Issue / 改标题** | 匿名访客 | 无凭证 curl 写操作 ×3 | ✅ 全部 **401 拒绝**；匿名只读 200（产品前提） |
| 11 | **生产同步管道** | GitHub Actions | 手动触发 sync-items.yml 并等跑完 | ✅ completed/success，远端 items.json 与本地生成逐 id 一致，category 字段透传生效 |

## 二、发现并修复的问题

1. **🐛 严重：`lent` 标签管理失效（E2E 主战果）**
   - 现象：打上 `lent` 后物品仍显示「闲置中」。
   - 根因：发布时 DATA 块写入了 `status:"available"`，而三处映射均为「DATA 优先于标签」，标签永远被忽略——v1 起就潜伏。
   - 修复：改为 **`lent` 标签优先级最高**（物主的显式操作覆盖历史状态），同步修改 `src/lib/api.ts` / `.github/workflows/sync-items.yml` / `scripts/generate-items.mjs` 三处，新增回归单测（现 20/20 通过）。
2. **🔧 运维前提缺失：仓库里 `lent` 标签已被删掉**，导致物主无法标记借出。已重建（绿色，描述「物品已借出」）。**部署新环境时必须先建 `item` 与 `lent` 两个标签。**
3. **⚠️ GitHub Issues 列表接口是最终一致的**：写后立刻 list 可能读到旧索引（实测秒级～数十秒）。生产链路由事件触发的 Action 天然规避；本地脚本需写后等待/轮询。
4. **⚠️ REST「Delete an issue」端点对本仓持续返回 404**（权限模型存疑），改用 GraphQL `deleteIssue` 成功。结论：删除走 GraphQL，且删除后按编号直查返回 410（墓碑提示），行为清晰。

## 三、局限性（如实记录）

- UI 断言基于数据契约 + 组件确定性渲染推断，**未做浏览器自动化截图比对**；建议人工在 dev server 过一遍视觉/交互。
- 「非协作者经 `issues/new?labels=item` 发布时标签会被忽略」是 GitHub 平台已知行为，本次单账号无法直接复现双账号场景，已列为后续验证项（见第五节）。

## 四、用户隔离与物品管理机制（现状说明）

### 用户隔离：寄生于 GitHub 权限模型，站点自身零账号

| 角色 | 能力 | 隔离边界由谁保证 |
|------|------|------------------|
| 匿名访客 | 只读全部物品（含联系方式） | GitHub 公开仓库只读 |
| 登录的普通 GitHub 用户 | 可留言沟通；可开 Issue 但**打不上 `item` 标签**（平台规则：非协作者建 Issue 时 labels 参数被忽略）→ 物品不会上架 | GitHub 的 triage 权限规则 |
| 仓库协作者（当前=物主本人） | 发布可上架的物品；对任意物品打/摘 `lent`、关/重开/删除 | GitHub 仓库写权限 |

要点：
1. **没有用户表、没有登录态**。「谁管理哪个物品」的答案当前非常粗粒度：**所有管理能力＝仓库协作者权限**，即现在只有一个超级物主（站长）。不存在「A 注册用户的物品 B 看不到/管不了」这类行级隔离——因为压根没有注册用户的通道。
2. **隐私现状**：联系方式明文公开在 Issue 与快照中（v1 即如此）。介意者应只填楼号或使用小号。
3. **防滥用现状**：匿名者可开普通 Issue（不入架）也可对开放 Issue 留言 → 有垃圾评论面；无限流（ADR-0001 的 Worker 限流未接线）。

### 物品管理：一切操作都是「对 Issue 的操作」

| 业务动作 | GitHub 动作 | 生效路径 |
|---|---|---|
| 上架（发布） | 新建带 `item` 标签的 open Issue | issue opened → Action → items.json |
| 确认借出 | 加 `lent` 标签 | labeled → Action（标签优先） |
| 确认归还 | 摘 `lent` 标签 | unlabeled → Action |
| 下架 | 关闭 Issue | closed → Action 过滤 |
| 重新上架 | Reopen | reopened → Action |
| 彻底删除 | 删除 Issue（GraphQL deleteIssue） | 物理消失，返回 410 |

状态机（当前实际可达）：`available ⇄ borrowed`（lent 标签驱动）、`available ↔ 隐藏`（open/closed 驱动）。`requested` 态已建模但**无写入端**——它是 ADR-0001 Worker 闭环（`POST /api/items/:id/request` 等）启用后才会出现的中间态。

### 升级路线（当需要真正的多用户隔离时）

启用 ADR-0001 的 Cloudflare Worker：物主凭 PIN（AES-GCM 加密存储）在站内完成借出/归还/下架，借阅请求走 `/api/items/:id/request` 进入 `requests[]` 并点亮 `requested` 态——届时「物主=PIN 持有人」才成为行级的隔离单元。数据结构已预留（`pinCipher`、`requests[]`），切换无需迁移。

## 五、遗留事项

- [ ] 双账号验证「非协作者发布不上架」的实际表现
- [ ] 决定是否启用 Worker 站内闭环（届时补 requested 态与 PIN 管理）
- [ ] 联系方式脱敏选项（如站内留言板替代明文）
