# 第三方代码与许可声明

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

## 文档解析

- [unpdf](https://github.com/unjs/unpdf)：MIT，原文见 [licenses/unpdf.MIT](licenses/unpdf.MIT)。
- [PDF.js](https://github.com/mozilla/pdf.js)：通过 unpdf 内置，采用 Apache License 2.0，原文见 [licenses/pdfjs.Apache-2.0](licenses/pdfjs.Apache-2.0)。Copyright Mozilla Foundation。
- [Mammoth](https://github.com/mwilliamson/mammoth.js)：BSD 2-Clause，原文见 [licenses/mammoth.BSD-2-Clause](licenses/mammoth.BSD-2-Clause)。
- [fflate](https://github.com/101arrowz/fflate)：MIT，原文见 [licenses/fflate.MIT](licenses/fflate.MIT)。

## 其他依赖

React、Electron、Radix UI、Lucide、Tailwind CSS 等依赖的版本记录在 `package.json` 和 `pnpm-lock.yaml`，分别遵循各自许可。上述第三方代码的版权及许可归各自权利人所有。

应用打包时会一并包含本声明、根目录 LICENSE 和 `licenses/` 下的许可文件。
