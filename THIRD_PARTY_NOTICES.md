# 第三方代码与许可声明

## GET JOBS

- 来源：<https://github.com/loks666/get_jobs>
- 拆分时的上游提交：`5700f04dee60176a1682a84c30e3b12df6e981ef`
- 许可：PolyForm Noncommercial License 1.0.0，条款与必要版权声明保留在根目录 [LICENSE](LICENSE)。

Required Notice: Copyright (c) 2024-2026 GET JOBS (https://github.com/loks666/get_jobs)

Apply Pilot 原为该仓库中的独立 Electron 验证目录。现已拆分为单独项目，以 Electron / Node.js 实现桌面宿主、登录会话及 BOSS 岗位采集，并参考上游 BOSS 平台逻辑；不包含 Java 后端及其本地数据库。

## shadcn-admin

- 来源：<https://github.com/satnaing/shadcn-admin>
- 来源提交：`e16c87f213a5ba5e45964e9b67c792105ec74d26`
- 许可：MIT，原文见 [licenses/shadcn-admin.MIT](licenses/shadcn-admin.MIT)。
- 版权：Copyright (c) 2024 Sat Naing

本项目复用其默认主题、基础样式、布局和 UI 组件，并将业务界面改为本地求职工作台。

## shadcn/ui

- 来源：<https://github.com/shadcn-ui/ui>
- 许可：MIT，原文见 [licenses/shadcn-ui.MIT](licenses/shadcn-ui.MIT)。
- 版权：Copyright (c) 2023 shadcn

Field 和 Empty 组件通过 shadcn 官方 CLI 添加。

## 其他依赖

React、Electron、Radix UI、Lucide、Tailwind CSS 等依赖的版本记录在 `package.json` 和 `pnpm-lock.yaml`，分别遵循各自许可。上述第三方代码的版权及许可归各自权利人所有。

应用打包时会一并包含本声明、根目录 LICENSE 和 `licenses/` 下的许可文件。
