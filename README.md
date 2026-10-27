# @nocobase/plugin-paste-upload

<p align="center">
  <a href="https://www.nocobase.com/">
    <img src="https://www.nocobase.com/images/logo.png" width="180" alt="NocoBase" />
  </a>
</p>

<h3 align="center">NocoBase 剪贴板粘贴上传插件 (Paste to Upload)</h3>

<p align="center">
  <strong>鼠标悬停即粘即传 · 截图与多文件自动提取 · 智能防重与校验 · 零侵入双端支持</strong>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> | <a href="./README.en-US.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NocoBase-2.x%20Supported-blue?style=flat-square" alt="NocoBase 2.x" />
  <img src="https://img.shields.io/badge/Version-0.1.0-green?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/i18n-zh--CN%20%7C%20en--US-brightgreen?style=flat-square" alt="i18n" />
</p>

---

## 🌟 核心特性

- **🖱️ 悬停感知与粘贴上传**：将鼠标悬停在任意附件或文件上传组件（`Upload.Attachment`、`Upload.Dragger`、标准 `Upload`）区域上方，直接按下 `Ctrl+V`（macOS 为 `⌘+V`），即可捕获剪贴板中的系统截图或复制的文件并自动触发上传。
- **🛡️ 剪贴板双通道精准去重**：内置 `clipboardData.items` 与 `clipboardData.files` 1-to-1 消费池比对与全局单例事件锁，彻底解决浏览器剪贴板双通道导致的“单次粘贴重复上传两份文件”问题。
- **✨ 轻量视觉引导与涟漪反馈**：鼠标悬停时显示虚线高亮边框与右上角快捷键提示徽标（`按 Ctrl+V 粘贴上传`）；粘贴瞬间提供蓝色脉冲动画反馈，完美融入 Ant Design 5 视觉体系。
- **📏 严格遵循字段约束**：自动读取上传字段配置的 `accept`（支持 MIME 通配符与后缀名）、`multiple`（单文件/多文件模式）及 `maxSize`（文件大小上限），拦截不合规文件并给出友好提示。
- **📝 纯文本与输入态安全隔离**：当焦点位于输入框、`textarea` 或富文本编辑器（`contenteditable`）内，或剪贴板仅包含纯文本时，自动静默放行，绝不干扰正常打字与文本粘贴。
- **🔌 双架构零侵入即装即用**：同时兼容 NocoBase 经典客户端（`@nocobase/client`）与现代客户端（`@nocobase/client-v2`），启用插件后全局表单、弹窗、抽屉内的上传控件即刻生效。

---

## 🚀 安装与启用

### 方式 1：通过 NocoBase 插件管理器界面上传安装

1. 前往本仓库 [Releases](https://github.com/STlxx-lin/nocobase-plugin-paste-upload/releases) 页面下载最新版本的 `.tgz` 压缩包；
2. 进入 NocoBase 系统 **插件管理器 (Plugin Manager)** -> 点击 **添加插件 (Add plugin)** -> 上传 `.tgz` 包并启用。

### 方式 2：通过命令行安装

```bash
# 下载或放入 storage/tar 后通过 pm 安装并启用
yarn nocobase pm add @nocobase/plugin-paste-upload
yarn nocobase pm enable @nocobase/plugin-paste-upload
```

---

## 🛠️ 本地开发与构建

```bash
# 运行单元测试
npx vitest run packages/plugins/@nocobase/plugin-paste-upload

# 编译并打包生成 .tgz 发布包
yarn build @nocobase/plugin-paste-upload --tar
```

---

## 🌍 国际化支持 (i18n)

内置完整的简体中文（`zh-CN`）与英文（`en-US`）语言包，自动跟随 NocoBase 系统当前语言环境切换。

---

## 📄 开源协议

[AGPL-3.0](./package.json)
