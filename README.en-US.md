# @nocobase/plugin-paste-upload

<p align="center">
  <a href="https://www.nocobase.com/">
    <img src="https://www.nocobase.com/images/logo.png" width="180" alt="NocoBase" />
  </a>
</p>

<h3 align="center">NocoBase Paste to Upload Plugin</h3>

<p align="center">
  <strong>Hover & Paste to Upload · Screenshot & File Extraction · Smart Deduplication · Zero-Intrusion Support</strong>
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

## 🌟 Key Features

- **🖱️ Hover-Aware Paste Upload**: Hover your cursor over any attachment or file upload component (`Upload.Attachment`, `Upload.Dragger`, or `Upload`) and press `Ctrl+V` (`⌘+V` on macOS) to capture screenshots or copied files from the clipboard and upload them immediately.
- **🛡️ Dual-Channel Clipboard Deduplication**: Built-in 1-to-1 consumption pool between `clipboardData.items` and `clipboardData.files` combined with a global singleton event lock prevents duplicate uploads from a single paste action.
- **✨ Subtle Visual Cues & Pulse Feedback**: Displays a dashed highlight border and a shortcut badge (`Press Ctrl+V to paste and upload`) on hover, with a smooth pulse animation when a paste is triggered.
- **📏 Respects Field Constraints**: Automatically enforces `accept` (MIME types and extensions), `multiple` (single vs. multi-file mode), and `maxSize` rules configured on the upload component.
- **📝 Safe Isolation for Text Inputs**: Silently ignores paste events when an input, `textarea`, or rich-text editor (`contenteditable`) is focused, or when the clipboard only contains plain text.
- **🔌 Dual-Client Zero-Intrusion Compatibility**: Works out of the box with both NocoBase Classic Client (`@nocobase/client`) and Modern Client (`@nocobase/client-v2`).

---

## 🚀 Installation

### Option 1: Upload via NocoBase Plugin Manager UI

1. Download the latest `.tgz` package from the [Releases](https://github.com/STlxx-lin/nocobase-plugin-paste-upload/releases) page;
2. Open **Plugin Manager** in NocoBase -> Click **Add plugin** -> Upload the `.tgz` archive and enable it.

### Option 2: Install via CLI

```bash
yarn nocobase pm add @nocobase/plugin-paste-upload
yarn nocobase pm enable @nocobase/plugin-paste-upload
```

---

## 🛠️ Development & Build

```bash
# Run unit tests
npx vitest run packages/plugins/@nocobase/plugin-paste-upload

# Build and package as .tgz archive
yarn build @nocobase/plugin-paste-upload --tar
```

---

## 📄 License

[AGPL-3.0](./package.json)
