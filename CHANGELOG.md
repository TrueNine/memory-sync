# Changelog

## [功能增强] 2024-11-03

### 空行缩进清理功能

**背景**:
为了节省 token 消耗，需要清理文件中空行的多余缩进空格。这些空白字符不影响文件功能，但会增加 token 使用量。

**实现内容**:

1. **新增工具函数**:
   - `src/utils/blankLineCleaner.ts`: 核心清理逻辑
     - `cleanBlankLines()`: 批量处理目录下的文件
     - `cleanBlankLinesInFile()`: 处理单个文件
   - 支持自定义文件扩展名过滤
   - 支持自定义跳过目录（默认跳过 `node_modules`, `.git`, `dist` 等）
   - 支持 dry-run 模式预览修改

2. **集成到自动同步流程**:
   - 在 Phase 0 的最前面执行空行清理
   - 自动处理以下目录下的所有文件：
     - `_ai/`: 核心 prompt 工作区
     - `_aiissues/`: 问题追踪记录
     - `_airef/*/src/`: 所有外部项目的源文件
     - `_airef/*/dist/`: 所有外部项目的编译输出
   - 分别输出各目录清理统计信息（处理文件数、修改文件数）

3. **测试覆盖**:
   - 12 个单元测试确保功能正确性
   - 测试覆盖：基本清理、空格/制表符混合、嵌套目录、扩展名过滤、dry-run 等场景

**使用效果**:
- 自动在每次 `dep` 部署前清理所有相关目录（`_ai`, `_aiissues`, `_airef/*/src`, `_airef/*/dist`）
- 移除空行中的缩进，保留有内容行的原始缩进
- 减少 token 使用，提高 AI Agent 效率
- 首次运行清理了 27 个文件（281 个文件中），节省了大量 token

## [重大变更] 2024-10-30

### 移除 Cursor 规则文件生成功能

**背景**:
Cursor 编辑器现已原生支持读取项目根目录的 AGENTS.md 文件（从 Cursor 0.40+ 版本开始）。为了避免重复的规则来源导致的冲突和混淆，我们决定移除自动生成 `.cursor/rules/_project.mdc` 文件的功能。

**变更内容**:

1. **已禁用的功能**:
   - ~~从根目录 AGENTS.md 生成 `.cursor/rules/_project.mdc`~~
   - ~~为 `_airef` 中的外部项目生成 Cursor 规则文件~~
   - 相关命令: `map:agents-claude` 不再生成 Cursor 规则文件

2. **保留的功能**:
   - ✅ AGENTS.md 到 CLAUDE.md 的复制（用于 Claude Code）
   - ✅ `.qoder/rules/` 规则文件生成（Qoder 仍需要）
   - ✅ `.codebuddy/.rules/` 规则文件生成（CodeBuddy 仍需要）
   - ✅ AGENTS.md 文件直接部署到目标项目

3. **代码变更**:
   - `src/commands/auto.ts`:
     - Phase 0: **新增** 清理当前项目的 `.cursor/rules/` 目录
     - Phase 3: 禁用 `generateCursorRules()` 调用
     - Phase 4: 禁用 `generateExternalProjectsCursorRules()` 调用
     - Phase 5b: **新增** 清理 `_airef` 项目的 `.cursor/rules/` 目录（在部署前执行）
     - Phase 6: 增强外部项目的 `.cursor` 目录清理注释说明
     - 新增 `cleanAirefCursorRules()` 函数，专门清理 _airef 项目的旧规则文件
     - 相关函数已注释但保留以供参考
   - `src/commands/mapAgentsClaude.ts`:
     - Task 2: 禁用 `generateCursorRules()` 调用
     - 函数已注释但保留以供参考
   - `src/cli.ts`:
     - 更新 `map:agents-claude` 命令描述

4. **文档更新**:
   - `AGENTS.md`: 更新 STEP-4.1.2 章节，标注已废弃的功能
   - `CLAUDE.md`: 同步更新文档内容
   - 添加详细的废弃原因说明

**影响**:
- **当前项目清理**（Phase 0）: 运行 `auto` 命令时会自动删除当前项目的 `.cursor/rules/` 目录
- **_airef 项目清理**（Phase 5b）: 在部署前自动清理 `_airef/*/dist/.cursor/rules/` 目录
- **外部项目清理**（Phase 6）: 部署到外部项目时会清理整个 `.cursor` 目录
- Cursor 将直接使用项目根目录的 AGENTS.md 文件
- 如需支持旧版本 Cursor，可以取消注释相关代码

