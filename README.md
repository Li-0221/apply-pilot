# Apply Pilot

基于 Electron、React 和 TypeScript 的本地求职工作台。当前仅接入 BOSS 直聘，独立运行，无需 Java 后端。

界面基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin)，沿用默认主题和组件样式。

## 当前功能

- 在应用内打开 BOSS 官网，由用户扫码登录、完成安全验证。
- 检查登录状态，使用独立浏览器会话，在本机加密保存会话 Cookie。
- 读取当前岗位列表，或按关键词打开搜索列表；支持停止采集。
- 岗位去重、本机保存、筛选和详情查看。
- 运行记录、退出登录和清除网站存储。

目前是只读 MVP，尚未实现发送消息、自动投递、AI 匹配、多账号和其他平台。真实账号的登录保持与岗位采集需要人工验证。

## 开发

需要 Node.js 22.12+（22.x）或 24+，以及 pnpm 10。

```bash
git clone https://github.com/Li-0221/apply-pilot.git
cd apply-pilot
pnpm install --frozen-lockfile
pnpm dev
```

开发模式会打开 Electron 窗口。管理界面支持热更新；修改主进程或 preload 后需重新启动。

## 构建与打包

```bash
pnpm build
pnpm start

# 生成当前系统、当前架构的应用
pnpm package
```

打包结果位于 `release/`。例如 macOS Apple Silicon：`release/Apply Pilot-darwin-arm64/Apply Pilot.app`。当前为本地验证包，尚未配置签名、公证与自动更新。

## 检查

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:smoke
```

核心测试覆盖指令校验、存储、去重、取消和登录状态。`test:smoke` 使用真实 Electron、临时用户目录及测试网页，验证页面隔离、加密保存、采集、重启恢复和退出清理；测试通过不代表真实 BOSS 账号已验证。截图写入被 Git 忽略的 `.test-artifacts/`。

可选运行 `pnpm test:live`，使用临时目录检查 BOSS 官方登录页，不扫码、不投递。遇到安全验证时退出码为 2。

手动验证流程：

1. 点击「打开 Boss 直聘」，在内置页面扫码登录并完成验证。
2. 收起浏览器，点击「检查登录」和「保存会话」。
3. 完全退出并重启应用，检查登录是否恢复。
4. 在网站选择岗位与城市，返回工作台点击「开始采集」，查看「岗位列表」。
5. 检查停止采集、退出登录和重启后的会话清理。

## 项目结构

```text
src/                       React 界面及 shadcn-admin 组件
shared/contracts.ts        管理界面与主进程的指令及状态
electron/main.ts           窗口、内置浏览器、IPC 和会话生命周期
electron/platforms/        平台注册表、适配接口和 BOSS 实现
electron/task-runner.ts     可取消的岗位采集流程
electron/session-vault.ts  会话 Cookie 加密存储
electron/store.ts           岗位和设置的本机存储
scripts/                   开发、构建、打包和集成检查
tests/                     核心测试
```

新增招聘平台时，扩展 `electron/platforms/` 的适配模块和注册表，并接入独立会话。当前宿主与会话加密模块只启用 BOSS，尚无运行时平台切换。岗位数据使用原子替换的 JSON 文件，最多保留 2,000 个岗位。

## 本地数据

用户目录显示在「本地设置」中。为保留独立拆分前的桌面版数据，默认仍使用系统应用数据目录下的 `Get Jobs/`；macOS 为 `~/Library/Application Support/Get Jobs/`。浏览器分区仍为 `persist:get-jobs-boss-default`。

- Chromium 保存 Cookie、localStorage 和 IndexedDB 等网站存储。
- `boss-session.enc` 使用 Electron `safeStorage` 加密保存会话 Cookie；系统安全存储不可用时不会回退为明文。
- `workspace.json` 保存岗位、关键词和最近保存时间。
- 可用 `APPLY_PILOT_DATA_DIR` 指定其他用户目录；兼容旧变量 `GET_JOBS_DATA_DIR`，新变量优先。
- 第三方网页禁用 Node 和 preload，启用沙箱与上下文隔离，仅允许在 BOSS 的 HTTPS 域名内导航。

不会读取或迁移原 Java 项目的数据库、浏览器目录或环境配置。会话持久化不能保证永久登录，过期或安全验证仍需用户处理。本地数据、依赖和构建产物不提交到仓库。

## 许可与来源

本项目从 [GET JOBS](https://github.com/loks666/get_jobs) 的桌面端验证项目独立拆分，保留上游的 **PolyForm Noncommercial 1.0.0** 许可与版权声明，详见 [LICENSE](LICENSE)。仅限许可允许的非商业用途；该许可并非 OSI 认可的开源许可。

界面中的 shadcn-admin 代码保留其 MIT 许可，见 [第三方声明](THIRD_PARTY_NOTICES.md) 和 [MIT 许可原文](licenses/shadcn-admin.MIT)。第三方代码分别遵循各自许可。
