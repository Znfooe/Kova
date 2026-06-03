<div align="center">

# Kova

**灵感来了，记一笔。**

极简轻量 · AI 原生 · 全本地存储

![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript)
![Rust](https://img.shields.io/badge/Rust-1.77+-dea584?logo=rust)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06b6d4?logo=tailwindcss)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

---

## 核心理念

### ⚡ 极简轻量

Tauri 2 + Rust 驱动，安装包不到 5MB，启动快、内存低。功能不复杂，专注记录本身——Markdown 编辑、文件夹整理、全文搜索，够用就好。

### 📝 快捷便签

全局热键呼出，光标位置弹窗，写完 Ctrl+Enter 保存关闭。灵感来了，随时记一笔，不打断当前工作流。

### 🤖 AI 原生集成

AI 不只是聊天窗口，它能直接操作你的笔记和文件夹——创建、搜索、移动、重命名、批量操作、导出，全靠对话完成。

### 💾 完整备份

一键备份为 ZIP（数据库 + 配置），一键恢复自动重启。数据迁移、换机、防丢，一步到位。

### 🔒 全本地优先

SQLite 本地数据库，不依赖云服务。你的笔记只存在你的电脑上。

---

## 功能概览

<table>
<tr>
<td width="50%" valign="top">

**笔记管理**

- Markdown 编辑器，编辑 / 分屏 / 预览三种模式
- 格式工具栏：加粗、斜体、标题、列表、代码块、引用
- 自动保存、手动保存 (Ctrl+S)、50 步撤销 (Ctrl+Z)
- 全文搜索、标签系统
- 导入 / 导出 Markdown 文件

</td>
<td width="50%" valign="top">

**文件夹系统**

- 多级文件夹树，支持嵌套
- 拖拽笔记到文件夹
- 右键菜单：重命名、新建笔记、导出文件夹
- 批量移动 / 删除笔记
- 文件夹批量导出为 Markdown

</td>
</tr>
<tr>
<td width="50%" valign="top">

**AI 助手**

- 兼容 OpenAI API，SSE 流式对话
- 多配置档案切换
- 深度思考模式
- AI 可直接操作笔记和文件夹（增删改查、移动、导出）
- 对话管理、自动摘要

</td>
<td width="50%" valign="top">

**快捷笔记**

- 全局快捷键呼出（Ctrl+Shift+N）
- 光标位置弹出，置顶窗口
- 写入 / 浏览两种模式
- 自定义快捷键录制

</td>
</tr>
<tr>
<td width="50%" valign="top">

**界面体验**

- 无边框透明窗口，极简视觉风格
- 亮色 / 暗色双主题，强调色和纸张色独立可配
- 侧边栏 / 面板宽度可拖拽，窗口尺寸自动记忆
- 系统托盘常驻，关闭即最小化，不打扰

</td>
<td width="50%" valign="top">

**数据安全**

- SQLite 本地数据库
- 数据目录可自定义
- 完整备份 / 恢复（ZIP 格式）
- 单实例运行，防重复打开

</td>
</tr>
</table>

## 技术栈

<table>
<tr>
<td width="50%" valign="top">

**前端**

- **React 19** + **TypeScript 6** — 组件化 UI
- **Vite 8** — 构建工具
- **Tailwind CSS 4** — 原子化样式
- **react-markdown** + **KaTeX** — Markdown 渲染与数学公式

</td>
<td width="50%" valign="top">

**后端**

- **Tauri 2** — 桌面框架，无边框透明窗口
- **Rust** — 高性能本地服务
- **rusqlite** — 内嵌 SQLite
- **reqwest** — HTTP 客户端，SSE 流式支持

</td>
</tr>
</table>

## 下载安装

从 [Releases](https://github.com/Xinghongia/Kova/releases) 页面下载最新版本：

- **Kova_x.x.x_x64-setup.exe** — 推荐，标准安装流程
- **Kova_x.x.x_x64_en-US.msi** — Windows Installer 格式

双击运行，按提示完成安装即可。

## 从源码构建

### 环境要求

- Node.js
- Rust 1.77.2+

### 开发

```bash
git clone https://github.com/your-username/Kova.git
cd Kova
npm install
npx tauri dev
```

### 构建

```bash
npx tauri build
```

产物位于 `src-tauri/target/release/bundle/`。

## 项目结构

```text
Kova/
├── src/                          # React 前端
│   ├── components/
│   │   ├── layout/               # 标题栏、侧边栏、设置面板、AI 面板
│   │   ├── detail/               # 笔记编辑器（三模式、工具栏、自动保存）
│   │   ├── shared/               # 通用组件（Markdown 预览、笔记列表、搜索栏）
│   │   └── dialog/               # 弹窗（右键菜单、确认框、文件夹选择器）
│   ├── hooks/                    # 自定义 Hooks
│   └── lib/                      # 工具函数（主题、数据库桥接、日期解析）
│
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── lib.rs                # Tauri 命令、窗口管理、系统托盘
│       └── services/
│           ├── db.rs             # SQLite CRUD、备份恢复、配置管理
│           └── ai.rs             # AI 对话、流式响应、工具定义
│
└── public/                       # 静态资源
```

## License

MIT
