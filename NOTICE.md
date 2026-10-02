# 实现与参考

本项目的 Swift 原生应用、本地服务、段落规则与 WPS 加载项代码在本项目内编写。
未打包或执行第三方项目的安装程序，也未引入 AI 模型或云排版服务。

接口核对资料：
- WPS 官方 npm 包 wpsjs 2.2.3：Mac 的 jspluginonline 注册格式与 HTML/功能区入口。
- WPS npm 类型声明 wps-jsapi-declare 2.2.0：段落、字体、字符缩进、行距与 UndoRecord 接口。
- bigben446/Zotero-WPSJS：用于研究 Mac 接入可行性；正式实现未复制其业务代码。

不随应用分发字体文件。字体由用户本机和 WPS 提供，安装前后均不分发或替换字体。

安装程序图标由本项目的 `scripts/make-icon.swift` 绘制；界面操作图标为本项目 SVG 线条图形，无需额外图标库。
