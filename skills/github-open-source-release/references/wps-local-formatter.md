# WPS 一键排版维护参考

适用仓库：[DaLang77/wps-local-formatter](https://github.com/DaLang77/wps-local-formatter)。先用当前 remote 和 GitHub 状态核对身份、可见性与分支；本参考不能代替实时读回。

## 依据与产品边界

- 从项目根目录读取 `README.md`、`docs/开源发布.md`、`docs/验证记录.md`、`docs/安装说明.md`、`LICENSE`、`NOTICE.md` 和 `CONTRIBUTING.md` 中与本次维护相关的内容。
- 面向 Apple 芯片 Mac（arm64）、macOS 13 及以上。1.2 候选运行时要求 Node.js 22 或 24 LTS，改为插件 ZIP，不构建新 App/DMG，不要求 Developer ID 或 Apple 公证；最低要求不能代替逐版本实机验证。
- 历史 `v1.1.0-beta.4` Release 保留。`v1.2.0-beta.1` 当前是待完整验收的候选；每次查询 GitHub 实际版本和源码，不把候选或历史版本硬编码为“已发布最新”。
- 源码及项目自绘图标采用 MIT；不分发 WPS、字体或用户文档，也不代表 WPS 官方产品。
- 历史真实 WPS 记录限本机旧版 WPS Office 12.1.28496。新 Node 候选的真实 WPS 与全新系统用户验收尚未完成；隔离安装模拟、页面截图和源码通过不能替代。除非本次取得新证据，README/Release 保留这些边界；用户计划要求五项实际验收完成后一次发布。

## 验证与打包

在已核定的项目根目录运行适用检查：

```bash
npm ci --ignore-scripts
node --test tests/*.test.cjs
node node-host/cli.mjs selftest
bash scripts/package.sh
python3 tests/verify-package.py
```

上述覆盖配置/核心/桥接/Node 存储/HTTP/隔离初始化事务、自检和 ZIP 白名单/源码字节/许可证/校验。浏览器测试需要可选 Playwright，CI 的独立 browser job 安装固定开发工具；缺依赖时明确跳过。macOS 另保留历史 Swift 存储/安装事务检查，不构建新 App。

打包输出英文名插件 ZIP、source.zip 和版本专属 SHA256 清单，使用说明在运行 ZIP 内；锁定运行依赖随包包含。维护者打包需要 Python 3，普通用户不需要。历史 DMG/资产/tag 不覆盖。独立临时端口自检与服务 build-id 校验仍不能证明 WPS 插件已可用。

真实 WPS 验收需要合成文档的写入后回读、再次排版与单次撤销；单纯打开或保存文档不足以确认排版成功。优先复用 `tests/create-v12-fixtures.py` 和历史 `tests/create-fixtures.py` 生成的数据，保留原文档、个人模板及当前配置。

## 图片与公开范围

截图展示实际安装窗口、WPS 入口、模板设置或合成文档前后效果，保留完整可读文字。检查窗口标题、个人路径、文档正文和图片元数据；不能从真实客户文书直接截取“示例”。在 README 相对路径嵌入经过审核的图片，并现场核验 GitHub 能加载。

现有 `scripts/capture-demo-images.cjs` 使用 Playwright 和 Chrome 加载真实设置页面，提供隔离的合成只读 API，不连接 WPS；生成设置、结构与环境页面的 7 张示例图。复用时注明这是合成配置下的设置界面示例，不能据此声称真实 WPS 排版通过。它是可选的文档工具，不增加普通用户的安装依赖。

公开内容包括源码、测试和合成数据生成器、文档、CI、许可声明、审核后的示例图片，以及 `skills/github-open-source-release/`。排除本地 `evidence/`、用户配置、案件或历史文档快照、字体、设计草稿、缓存、`.DS_Store` 和本地构建发布资产；新增文件仍需内容检查，`.gitignore` 不是隐私审核。

发布新产品版本时同步核对 `scripts/package.sh` 的 source.zip 白名单：必须包含公开 skill 和示例图片，排除上述本地内容；打开压缩包核验，不能仅凭脚本退出成功。用 GitHub 远程 tag、提交和下载资产校验实际一致性。只增加 README 图片或维护 skill 时只更新仓库，不更改既有 tag 或替换历史 `v1.1.0-beta.4` 资产。
