# AGENTS.md

Guidance for AI agents working in this repo.

## 版本与发布（强制，钩子已强制执行）

> 这条规则不是建议，`pre-commit` / `pre-push` 会拦。详见 `scripts/lib/versionPolicy.mjs`。

### 三种版本形态，只有这三种

| 场景 | 形态 | 例子 | 允许出现的分支 |
| --- | --- | --- | --- |
| 日常开发 | `x.y.z-a.b-snapshot` | `2.2.0-1.0-snapshot` | 非 master |
| 提测 | `x.y.z-a.b` | `2.2.0-1.0` | 非 master |
| **发布** | `x.y.z` | `2.2.0` | **仅 master** |

- `a`、`b` **必须是数字**（`2.2.0-beta.1` 不算合规）。
- **发布只能发 `x.y.z`**，带 `-a.b` 或 `-snapshot` 的版本不允许出现在 master 上，也不允许打 tag。
- 每次大发布都要**同时**动版本号与 tag，两者必须一致：`package.json` 是 `2.2.0` 才能有 `v2.2.0`。
- **已发布的 tag 永不改写**（`v2.1.0` 停在旧提交就让它停着），要发新东西就 bump 版本打新 tag。

### 发布三件套，缺一不可

一次发布 = **版本号 + tag + GitHub Release**。只打 tag 不建 Release 属于**发布未完成**。

| 件 | 要求 |
| --- | --- |
| 版本号 | `package.json` 与 `package-lock.json` 两处都是 `x.y.z` |
| tag | `vX.Y.Z`，annotated，指向本次发布提交，且必须等于 `package.json` |
| **Release** | 打在同一个 tag 上，**标题 = `vX.Y.Z`，正文必须写清发布内容**（不许空、不许“修了点东西”），并标记 `--latest` |

发布说明（Release 正文）必须是**可追溯**的，由 `scripts/lib/releaseNotes.mjs` 按 conventional commit
前缀从 `上一个 tag..本次 tag` 的提交自动生成，分「新功能 / 缺陷修复 / 性能 / 重构 / 测试 / 文档 /
工程与发布 / 其他」渲染，附对比基线、提交数、升级方式；同时落盘为 `docs/releases/vX.Y.Z.md` 随发布提交入库。
**手写说明时也要保留这些区块**，别把自动生成的换成一两句话。

因此**提交标题必须遵守 conventional commit**（`feat(scope): …` / `fix(scope): …` / `chore: …`），
否则会被归到「其他」，发布说明就失去可读性。merge 提交会被自动剔除，不算内容。

### 命令（别手改 package.json）

```bash
npm run version:status                        # 版本/形态/分支/lock/HEAD 上的 tag/Release 是否缺失
npm run version:set -- 2.2.0-1.0-snapshot     # 开发期
npm run version:set -- 2.2.0-1.0              # 转入提测
npm run version:release -- 2.2.0              # 发布：改号 + 生成说明 + 提交 + tag + 推送 + 建 Release
npm run version:release -- 2.2.0 --no-publish # 只做本地三件套的前两件（推送与 Release 手补）
npm run version:publish -- v2.2.0             # 补建/刷新某个 tag 的 Release（含说明）
npm run version:doctor                        # 审计：列出所有缺 Release 的 tag
```

`version:set` / `version:release` 会同步 `package.json` 与 `package-lock.json` 的**两处**版本字段
（顶层 `version` 与 `packages[""].version`）。历史上这两处漂移过（pkg 2.1.0 / lock 2.0.0），不要再手改。

`version:release` 默认会把 master 与 tag 都推上去并创建 Release；推完记得重新部署主站：

```bash
npm run deploy:pages
```

`version:doctor` 输出非空说明有历史欠账，按提示 `version:publish -- vX.Y.Z` 补齐——**不允许留着不补**。

### 钩子做了什么

| 钩子 | 校验内容 | 失败后果 |
| --- | --- | --- |
| `pre-commit` | 版本形态合法；**master 上必须是 `x.y.z`**；lock 两处与 package.json 同步 | 提交被拒 |
| `pre-push` | 推 `master` 时版本必须是 `x.y.z` 且 lock 同步；推 tag 必须是 `vX.Y.Z` 且等于该提交的 `package.json` | 推送被拒 |

钩子源码在 `.githooks/`，通过 `core.hooksPath` 生效；新克隆执行一次 `npm install`
（`prepare` 会跑 `scripts/install-hooks.mjs`）即可，也可手动 `npm run hooks:install`。
零外部依赖，不用 husky。

### 禁止绕过

- **不要用 `git commit --no-verify` / `git push --no-verify`**。钩子失败说明版本号或 tag 不合规，
  应该去改版本号，而不是跳过校验。
- **发布缺 Release 也算未完成**。`npm run version:doctor` 有输出就必须补齐（`version:publish`），
  不能留“只有 tag 没有 Release”的历史欠账。
- 确实遇到钩子自身 bug，先报告再临时手动执行 `node scripts/check-version.mjs pre-commit` 定位，
  不要在没有记录的情况下硬闯。
- 在 `x.y.z-a.b-snapshot` 阶段就把功能做完并提测；**不要把 snapshot 版本直接合进 master**，
  合并前先 `npm run version:release -- <下一版本>`（或先 `version:set` 成提测号验证通过）。

## Agent skills


### Issue tracker

Issues and specs live as GitHub Issues (uses the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles mapped to default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
