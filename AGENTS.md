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

### 命令（别手改 package.json）

```bash
npm run version:status                        # 看当前版本/形态/分支/lock 是否同步/HEAD 上的 tag
npm run version:set -- 2.2.0-1.0-snapshot     # 开发期
npm run version:set -- 2.2.0-1.0              # 转入提测
npm run version:release -- 2.2.0              # 发布：改号 + 提交 + 打 annotated tag v2.2.0
```

`version:set` / `version:release` 会同步 `package.json` 与 `package-lock.json` 的**两处**版本字段
（顶层 `version` 与 `packages[""].version`）。历史上这两处漂移过（pkg 2.1.0 / lock 2.0.0），不要再手改。

`version:release` 之后还要推两条 + 重新部署主站：

```bash
git push origin master && git push origin v2.2.0 && npm run deploy:pages
```

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
