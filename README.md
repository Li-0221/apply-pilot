# Apply Pilot

基于 Electron、React 和 TypeScript 的本地求职助手，当前支持 BOSS 直聘。界面基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin)，沿用默认主题和组件样式。

## 功能

- 应用内扫码登录 BOSS，在本机保存登录会话。
- 配置兼容 OpenAI Chat Completions 的 Base URL、API Key 和模型，支持测试连接。
- 导入 PDF、DOCX 简历，由 AI 整理为 Markdown，支持手动编辑后保存；也可直接粘贴内容。
- AI 根据简历与岗位描述打分、筛选，并生成定制沟通消息。
- 多关键词、多城市依次搜索，按需加载岗位；支持薪资、经验、学历、职位类型、行业、公司规模、融资阶段和排除词。
- 按 HR 活跃度过滤，可选择是否跳过活跃度未知的招聘者。
- 管理公司、岗位、招聘者黑名单，可从投递记录一键拉黑。
- 自动发起沟通并发送定制消息。
- 保留任务历史及每次岗位处理记录，支持搜索、投递状态、任务、日期筛选及分页；详情包含完整岗位描述、HR 活跃原文、匹配理由和沟通消息。
- 已联系或结果待核实的岗位不会自动重复投递；历史消息不会被当成本次发送结果。
- 任务只提供开始与停止。每次开始先回到 BOSS 岗位首页，从第一组条件执行；停止后重新开始会创建新任务，并保留历史去重。遇到登录、验证或页面异常时结束任务，处理后再开始。应用重启不会自动投递。
- 支持退出登录和清除 Key。

BOSS 投递按顺序执行：选择列表岗位卡片，读取「查看更多信息」链接，打开独立详情页，检查是否已沟通并完成岗位筛选，点击一次「立即沟通」，等待聊天输入框，填写并发送消息，确认后关闭详情页并回到保留的列表。textarea 使用输入操作填写，contenteditable 写入文本并触发 input。首次沟通后直接等待输入框，不再额外点击「继续沟通」。

BOSS 首次「立即沟通」会发送账号默认招呼语，AI 消息随后作为补充消息发送。AI 匹配在首次沟通前完成，不匹配的岗位不会发起联系。简历仅用于 AI 分析和岗位匹配，不通过网站发送附件或图片。目前不会自动回访会话或持续回复招聘者。

## 开始使用

需要 Node.js 22.12+（22.x）或 24+，以及 pnpm 10。

```bash
git clone https://github.com/Li-0221/apply-pilot.git
cd apply-pilot
pnpm install --frozen-lockfile
pnpm dev
```

1. 在「AI 与简历」填写 Base URL、Key 和模型。选择 PDF 或 DOCX，点击「AI 解析」，核对并编辑 Markdown 后保存；也可直接填写简历内容。
2. 在工作台打开 BOSS，扫码登录并完成网站安全验证。
3. 填写岗位关键词、城市、本次数量等，点击「开始投递」。多个关键词或城市使用逗号分隔；留空时使用全国推荐岗位。网站中的临时筛选会在重新开始时重置，以应用表单为准。
4. 在「投递记录」查看匹配分、沟通消息和发送结果。

