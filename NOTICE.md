# 实现与参考

本项目的 Node 本地服务、初始化事务、段落规则与 WPS 加载项代码在本项目内编写。
Swift 源码保留用于历史版本与回退研究；新 ZIP 不分发或构建 App/DMG。未引入 AI 模型或云排版服务。

运行时唯一第三方依赖是 [xmldom/xmldom](https://github.com/xmldom/xmldom) 的 `@xmldom/xmldom` **0.9.12**，采用 MIT 许可证；锁文件包含下载地址与完整性值，插件 ZIP 保留该包的 LICENSE。其用途仅为解析和更新 WPS 插件注册 XML。其他 HTTP、文件、进程与密码学操作使用 Node 标准库。

接口核对资料：
- WPS 官方 npm 包 wpsjs 2.2.3：Mac 的 jspluginonline 注册格式与 HTML/功能区入口。
- WPS npm 类型声明 wps-jsapi-declare 2.2.0：段落、字体、字符缩进、行距与 UndoRecord 接口。
- bigben446/Zotero-WPSJS：用于研究 Mac 接入可行性；正式实现未复制其业务代码。

不随应用分发字体文件。字体由用户本机和 WPS 提供，安装前后均不分发或替换字体。

安装程序图标由本项目的 `scripts/make-icon.swift` 绘制；界面操作图标为本项目 SVG 线条图形，无需额外图标库。

`docs/images/` 为本项目实际设置、结构与环境页面的截图，使用合成配置与接口，通过 `scripts/capture-demo-images.cjs` 生成，随项目采用 MIT 许可。图片不代表真实 WPS 结果。Playwright 为 Apache-2.0 开发工具，仅用于浏览器检查/截图，不随插件 ZIP 分发。
