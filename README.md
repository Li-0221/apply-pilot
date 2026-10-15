# Apply Pilot

基于 Electron、React 和 TypeScript 的本地求职助手，当前支持 BOSS 直聘。界面基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin)，沿用默认主题和组件样式。

## 功能

- 应用内扫码登录 BOSS，在本机保存登录会话。
- 配置兼容 OpenAI Chat Completions 的 Base URL、API Key 和模型，支持测试连接。
- 粘贴简历内容，AI 根据岗位描述打分、筛选，并生成定制沟通消息。
- 按关键词、城市、排除词筛选岗位，设置投递数量和间隔。
- 自动发起沟通、发送补充消息，并在网站允许时发送附件简历。
- 投递记录显示匹配理由、消息和附件状态；已联系或结果待核实的岗位不会自动重复投递。
- 支持停止任务、退出登录和清除 Key。任务不会随应用启动自动运行。

BOSS 首次「立即沟通」会发送账号默认招呼语，AI 消息随后作为补充消息发送。附件使用 BOSS 账号已有的附件简历；网站要求双方回复时会记录为「等待回复」，不会绕过限制，也不会标记为附件已发送。目前不会自动回访这些会话或持续回复招聘者。

## 开始使用

需要 Node.js 22.12+（22.x）或 24+，以及 pnpm 10。

```bash
git clone https://github.com/Li-0221/apply-pilot.git
cd apply-pilot
pnpm install --frozen-lockfile
pnpm dev
```

1. 在「AI 与简历」填写 Base URL、Key、模型及简历文本，测试连接并保存。
2. 在工作台打开 BOSS，扫码登录并完成网站安全验证。
3. 填写岗位关键词、城市、本次数量等，点击「开始投递」。关键词留空时沿用网站当前岗位列表的筛选条件。
4. 在「投递记录」查看匹配分、沟通消息和附件发送结果。

Base URL 可填写 `https://api.openai.com/v1`、其他兼容服务的 `/v1` 地址，或完整的 `/chat/completions` 地址。根域名会补全 `/v1/chat/completions`；有路径的地址会追加 `/chat/completions`。模型填写服务商实际支持的名称。协议依据 [Chat Completions 官方文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。

AI 请求会把简历文本及当前岗位信息发送到配置的服务商。没有配置 AI 时，可关闭「AI 筛选与定制消息」并保存，使用固定补充消息。AI 开启时，服务异常或返回无效结果会停止任务，不会自动改用固定消息继续发送；未联系的岗位可以在修复设置后重新评估。

开发模式支持管理界面热更新，主进程或 preload 修改后需重启。

## 构建与验证

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:smoke

pnpm start
pnpm package
```

`pnpm package` 生成当前系统与架构的应用，输出到 `release/`。例如 macOS Apple Silicon：`release/Apply Pilot-darwin-arm64/Apply Pilot.app`。当前尚未配置签名、公证和自动更新。

测试覆盖 AI 请求协议、配置校验、停止、去重及数据迁移。集成检查使用真实 Electron、模拟 BOSS 网页和本地模拟 AI 服务，验证表单配置、Key 加密、筛选后发送、附件状态、失败重试、重启和退出登录；不会联系真实招聘者。截图保存在被 Git 忽略的 `.test-artifacts/`。模拟检查通过不能替代真实服务商和 BOSS 网站的验证。

可选 `pnpm test:live` 仅检查 BOSS 官方登录页，不扫码、不投递。遇到安全验证时退出码为 2。

## 项目结构

```text
src/                       React 界面与 shadcn-admin 组件
shared/contracts.ts        指令、配置与状态类型
electron/main.ts           窗口、内置浏览器、IPC 和生命周期
electron/platforms/        平台接口、注册表与 BOSS 投递实现
electron/task-runner.ts    筛选、任务取消与投递去重
electron/ai.ts             简历匹配与沟通消息生成
electron/ai-key-vault.ts   API Key 加密存储
electron/session-vault.ts 会话 Cookie 加密存储
electron/store.ts          本机配置及投递记录
scripts/                   开发、构建、打包与集成检查
tests/                     核心测试和网页夹具
```

平台页面操作放在适配模块中，AI 和任务流程不依赖 BOSS 的页面选择器。新增平台可扩展 `electron/platforms/` 的接口实现和注册表，再接入独立会话；当前仅启用 BOSS，尚无运行时平台切换。

## 本地数据

用户目录可在「本地设置」查看，也可通过 `APPLY_PILOT_DATA_DIR` 指定。为保留已有登录状态，继续使用桌面验证版的用户目录与浏览器分区。

- Chromium 保存网站 Cookie、localStorage 和 IndexedDB。
- `boss-session.enc` 和 `ai-key.enc` 使用 Electron `safeStorage` 加密。系统安全存储不可用时不会回退明文；管理界面不会回显已保存的 Key。
- `workspace.json` 保存设置、简历文本和投递记录，使用原子替换写入。简历文本保存在本机，不属于 Key 加密文件。
- 第三方网页禁用 Node 和 preload，启用沙箱与上下文隔离，仅允许 BOSS 的 HTTPS 域名导航。AI 请求由主进程执行，Key 不注入招聘网站。
- 开始联系前先保存投递意图。中断后结果不明的岗位标为「待核实」，不会自动重试；AI 跳过或联系前失败的岗位可以重新评估。

会话可能过期，安全验证和沟通额度限制仍需按网站提示处理。岗位列表读取最多 100 条；任务使用可见页面控件，网站改版后可能需要更新适配。登录信息、简历、Key、依赖及构建产物不提交到仓库。

## 许可与来源

Apply Pilot 采用 **PolyForm Noncommercial 1.0.0** 许可，详见 [LICENSE](LICENSE)。仅限许可允许的非商业用途；该许可并非 OSI 认可的开源许可。

界面中的 shadcn-admin 代码保留其 MIT 许可，见 [第三方声明](THIRD_PARTY_NOTICES.md) 和 [MIT 许可原文](licenses/shadcn-admin.MIT)。第三方代码分别遵循各自许可。