Base URL 可填写 `https://api.openai.com/v1`、其他兼容服务的 `/v1` 地址，或完整的 `/chat/completions` 地址。根域名会补全 `/v1/chat/completions`；有路径的地址会追加 `/chat/completions`。模型填写服务商实际支持的名称。协议依据 [Chat Completions 官方文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。

AI 请求会把简历文本及当前岗位信息发送到配置的服务商。没有配置 AI 时，可关闭「AI 筛选与定制消息」并保存，使用固定补充消息。AI 开启时，服务异常或返回无效结果会停止任务，不会自动改用固定消息继续发送；未联系的岗位可以在修复设置后重新评估。

简历导入支持文字版 PDF（最多 20 页）和 DOCX，单文件不超过 10 MB。暂不支持旧版 `.doc`、加密文件或扫描图片版 PDF。本机提取的文字会发送给当前配置的 AI 服务整理，原文件不另行保存。解析结果进入编辑草稿，点击「保存」才更新已保存简历；取消或失败会保留原内容。AI 可能识别有误，请先核对姓名、联系方式、时间和经历。

开发模式支持管理界面热更新，主进程或 preload 修改后需重启。

## 构建与验证

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:smoke
pnpm test:boss
pnpm test:chat
pnpm test:auth
pnpm test:workflow

pnpm start
pnpm package
```

`pnpm package` 生成当前系统与架构的应用，输出到 `release/`。例如 macOS Apple Silicon：`release/Apply Pilot-darwin-arm64/Apply Pilot.app`。当前尚未配置签名、公证和自动更新。

测试覆盖 AI 请求协议、文档文字提取、搜索地址、流式岗位加载、HR 活跃度、黑名单身份匹配、停止、去重及数据迁移。集成检查使用真实 Electron、模拟 BOSS 网页和本地模拟 AI 服务，验证 PDF/DOCX 导入、Markdown 编辑保存与重启保留、解析取消和失败、Key 加密、筛选后发送、失败重试和退出登录；不会联系真实招聘者。截图保存在被 Git 忽略的 `.test-artifacts/`。额外的 BOSS 回归检查覆盖无送达标签、历史同文、发送中、发送失败和会话错配；工作流检查覆盖翻页、多关键词与城市、筛选、黑名单、弹出聊天和详情页内聊天、不发送附件、停止、重启后从头开始及完整记录。模拟检查通过不能替代真实服务商和 BOSS 网站的验证。

可选 `pnpm test:live` 仅检查 BOSS 官方登录页，不扫码、不投递。遇到安全验证时退出码为 2。

## 项目结构

```text
src/                       React 界面与 shadcn-admin 组件
shared/contracts.ts        指令、配置与状态类型
electron/main.ts           窗口、内置浏览器、IPC 和生命周期
electron/platforms/        平台接口、注册表与 BOSS 投递实现
electron/task-runner.ts    筛选、开始停止、任务记录与投递去重
electron/candidates.ts     关键词和城市组合、按需加载岗位
electron/hr-activity.ts    网站活跃文案解析与过滤
electron/ai.ts             简历 Markdown 整理、匹配与沟通消息生成
electron/resume-*.ts       PDF/DOCX 文字提取、独立读取进程与取消
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
- `workspace.json` 保存设置、简历文本、黑名单、任务历史及岗位处理记录，使用原子替换写入。简历文本保存在本机，不属于 Key 加密文件。
- 第三方网页禁用 Node 和 preload，启用沙箱与上下文隔离，仅允许 BOSS 的 HTTPS 域名导航。AI 请求由主进程执行，Key 不注入招聘网站。
- 开始联系前先保存投递意图。中断后结果不明的岗位标为「待核实」，不会自动重试；发送确认按步骤显示错误，补充消息需出现新增本人消息、无发送中或失败标记并连续稳定三秒；AI 跳过或联系前失败的岗位可以重新评估。

会话可能过期，安全验证和沟通额度限制仍需按网站提示处理。每次任务最多联系 100 个新岗位；关键词和城市组合最多 50 组，每组最多加载 50 轮，连续两轮没有新岗位时结束该组。城市和筛选字典来自网站公开选项，网站调整代码时需要同步。任务使用原生输入事件操作可见页面控件，网站改版后可能需要更新适配。登录信息、简历、Key、依赖及构建产物不提交到仓库。

## 许可与来源

Apply Pilot 采用 **PolyForm Noncommercial 1.0.0** 许可，详见 [LICENSE](LICENSE)。仅限许可允许的非商业用途；该许可并非 OSI 认可的开源许可。

界面中的 shadcn-admin 代码保留其 MIT 许可，见 [第三方声明](THIRD_PARTY_NOTICES.md) 和 [MIT 许可原文](licenses/shadcn-admin.MIT)。第三方代码分别遵循各自许可。