**迁移指南**:
1. 确保项目根目录有 AGENTS.md 文件
2. 运行 `pnpm tn auto` 或 `tn auto` 自动清理旧的 `.cursor/rules/` 目录
3. Cursor 会自动发现并应用 AGENTS.md 文件
4. 旧的 `.cursor/rules/_project.mdc` 文件会被自动删除，无需手动操作

**重新启用** (如需支持旧版本):
取消注释以下函数:
- `src/commands/auto.ts`: `generateCursorRules()`, `generateExternalProjectsCursorRules()`
- `src/commands/mapAgentsClaude.ts`: `generateCursorRules()`

## [修复] 2025-10-27

### 更改代码链接目录名

将项目代码链接从 `code/` 改为 `.code/`，避免 Obsidian 索引该目录导致卡顿。

**影响范围**:
- `src/commands/auto.ts`: 自动同步命令中的链接创建
- `src/commands/projectSelect.ts`: 项目选择命令中的链接创建

**原因**:
- Obsidian 会自动索引工作区中的所有非隐藏目录
- 外部项目代码目录通常很大，会导致 Obsidian 性能问题
- 使用 `.code` 作为隐藏目录，Obsidian 会自动忽略

## [新增] 2025-10-26

### map-agents-claude 命令

新增 `map-agents-claude` 命令用于自动同步 AGENTS.md 和 CLAUDE.md 文件：

**功能**:
- 扫描项目中所有 AGENTS.md 文件
- 为每个 AGENTS.md 创建对应的 CLAUDE.md（复制内容）
- 生成 `.cursor/rules/project.mdc` 并自动添加 YAML front matter (`alwaysApply: true`)

**使用**:
```bash
tn map-agents-claude
```

**实现细节**:
- 位置: `src/commands/mapAgentsClaude.ts`
- 递归扫描项目，自动跳过隐藏目录
- 已存在的 CLAUDE.md 文件不会被覆盖
- `.cursor/rules/project.mdc` 每次运行都会更新为最新内容

## [重构] 2025-10-25

### 结构优化

#### 新增模块

- **src/types/**: TypeScript 类型定义
  - `TrueNineConfig`: 配置文件接口
  - `InitOptions`: 初始化选项接口
  - `PromptFile`: 提示词文件接口
  - `ProjectSelection`: 项目选择结果接口

- **src/constants/**: 项目常量定义
  - `DEFAULT_CONFIG`: 默认配置对象
  - `DIRECTORY_STRUCTURE`: 目录结构定义
  - `COMMON_PROJECT_FILES`: 通用项目文件列表
  - `CONFIG_FILE_NAME`: 配置文件名常量

- **src/utils/**: 工具函数库
  - `config.ts`: 配置文件读写操作
  - `fs.ts`: 文件系统工具函数
  - `templates.ts`: 模板生成函数
  - `index.ts`: 统一导出

#### 代码改进

1. **消除重复代码**
   - 提取 `getAllFiles` 函数到 `utils/fs.ts`
   - 提取 `getFirstLevelDirs` 函数到 `utils/fs.ts`
   - 提取配置读写逻辑到 `utils/config.ts`
   - 提取模板生成逻辑到 `utils/templates.ts`

2. **类型安全增强**
   - 所有接口统一定义在 `types/` 目录
   - 移除内联接口定义
   - 使用类型导入而非重复定义

3. **常量管理**
   - 硬编码值统一提取到 `constants/`
   - 提高可维护性和一致性

4. **代码质量**
   - 修复所有 TypeScript 类型错误
   - 更新 `@clack/prompts` API 使用(从 `defaultValue` 到 `initialValue`)
   - 移除未使用的导入和变量

### 文件结构

```
src/
├── commands/          # 命令实现
│   ├── config.ts
│   ├── depCheck.ts
│   ├── depUpdate.ts
│   ├── init.ts
│   ├── projectSelect.ts
│   ├── promptBuild.ts
│   └── index.ts      # 新增:命令统一导出
├── constants/         # 新增:常量定义
│   └── index.ts
├── types/            # 新增:类型定义
│   └── index.ts
├── utils/            # 新增:工具函数
│   ├── config.ts
│   ├── fs.ts
│   ├── templates.ts
│   └── index.ts
└── index.ts          # 主入口
```

### 构建验证

- ✅ TypeScript 类型检查通过
- ✅ 构建成功 (tsdown)
- ✅ 输出文件大小: 815.29 kB (6 个文件)

### 下一步计划

- [ ] 添加单元测试
- [ ] 添加 E2E 测试
- [ ] 改进错误处理
- [ ] 添加日志系统
- [ ] 性能优化

