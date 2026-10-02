# WPS 一键排版

[![检查](https://github.com/DaLang77/wps-local-formatter/actions/workflows/checks.yml/badge.svg)](https://github.com/DaLang77/wps-local-formatter/actions/workflows/checks.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Mac 本地 WPS 文字插件。读取文档结构，按模板排版标题、正文、称谓、落款及九级标题。文档不上传；整次操作支持 ⌘Z 撤销，保存由用户决定。

## 版本与安装

`1.2.0-beta.1` 是待完整验收的候选版本，改为 ZIP + Node.js 服务；不再构建新 App 或 DMG。正式预发布需在 [验证记录](docs/验证记录.md) 的验收项完成后创建。历史 [1.1.0-beta.4](https://github.com/DaLang77/wps-local-formatter/releases/tag/v1.1.0-beta.4) 仍保留。

面向 Apple 芯片 Mac、macOS 13 及以上；需要自行准备 **Node.js 22 或 24 LTS** 和 Mac 版 WPS。最低系统要求不代表各系统/WPS 版本都已验证。

1. 解压插件 ZIP，保存文档并完全退出 WPS。
2. 双击「初始化.command」，确认显示“初始化的本地操作已完成”。依赖已包含，无需编译、安装 npm 包或修改注册文件；按系统正常流程处理数据访问授权。出现“未完成”时先处理窗口中的错误。
3. 打开 WPS 文字文档，进入「一键排版 → 环境检查」，确认服务、插件接口、文档和字体状态。
4. 在「排版设置」选择模板；需要时用「文档结构」纠正角色或选择范围，点击「一键排版」。检查后自行保存文档。

初始化一次后登录自动启动。更新重复运行初始化；「回退.command」「卸载.command」提供对应入口。详细说明见 [安装说明](docs/安装说明.md)。

## 结构、范围与分页

- 旧模板沿用首尾规则：首个非空普通段为标题，末尾 0～99 个普通段为落款。新模板优先读已有标题样式/大纲级别，再回退到首尾规则。
- 「文档结构」显示摘要、角色和依据；可指定标题、正文、称谓、落款、一级至九级标题或保持原样。人工指定优先；保持原样完全排除属性写入。
- 人工标记只存在于当前文档会话。关闭、切换、正文文字变化或段落拆合后清除，须重新检查结构；不写入文档和模板。
- 整篇/选中段落默认为整篇，不保存到模板。部分文字选区按整段处理；空选区、非正文或纯表格选区停止。
- 全篇识别后才筛选选区。选区外不写入属性；选区模式停用页面、页眉页脚和页码，自然分页仍可能变化。
- 可先看改动清单，也可直接一键排版，无强制确认弹窗。
- 标题跟随、段内尽量不分页、正文孤行控制、连续落款尽量同页可分别保持原样/启用/关闭。空段仅在必要时加分页链接；表格、手动分页、分节和排除段落会终止链接，不插入空行或分页符。长段或超过一页的落款不保证同页。
- 九级标题可独立设置，以大纲级别表达层次，不批量替换 WPS 样式。新模板保护原编号、级别、值、标签及两种单位的缩进，不重新套编号模板。

标题后首个非空正文若以中文冒号结尾，不作首行缩进；缩进选保持原样时不改。表格、文本框和其他故事区域不参与正文排版。

## 模板复用与环境检查

- 从当前普通段落提取格式到指定角色草稿；混合或无法表达的值保持原样。提取只读，不自动保存。
- 全篇段落启用时仍覆盖角色行距、段距，界面会提示；各角色字体和首行缩进保留自身规则。
- 单个模板 JSON 导入/导出。导入完整校验并追加，同名须改名，不自动选择或排版。
- 分享默认清除页眉页脚文字并关闭对应开关；只有显式选择才包含这些文字。
- 环境检查区分本地服务、心跳、WPS API、文档、版本、注册和字体。未取得实际字体列表时显示等待；确认缺失后，由用户选择本机字体并保存。
- 纸张、页边距、页眉页脚及动态页码沿用旧版配置。复杂页眉页脚在修改前停止并解释原因。

## 图片示例

以下截图来自实际页面与合成数据，展示界面，不代表真实 WPS 排版验收。

![标题设置](docs/images/settings-title.png)

![落款范围](docs/images/settings-signature.png)

![统一段落](docs/images/settings-paragraph.png)

![文档结构与人工纠正](docs/images/structure.png)

![识别和分页设置](docs/images/settings-pagination.png)

![服务、插件及字体检查](docs/images/environment.png)

## 数据与安全

服务仅监听 `127.0.0.1:38941`；启动令牌、Host/Origin 校验、静态白名单和请求长度限制继续保留。没有任意命令或文件操作接口。

设置保存在 `~/Library/Application Support/WPSLocalFormatter/settings.json`。读取旧配置仅在内存迁移；首次保存 v2 前备份，再原子写入。安装不改配置，失败尝试恢复旧启动项和注册。回退到旧 Swift 服务前另存新配置，再恢复旧版兼容快照；旧 App 保留。卸载保留设置和备份，不动其他插件。

分析只传摘要，不记录正文。诊断需要显式 `--diagnostics`，限定 `WPS排版*.docx` 合成测试文件。缺字体、只读、保护和修订模式会在修改前停止。

## 开发与验证

```sh
npm ci --ignore-scripts
node --test tests/*.test.cjs
node node-host/cli.mjs selftest
bash scripts/package.sh
python3 tests/verify-package.py
```

Node 运行时依赖仅有锁定的 MIT XML 解析器 `@xmldom/xmldom`。开发打包用 Python 3；普通用户不需要它。Swift 源码及历史测试保留用于旧版回退，不参与新 ZIP 的运行时构建。

合成文档生成：安装可选开发依赖 `python-docx` 后运行 `python3 tests/create-v12-fixtures.py`。真实 WPS 验证必须检查格式、文字、表格、文本框、编号、选区外属性、重复排版和一次撤销；自动测试无法代替这些检查。

可选浏览器回归及图片工具依赖 Playwright/Chrome，不随插件分发。详情见 [贡献说明](CONTRIBUTING.md)。公开包排除个人文档、配置、日志、字体和本地证据。

GitHub 维护使用 [github-open-source-release skill](skills/github-open-source-release/SKILL.md)，流程见 [开源发布](docs/开源发布.md)。问题反馈请使用合成文档，并注明系统、芯片、Node 和 WPS 版本。

## 许可

[MIT](LICENSE)。与 WPS 官方无隶属关系，不分发 WPS 或字体。第三方声明见 [NOTICE](NOTICE.md)。
