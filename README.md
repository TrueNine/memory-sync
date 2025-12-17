# TrueNine Life CLI

跨 AI 编程工具的提示词同步工具。一套规则，多端适配。

## 快速开始

```bash
npx @truenine/memory-sync-cli
```

## 全局安装

```bash
pnpm add -g @truenine/memory-sync-cli
```
## 更新版本

```bash
pnpm update -g @truenine/memory-sync-cli --latest
```

安装后可直接使用命令：

```bash
tnmsc
```

可用功能：

```bash
# 直接同步
tnmsc

# 获取参数列表
tnmsc --help
tnmsc -h

# 预览导出
tnmsc --dry-run
tnmsc -n

# 清理所有导出
tnmsc --clean
tnmsc -c
# 预览清理目标
tnmsc --clean --dry-run
```

## CLI 配置
```
可以在两个地方创建配置，来适配，以下示例为默认配置

```text
~/.aindex/.tnmsc.json
cwd()/.tnmsc.json
```
> cwd() 代表当前执行命令的目录。


```json
{
  "workspaceDir": "~/project",
  "shadowProjectDir": "$WORKSPACE/aindex",
  "shadowSkillSourceDir": "$SHADOW_PROJECT/dist/skills",
  "shadowFastCommandDir": "$SHADOW_PROJECT/dist/commands",
  "shadowSubAgentDir": "$SHADOW_PROJECT/dist/agents",
  "globalMemoryFile": "$SHADOW_PROJECT/dist/GLOBAL.md",
  "shadowSourceProjectDir": "$SHADOW_PROJECT/ref",
  "externalProjects": [],
  "excludePatterns": {},
  "logLevel": "info"
}
```


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

配置文件优先级：`cwd()/.tnmsc.json` > `~/.aindex/.tnmsc.json`


## License

UNLICENSED
