# AGENTS.md — Cherry Studio 项目知识

## 项目概述

Cherry Studio 是一个跨平台桌面端 AI 助手应用，基于 Electron 构建，支持 Windows、Mac、Linux。支持多种 LLM 提供商（OpenAI、Gemini、Anthropic、Ollama 等），提供 AI 助手、多模型对话、文档处理、知识库等能力。

- 官网：https://cherry-ai.com
- 仓库：https://github.com/CherryHQ/cherry-studio

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 37 + React 19 + TypeScript 5 |
| 包管理 | Yarn 4.9.1 (workspaces) |
| UI | Ant Design 5 + styled-components 6 |
| 状态管理 | Redux Toolkit + React Query |
| 构建 | electron-vite 4 (rolldown-vite) |
| AI SDK | OpenAI SDK / @anthropic-ai/sdk / @google/genai / @mistralai/mistralai |
| 消息协议 | MCP (Model Context Protocol) SDK |
| 富文本 | TipTap (ProseMirror) |
| 代码高亮 | Shiki + CodeMirror |
| 测试 | Vitest + Playwright |
| 数据库 | libsql (Turso/LibSQL) |

## 目录结构

```
cherry-studio/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── services/      # 主进程服务（App、FileSystem、Logger 等）
│   │   ├── configs/       # 主进程配置
│   │   ├── mcpServers/    # MCP Server 管理
│   │   └── utils/         # 主进程工具（AES 加密、ZIP 等）
│   └── renderer/          # Electron 渲染进程（React 应用）
│       └── src/
│           ├── pages/     # 页面组件
│           │   └── home/  # 主页
│           │       ├── Messages/  # 聊天消息核心模块
│           │       ├── Chat.tsx   # 聊天主容器
│           │       └── ...
│           ├── store/     # Redux Store & 类型定义
│           ├── services/  # 渲染进程服务（EventService 等）
│           ├── hooks/     # 自定义 Hooks
│           ├── components/# 公共组件（Scrollbar、CodeEditor 等）
│           ├── context/   # React Context
│           ├── types/     # 类型定义
│           ├── i18n/      # 国际化
│           └── assets/    # 静态资源 & 全局样式
├── packages/              # Yarn workspaces 包
│   ├── database/          # 数据库 ORM 层
│   ├── mcp-trace/         # MCP 链路追踪
│   └── extension-table-plus/ # 表格扩展
├── scripts/               # 构建/工具脚本
├── build/                 # 构建资源（图标等）
├── docs/                  # 项目文档
└── .yarn/                 # Yarn PnP 相关
```

## 关键概念

### 消息布局模式 (MultiModelMessageStyle)

支持四种布局（定义在 `src/renderer/src/store/settings.ts`）：

- `fold` — 折叠模式，只显示一条选中的消息
- `vertical` — 垂直排列
- `horizontal` — 水平排列（带横向滚动）
- `grid` — 网格卡片模式（2-6 列可调）

### 聊天消息卡片

核心文件：`src/renderer/src/pages/home/Messages/MessageGroup.tsx`

- `GridContainer` — CSS Grid 容器，根据模式和列数设置 `grid-template-columns`
- `MessageWrapper` — 消息卡片样式组件，包含 `&.grid`、`&.horizontal` 等模式样式
- `GridPopoverCard` — Grid 模式的卡片弹窗组件，支持 hover/click/longPress 三种触发方式
- Grid 卡片使用 `--grid-card-max-height` CSS 变量控制最大高度（基于 `宽度 × 1.9`），通过 ResizeObserver 动态计算

Grid 设置项：
- `gridColumns`: 列数，范围 2-6（默认 2）
- `gridPopoverTrigger`: 弹窗触发方式 `hover` | `click` | `longPress`（默认 `longPress`）

### 消息样式

- `messageStyle`: `plain` | `bubble`（气泡卡片样式）
- Bubble 模式样式定义在 `src/renderer/src/assets/styles/index.scss`

## 开发

### 环境要求
- Node.js >= 22.0.0
- Yarn 4.x（packageManager 锁定为 4.9.1）

### 常用命令

```bash
yarn dev          # 启动开发模式
yarn build        # 类型检查 + 构建
yarn build:win    # 构建 Windows 安装包
yarn typecheck    # TypeScript 类型检查（每次开发完成后必须通过类型检查）
yarn lint         # ESLint + 类型检查 + i18n 检查
yarn test         # 运行单元测试（Vitest）
yarn format       # Prettier 格式化
```

### 代码规范

- 使用 Yarn 4，不要用 npm
- CSS-in-JS 统一使用 styled-components（不要混用 CSS modules）
- 组件使用 memo 包裹避免不必要重渲染
- 类型定义集中放在 `src/renderer/src/types/` 或模块内的 `types.ts`
- 常量使用枚举/字面量联合类型，避免魔法字符串

### 开发流程

- 每次开发完成后必须通过 `yarn typecheck` 类型检查

### 注意事项

- `src/main/` 主进程代码与 `src/renderer/` 渲染进程代码严格分离
- 全局样式在 `src/renderer/src/assets/styles/index.scss`
- 国际化文件在 `src/renderer/src/i18n/`，翻译 key 使用英文原文
- electron-store 用于持久化用户设置

### 其他

- @CLAUDE.md
- @package.json