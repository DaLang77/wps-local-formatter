# 参与贡献

欢迎通过 Issue 或 Pull Request 提交修复。当前目标为 Apple 芯片 Mac、macOS 13 及以上的 WPS 文字。

## 本地检查

需要 Xcode Command Line Tools、Node.js 22 或以上和 Python 3。克隆仓库后在根目录运行：

```sh
node --test tests/*.test.cjs
python3 tests/verify-settings-store.py
python3 tests/verify-installer.py
bash scripts/build.sh
```

JavaScript 测试可在其他系统运行；Swift 检查与应用构建需要 macOS。GitHub Actions 执行这些检查，不启动 WPS、不安装插件、不访问用户文档。

## WPS 实测

涉及排版行为的修改，还需在 WPS 中用合成文档验证：读取实际格式、确认文字及排除区域未改变、重复执行没有修改、一次撤销恢复原状。记录系统与 WPS 版本；成功提示或模拟测试不能代替实际文档验证。

`python3 tests/create-fixtures.py` 可生成合成测试文档，需要额外安装 `python-docx`。诊断需显式开启 `--diagnostics`，仅用于名称为 `WPS排版*.docx` 的测试文件。历史 `tests/verify-live.py` 需要本地诊断快照，不属于自动检查；快照不随仓库发布。

## 提交范围

请说明问题、修改后的行为和验证结果。与现有模板兼容，保留撤销及原有内容保护；不要用放宽校验掩盖 WPS 写入失败。

不要提交真实客户文书、个人模板、诊断快照、日志、凭据或字体。使用自行生成的示例，发布前检查文件内容；不要只依赖 `.gitignore`。新增代码和项目图形素材须可按 MIT 许可证分发，并在需要时补充来源说明。
