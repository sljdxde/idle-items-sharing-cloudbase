# ADR-0001: 用薄 Serverless 代理持有 GitHub Token 处理写操作

- **状态**：Accepted
- **日期**：2026-08-11
- **相关候选**：架构审查候选 ①（ItemStore 适配层）+ 候选 ②（安全模型）

## Context（背景）

「邻里好物」是纯前端项目，没有数据库、没有自建服务器，所有数据（闲置物品、状态、下架）都通过 GitHub Issues 承载。浏览器必须能创建 issue、修改状态标签、关闭 issue。

原本的实现把**拥有仓库写权限的 PAT 以"反转字符串"混淆后硬编码进客户端 bundle**，并把管理 PIN 明文写进公开 Issue body。在公开仓库下，任何人都能还原 Token、读走 PIN 接管任意物品——凭据泄露且鉴权形同虚设。

需要在"无数据库、无服务器"约束下，重新决定**写能力放在哪**。候选（见审查报告）：

- **A. 薄 Serverless 代理（Cloudflare Worker / Vercel Function）持有 Token**
- **B. 客户端嵌入细粒度 PAT（仅限本仓 issues 写）**
- **C. GitHub OAuth（PKCE 公钥流程，每用户令牌）**
- **D. 纯 Issue 表单 + GitHub Action**（已排除：只能覆盖发布，撑不起交互式借阅/归还）

## Decision（决策）

**采用 A：薄 Serverless 代理持有 GitHub Token。** 浏览器只调用代理暴露的 `/api/*` 端点；Token 仅存在于代理的环境变量中，永不进入客户端 bundle。

配套决策（在 grill ①+② 中一并确定）：

- **PIN 由代理加密存储**（代理用仅自己知道的密钥加密后写进 issue body，公开仓库只见密文；管理时代理解密比对）。无需 OAuth、无数据库。
- **状态作为 `Item` 记录字段**（单一真相来源），GitHub label 仅作可选二级索引。
- **代理加轻量反滥用护栏**：按 IP/小时限流 + 前端硬编码"站点 key"（仅挡普通爬虫）+ 服务端字段校验。

## Consequences（后果）

**正面**
- Token 彻底移出客户端，消除凭据泄露与越权接管。
- PIN 移出公开面，管理鉴权真正成立。
- 引入 `ItemStore` 适配层 seam：`GitHubIssuesAdapter` 内部消化 Token / 编码 / label 细节，业务层用 `list/create/setStatus/remove` 小接口；可用内存假 adapter 做测试。
- 代理可集中做限流、校验、防滥用。
- 仍"无数据库"；Serverless 函数是托管服务，不是自维护的服务器。

**负面 / 代价**
- 多了一个需要部署与维护的 Serverless 函数（尽管极轻量、免费额度够用）。
- 代理是公开可调用端点，仍需反滥用护栏（见上）；纯信任情况下仍可能被刷 issue。
- 当前方案下借阅人没有真实身份（无 OAuth），"社区借阅"的双向确认能力受限——后续若要真实用户体系，可升级到方案 C。

## 备选方案（被否决）

- **B（客户端细粒度 PAT）**：零基础设施，但令牌本质可被提取，任何人可对本仓建/关 issue（垃圾信息风险）；且 PIN 公开面问题仍需另解。否决因安全性不满足上线要求。
- **C（GitHub OAuth）**：最干净、顺带解决用户身份（候选 ⑤），但需建 OAuth App、处理登录跳转，最重。记为**未来升级路线**，当需要做真实用户体系（"我的物品"/借给谁/谁确认归还）时再评估。
- **D（Issue 表单 + Action）**：无法支撑交互式借阅/归还写操作，与愿景冲突。否决。

## 参考

- 架构审查报告（候选 ① ②）：`/var/folders/xb/dl8cz4l95fnc67dg34b5rfgm0000gn/T/architecture-review-20260811175148.html`
- 代理模式下的 PIN 加密、状态字段化、反滥用护栏决策见 grill ①+② 记录。
