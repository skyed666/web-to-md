# 网页转换器 - Markdown / JSON

一个浏览器扩展，一键将任意网页转换为 **Markdown** 或 **JSON**。
**使用您的本机 IP 直接调用转换服务，无后端、无需 API Key**。
兼容 **Google Chrome** 与 **Microsoft Edge**。

---

## ✨ 功能

- 📄 网页 → **Markdown**（干净正文，便于喂给 LLM）
- 🧾 网页 → **JSON**（原生包裹格式：`{title, url, content, ...}`）
- 📋 一键复制到剪贴板
- 💾 一键下载为 `.md` / `.json` 文件
- 🛡️ 智能混合抓取：被反爬挡住时自动切换本地模式
- 🌍 多语言界面：简体中文 / English / 繁體中文 / 日本語
- 🔒 无后端，不收集个人数据
- 🆓 免费档：按 IP 计费，**20 次/分钟**

## 📦 项目结构

```
web-to-md/
├── manifest.json          # MV3 清单（权限、入口、图标）
├── popup.html             # 弹窗 UI 结构
├── popup.css              # 弹窗样式
├── popup.js               # 核心逻辑（取 URL / 调 API / 复制 / 下载）
├── background.js          # service worker（本地抓取，绕过 CORS）
├── lib/turndown.js        # HTML→Markdown 转换库
├── _locales/              # 多语言文案
│   ├── en/messages.json
│   ├── zh_CN/messages.json
│   ├── zh_TW/messages.json
│   └── ja/messages.json
├── generate-icons.ps1     # 图标生成脚本（一次性，可选）
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 🚀 安装（开发者模式加载）

### Google Chrome

1. 打开 `chrome://extensions/`
2. 右上角打开 **「开发者模式」** 开关
3. 点击 **「加载已解压的扩展程序」**
4. 选择本项目文件夹 `web-to-md`
5. 扩展图标出现在工具栏，可点 📌 固定到显眼位置

### Microsoft Edge

1. 打开 `edge://extensions/`
2. 左下角开启 **「开发人员模式」**
3. 点击 **「加载解压缩的扩展」**
4. 选择本项目文件夹 `web-to-md`

## 📖 使用

1. 打开任意网页（例如 `https://example.com`）
2. 点击工具栏上的扩展图标 → 弹窗自动填入当前网址
3. 点 **「转 Markdown」** 或 **「转 JSON」**
4. 在结果区预览 → 点 **「复制」** 或 **「下载」**

> 也可以在输入框手动粘贴任意网址再转换，不限于当前页。

## 🔧 工作原理

| 项目 | 说明 |
|------|------|
| 端点 | `https://r.jina.ai/{目标URL}`（Jina AI Reader API） |
| Markdown | 直接 GET，返回纯文本 |
| JSON | GET + 请求头 `Accept: application/json`，返回 `{code, status, data:{title,url,content,...}}` |
| 计费 | 无 API Key 时按调用方 IP 计费，**20 RPM 免费** |
| 本地回退 | 远程被反爬挡住时，由 background service worker 直接抓取目标页 HTML（绕过 CORS），再用 turndown 本地转 Markdown |
| 后端 | **无**。所有请求由浏览器从你的 IP 发出 |

## 🌍 多语言（i18n）

扩展根据用户浏览器的界面语言自动切换：

| 语言 | 目录 | 说明 |
|------|------|------|
| English（默认回退） | `_locales/en/` | `default_locale`，其它语言无匹配时回退到此 |
| 简体中文 | `_locales/zh_CN/` |  |
| 繁體中文 | `_locales/zh_TW/` |  |
| 日本語 | `_locales/ja/` |  |

- 添加新语言：复制 `_locales/en/messages.json` 到 `_locales/<新locale>/`，翻译后即可生效。
- manifest 中 `name` / `description` / `default_title` 用 `__MSG_xxx__` 占位符引用对应 key。
- 界面文案用 `data-i18n` / `data-i18n-placeholder` 属性标记，由 `popup.js` 的 `applyI18n()` 在启动时填充。

## ⚙️ 重新生成图标（可选）

图标已生成在 `icons/` 下。如需修改样式，编辑 `generate-icons.ps1` 后运行：

```powershell
powershell -ExecutionPolicy Bypass -File generate-icons.ps1
```

脚本仅依赖 Windows 自带的 .NET `System.Drawing`，无需安装任何东西。

## ❓ 常见问题

**Q: 提示「请求过于频繁」？**
A: 免费档按 IP 限速 20 次/分钟，等一分钟再试即可。

**Q: 提示「无法连接转换服务」？**
A: 检查网络；若处于受限网络环境，目标服务可能需要代理访问。

**Q: 能在 chrome:// 或 edge:// 内部页使用吗？**
A: 浏览器出于安全限制，扩展无法读取内部页 URL。请转换普通网页。

## 📜 许可

MIT
