# 版本说明 (Release Notes)

提交到 Chrome Web Store / Edge Add-ons 时，在「Package / 打包」步骤的 Release notes 字段填入对应语言的文案。
每种语言最多 1024 字符，纯文本（支持换行和 • - 等符号，但不会渲染 Markdown）。

---

## v1.1.0

### 简体中文（zh_CN）

```
v1.1.0

🆕 新增：
• 选中文本转换：选中网页里的一段，只转选中部分（弹窗会提示选中字数）
• 快捷键：Ctrl+Shift+M 转 Markdown、Ctrl+Shift+J 转 JSON（可在浏览器扩展快捷键设置里改）
• Token 预估：转换后显示约多少 tokens / 字数，方便喂给 AI

⚡ 优化：
• 智能选区优先：有选中就转选中，无选中才转整页
```

### English (en)

```
v1.1.0

🆕 New:
• Selection conversion: select text on a page and convert only that part (popup shows the char count)
• Keyboard shortcuts: Ctrl+Shift+M for Markdown, Ctrl+Shift+J for JSON (customizable in browser extension shortcuts)
• Token estimate: shows approximate tokens / char count after conversion, handy for AI input

⚡ Improved:
• Smart selection priority: converts selection if any, else the full page
```

### 繁體中文（zh_TW）

```
v1.1.0

🆕 新增：
• 選取文字轉換：選取網頁裡的一段，只轉選取部分（彈窗會提示選取字數）
• 快捷鍵：Ctrl+Shift+M 轉 Markdown、Ctrl+Shift+J 轉 JSON（可在瀏覽器擴充功能快捷鍵設定改）
• Token 預估：轉換後顯示約多少 tokens / 字數，方便餵給 AI

⚡ 最佳化：
• 智慧選取優先：有選取就轉選取，無選取才轉整頁
```

### 日本語（ja）

```
v1.1.0

🆕 新機能：
• 選択範囲変換：ページ内の文字を選択すると、その部分だけ変換（文字数も表示）
• ショートカットキー：Ctrl+Shift+M で Markdown、Ctrl+Shift+J で JSON（ブラウザの拡張機能ショートカットで変更可能）
• Token 推定：変換後に概算 tokens / 文字数を表示、AI 入力に便利

⚡ 改善：
• スマート選択優先：選択があればそれを変換、なければページ全体
```

---

## v1.0.0 首版发布

### 简体中文（zh_CN）

```
🎉 网页转换器首个版本发布！

核心功能：
• 一键将任意网页转换为 Markdown 或 JSON
• 智能混合抓取：被网站反爬挡住时自动切换本地模式
• 一键复制到剪贴板 / 下载为 .md 或 .json 文件
• 多语言界面：简体中文、English、繁體中文、日本語
• 可在右上角手动切换语言，设置会自动记住
• 纯前端无后端，不收集任何个人数据

欢迎反馈使用建议！
```

### English (en)

```
🎉 First release of Web to Markdown / JSON!

Key features:
• Convert any webpage to Markdown or JSON in one click
• Smart hybrid fetching: auto-fallback to local mode when blocked by anti-bot
• One-click copy to clipboard / download as .md or .json
• Multilingual UI: 简体中文, English, 繁體中文, 日本語
• Switch language manually from the top-right; your choice is remembered
• No backend, no personal data collection

Feedback welcome!
```

### 繁體中文（zh_TW）

```
🎉 網頁轉換器首個版本發布！

核心功能：
• 一鍵將任意網頁轉換為 Markdown 或 JSON
• 智慧混合抓取：被網站反爬擋住時自動切換本地模式
• 一鍵複製到剪貼簿 / 下載為 .md 或 .json 檔案
• 多語言介面：簡體中文、English、繁體中文、日本語
• 可在右上角手動切換語言，設定會自動記住
• 純前端無後端，不收集任何個人資料

歡迎回饋使用建議！
```

### 日本語（ja）

```
🎉 Web to Markdown / JSON 初回リリース！

主な機能：
• ウェブページをワンクリックで Markdown または JSON に変換
• スマートハイブリッド取得：ボット対策でブロックされた場合、自動でローカルモードに切り替え
• クリップボードにコピー / .md または .json としてダウンロード
• 多言語 UI：简体中文、English、繁體中文、日本語
• 右上で手動切替可能。設定は自動で記憶されます
• バックエンドなし、個人データの収集なし

フィードバックお待ちしております！
```

---

## 后续版本更新模板

发新版本时，复制下面的模板，按实际情况删减。保持"用户视角"，只写感知得到的变化。

### 简体中文模板

```
 vX.Y.Z

🆕 新增：
• （新功能，从用户视角描述）
• 

🔧 修复：
• （修复的问题，描述现象而非技术细节）
• 

⚡ 优化：
• （体验提升，如"转换速度更快""界面更流畅"）
• 
```

### English 模板

```
vX.Y.Z

🆕 New:
• (feature from user's perspective)
•

🐛 Fixed:
• (the symptom that was wrong)
•

⚡ Improved:
• (e.g. "faster conversion", "smoother UI")
•
```

---

## 示例：假如以后发布了 v1.1.0

### 简体中文

```
v1.1.0

🆕 新增：
• 右键菜单：在任意链接上右键即可转换该链接页面
• 转换历史：最近 10 条记录可快速重选

🔧 修复：
• 部分网站转换后图片丢失的问题
• 日语环境下按钮文字被截断的问题

⚡ 优化：
• 大型网页转换速度提升约 30%
```

### English

```
v1.1.0

🆕 New:
• Right-click menu: convert any link's page directly from the context menu
• Conversion history: quick access to your last 10 conversions

🐛 Fixed:
• Images missing in conversions from certain sites
• Button text truncated in Japanese

⚡ Improved:
• ~30% faster conversion for large pages
```

---

## 填写注意事项

1. **每种语言一份**：商店支持按语言分别填，至少填简中和 English，覆盖最大用户群。
2. **字符数自查**：每段不超过 1024 字符（含空格换行）。上面所有范例都在 300 字符内，安全。
3. **别和 description 重复**：description 讲"是什么"，release notes 讲"这次变了什么"。
4. **首版可简化**：如果觉得首版 release notes 和 description 太像，可以只写一句"首个版本发布，欢迎使用并反馈！"，把细节留给 description。
5. **版本号要对齐**：release notes 里写的 vX.Y.Z 必须和 manifest.json 里的 `"version"` 完全一致。
