# WPS 一键排版

[![检查](https://github.com/DaLang77/wps-local-formatter/actions/workflows/checks.yml/badge.svg)](https://github.com/DaLang77/wps-local-formatter/actions/workflows/checks.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Mac 本地 WPS 文字插件。按模板统一标题、正文、落款、页面、页眉页脚和页码；文档不上传，整次操作可用 ⌘Z 撤销。

## 安装与使用

面向 Apple 芯片 Mac，构建目标为 macOS 13 及以上。普通用户不需要 Python、Node 或编译工具。

1. 从 [GitHub 发布页](https://github.com/DaLang77/wps-local-formatter/releases/tag/v1.1.0-beta.4) 下载 `wps-local-formatter-1.1.0-beta.4-arm64.dmg`。
2. 保存文档并退出 WPS。打开 DMG 中的应用，选择「安装 / 更新」。
3. 重新打开 WPS 文档，在「一键排版 → 排版设置」配置格式；点「排版结果」查看完整信息。
4. 保存设置，回到文档点击「一键排版」。检查后自行保存文档。

详细步骤、卸载及故障排查见 [安装说明](docs/安装说明.md)。当前为本地签名测试版，未通过 Apple 公证，不要求关闭系统安全保护。已实测 WPS 12.1.28496；全新系统用户和其他 WPS 版本尚未验收。

## 功能

- 标题、正文、落款、页面可分别启用；字体、字号、对齐、缩进、行距和段距可配置。
- 首个非空普通段落为标题，文末指定数量为落款；表格、文本框、页眉页脚不参与正文规则。
- 「落款」顶部可选无落款、1/2/3 段或输入 0～99 段；按回车形成的非空段落计数，自动换行、空行不计。每个模板可保存自己的落款范围和格式。
- 标题后的首个非空正文段落若以中文冒号结尾（如“某某公司：”），不作首行缩进；正文缩进设为“保持原样”时不改动原格式。
- 「全篇段落」可统一正文区标题、正文和落款的左右缩进为 0、段前段后为 0、行距为 1.5 倍，并关闭文档网格相关的两个选项；不覆盖各部分的首行缩进规则。可单独设置允许西文在单词中间换行。
- 开启全篇统一后，各部分的行距和段距输入会禁用并提示统一规则；关闭统一后可单独自定义。
- 纸张、方向、四侧页边距应用到各节。
- 页眉、页脚文字、页码独立启用，默认关闭。启用部分统一替换，关闭部分保留。
- 页眉页脚可设文字、字体、字号、对齐和距边缘距离。页码支持 `1`、`第1页`、`第1页/共N页`，使用 PAGE / NUMPAGES 动态域。
- 可指定起始数字，分别隐藏首页页眉、页脚文字或页码。首页仍计数；页脚文字与页码分两行，各节连续编号。
- 可另存具名模板；旧模板会补齐新字段。页眉页脚仍默认关闭，全篇段落和西文换行默认开启。暂不提供模板导入导出、多级标题或 Windows 版本。

页眉页脚的奇偶页不同、表格、图片等复杂对象暂不支持自动替换。无法安全分离页脚文字与页码，或首页设置影响未启用部分时，会在修改前停止。不要把代码测试通过等同于所有文档均兼容；验收范围见 [验证记录](docs/验证记录.md)。

## 数据与安全

设置位于 `~/Library/Application Support/WPSLocalFormatter/settings.json`。更新保留模板；卸载移除服务和插件注册，保留数据与应用副本。安装更新失败尝试恢复旧版本。

服务仅监听 `127.0.0.1:38941`，写入接口校验启动令牌与来源，无任意代码执行接口。诊断需显式 `--diagnostics`，检查与撤销限定 `WPS排版*.docx` 测试文件。应用不主动保存文档，WPS 自身自动保存设置仍生效。缺字体、只读、保护或修订模式会阻止排版。

## 开发

需要 Xcode Command Line Tools；Node 用于 JavaScript 测试，Python 3 用于测试驱动。

```sh
bash scripts/build.sh
node --test tests/*.test.cjs
python3 tests/verify-settings-store.py
python3 tests/verify-installer.py
bash scripts/package.sh
```

打开 `dist/WPS一键排版.app` 可使用原生安装界面。`scripts/install-background.py` 是开发环境安装脚本；对外安装包使用 Swift 原生安装事务。

生成合成测试文档：安装开发依赖 `python-docx` 后，在项目根目录运行 `python3 tests/create-fixtures.py`。真实 WPS 验证必须另行执行，包括回读、重复排版和撤销。

源码包采用白名单收集并排除个人文档、配置、日志、字体及历史验收数据；构建缓存与发布包不进入源码仓库。

## 反馈与贡献

通过 [Issues](https://github.com/DaLang77/wps-local-formatter/issues) 报告问题，注明 macOS、芯片、WPS 版本及复现步骤。请使用合成文档，避免上传客户文书、个人模板、令牌和含文档内容的诊断记录。贡献步骤见 [CONTRIBUTING](CONTRIBUTING.md)。

## 许可

[MIT](LICENSE)。本项目与 WPS 官方无隶属关系，不附带字体文件。接口参考和素材说明见 [NOTICE](NOTICE.md)。
