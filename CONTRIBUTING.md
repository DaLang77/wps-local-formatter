# 参与贡献

当前目标为 Apple 芯片 Mac、macOS 13 及以上的 WPS 文字。运行时需要 Node.js 22 或 24 LTS。

## 本地检查

```sh
npm ci --ignore-scripts
node --test tests/*.test.cjs
node node-host/cli.mjs selftest
bash scripts/package.sh
python3 tests/verify-package.py
```

可选浏览器测试需要 `npm install --no-save --package-lock=false playwright` 和 Chrome，再运行 `node --test tests/ui-browser.test.cjs`。图片示例运行 `node scripts/capture-demo-images.cjs`。这些工具只使用合成数据，不是普通用户依赖；插件构建会重新按锁文件收集唯一运行依赖。

保留的 Swift 历史兼容检查需要 macOS 和 Xcode Command Line Tools：`python3 tests/verify-settings-store.py`、`python3 tests/verify-installer.py`。不为新版本构建 App/DMG。

GitHub Actions 检查 Node 22/24、回归、归档白名单与校验，不启动 WPS或访问个人文档。浏览器条件测试未取得运行依赖时明确跳过，不能称作通过。

## WPS 实测

用 `python3 tests/create-v12-fixtures.py` 生成合成文档（可选开发依赖 python-docx）。涉及排版的修改还须真实 WPS 回读，确认正文、表格、文本框、编号、选区外属性、重复执行和一次撤销。记录系统与 WPS 版本；模拟或成功提示不能代替实际文档证据。

诊断用 `node node-host/cli.mjs host --diagnostics --settings /绝对隔离路径`，只能检查/撤销 `WPS排版*.docx` 合成测试文档。不得自动关闭 WPS或保存真实用户文档。快照只存本地 `evidence/`，不进入公开包。

## 提交范围

保持 v1 模板迁移兼容、版本和 revision；分析/范围/修改计划共用同一核心。不要放宽回读校验掩盖 WPS 拒绝写入。

说明具体触发、修改后的行为及验证边界。只暂存明确路径，不提交客户文书、个人模板、诊断快照、日志、凭据或字体。MIT 源码和第三方许可须兼容，新增公开文件需要内容审查。
