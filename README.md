# TrueNine Life CLI

跨 AI 编程工具的提示词同步工具。一套规则，多端适配。


## 支持的 AI 工具

**IDE**
- Cursor IDE
- Kiro IDE
- Windsurf IDE
- Qoder IDE
- CodeBuddy IDE
- Antigravity IDE

**CLI 工具**
- Claude Code CLI
- Codex CLI
- Gemini CLI
- FactoryDroid CLI

**配置文件**
- JetBrains IDE
- VSCode IDE

## 插件体系

采用 input → transform → output 管道架构：

- **Input 插件**: 读取源文件（Aindex、Ref、WorkspaceGroup）
- **Transform 插件**: 处理内容
- **Output 插件**: 写入目标格式（各 IDE/CLI 适配器）

## 配置

配置文件优先级：`cwd()/.memorysync.json` > `~/.aindex/configs.json`

首次运行会自动创建 `~/.aindex/config.json`。

## License

Private
