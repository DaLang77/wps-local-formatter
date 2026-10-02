# WPS 一键排版维护参考

适用仓库：[DaLang77/wps-local-formatter](https://github.com/DaLang77/wps-local-formatter)。先用当前 remote 和 GitHub 状态核对身份、可见性与分支；本参考不能代替实时读回。

## 依据与产品边界

- 从项目根目录读取 `README.md`、`docs/开源发布.md`、`docs/验证记录.md`、`docs/安装说明.md`、`LICENSE`、`NOTICE.md` 和 `CONTRIBUTING.md` 中与本次维护相关的内容。
- 面向 Apple 芯片 Mac（arm64），构建目标为 macOS 13 及以上；最低系统版本的要求不代表已经完成逐版本实机验证。
- 文档记录过 `v1.1.0-beta.4` 预发布版本。每次查询 GitHub 实际版本和当前源代码，不把该版本硬编码为“最新”。
- 源码及项目自绘图标采用 MIT；不分发 WPS、字体或用户文档，也不代表 WPS 官方产品。
- 既有真实 WPS 记录限本机 WPS Office 12.1.28496。未完成 Apple Developer ID 签名与公证，独立新 Mac / 全新系统用户安装、更新、卸载及兼容验收尚未完整完成。除非本次取得新证据，README 和发布说明须保留这些边界。

## 验证与打包

在已核定的项目根目录运行适用检查：

```bash
node --test tests/*.test.cjs
python3 tests/verify-settings-store.py
python3 tests/verify-installer.py
bash scripts/package.sh
```

前三项分别覆盖 JavaScript 回归、Swift 设置存储及隔离安装事务；打包脚本生成 App、DMG、白名单 source.zip 和 SHA256SUMS.txt。具体实现和文件名以当前 `scripts/package.sh`、构建脚本及 `.github/workflows/checks.yml` 为准。文档维护不要求重新打包历史版本；仅修改打包白名单时，在隔离的临时源码快照中验证归档内容和哈希，保留工作目录原有 Release 资产，避免覆盖同名历史包。可复制现有 App 并使用脚本的 `--no-build` 模式验证收集过程；这不构成新产品构建验收。

真实 WPS 验收需要合成文档的写入后回读、再次排版与单次撤销；单纯打开或保存文档不足以确认排版成功。优先复用 `tests/create-fixtures.py` 生成的数据，保留原文档、个人模板及当前配置。

## 图片与公开范围

截图展示实际安装窗口、WPS 入口、模板设置或合成文档前后效果，保留完整可读文字。检查窗口标题、个人路径、文档正文和图片元数据；不能从真实客户文书直接截取“示例”。在 README 相对路径嵌入经过审核的图片，并现场核验 GitHub 能加载。

现有 `scripts/capture-demo-images.cjs` 使用 Playwright 和 Chrome 加载真实设置页面，提供隔离的合成只读 API，不连接 WPS；生成 `docs/images/settings-{title,signature,paragraph}.png`。复用时注明这是合成配置下的设置界面示例，不能据此声称真实 WPS 排版通过。它是可选的文档工具，不增加普通用户的安装依赖。

公开内容包括源码、测试和合成数据生成器、文档、CI、许可声明、审核后的示例图片，以及 `skills/github-open-source-release/`。排除本地 `evidence/`、用户配置、案件或历史文档快照、字体、设计草稿、缓存、`.DS_Store` 和本地构建发布资产；新增文件仍需内容检查，`.gitignore` 不是隐私审核。

发布新产品版本时同步核对 `scripts/package.sh` 的 source.zip 白名单：必须包含公开 skill 和示例图片，排除上述本地内容；打开压缩包核验，不能仅凭脚本退出成功。用 GitHub 远程 tag、提交和下载资产校验实际一致性。只增加 README 图片或维护 skill 时只更新仓库，不更改既有 tag 或替换历史 `v1.1.0-beta.4` 资产。
