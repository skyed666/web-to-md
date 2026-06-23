// ===== DOM 引用 =====
const urlInput = document.getElementById("urlInput");
const btnMarkdown = document.getElementById("btnMarkdown");
const btnJson = document.getElementById("btnJson");
const btnCopy = document.getElementById("btnCopy");
const btnDownload = document.getElementById("btnDownload");
const statusBox = document.getElementById("statusBox");
const resultWrapper = document.getElementById("resultWrapper");
const result = document.getElementById("result");
const resultTitle = document.getElementById("resultTitle");
const resultMeta = document.getElementById("resultMeta");

// ===== 当前结果状态 =====
let current = {
  format: null,        // "markdown" | "json"
  content: "",         // 展示/复制/下载的文本
  filename: "result",  // 下载文件名（无扩展名）
  source: null,        // "remote" | "local" | "selection" —— 标记结果来源
};

// 启动时从 background 读到的选中文本（若有）
let pendingSelection = "";

// ===== 常量 =====
// Jina AI Reader API 端点（明文，便于商店审核透明化）
const ENDPOINT = "https://r.jina.ai/";
const FETCH_TIMEOUT_MS = 30000;

// ===================================================
// 国际化（i18n）工具 —— 支持运行时切换语言
// 绕开 chrome.i18n.getMessage（它只读、加载时锁定），
// 改为运行时 fetch 所有 messages.json 到内存，自管语言。
// ===================================================
const SUPPORTED_LANGS = ["zh_CN", "en", "zh_TW", "ja"];
const DEFAULT_LANG = "en";

// 内存中的全部文案：{ zh_CN: {...}, en: {...}, ... }
let MESSAGES = {};
// 当前语言
let currentLang = DEFAULT_LANG;

// DOM 引用：语言下拉框（在 html 中声明）
const langSelect = document.getElementById("langSelect");

// 加载所有语言的 messages.json 到 MESSAGES
async function loadAllMessages() {
  await Promise.all(
    SUPPORTED_LANGS.map(async (lang) => {
      const url = chrome.runtime.getURL("_locales/" + lang + "/messages.json");
      try {
        const res = await fetch(url);
        MESSAGES[lang] = await res.json();
      } catch (e) {
        // 某语言加载失败时静默跳过，后续回退到 DEFAULT_LANG
        console.warn("Failed to load locale", lang, e);
      }
    })
  );
  if (!MESSAGES[DEFAULT_LANG]) {
    // 连默认语言都加载失败：用空对象兜底，避免后续崩溃
    MESSAGES[DEFAULT_LANG] = {};
  }
}

// 把 chrome 的 UI 语言（如 "zh-CN"、"zh-TW"、"ja"、"en-US"）映射到我们支持的 locale
function mapUiLang(uiLang) {
  const l = (uiLang || "").toLowerCase();
  if (l.startsWith("zh-cn") || l === "zh" || l.startsWith("zh-hans") || l.startsWith("zh-sg")) return "zh_CN";
  if (l.startsWith("zh-tw") || l.startsWith("zh-hk") || l.startsWith("zh-mo") || l.startsWith("zh-hant")) return "zh_TW";
  if (l.startsWith("ja")) return "ja";
  return "en";
}

// 决定启动时的语言：优先用户已保存的选择 → 否则按浏览器 UI 语言自动检测
async function detectInitialLang() {
  try {
    const stored = await chrome.storage.local.get("lang");
    if (stored.lang && SUPPORTED_LANGS.includes(stored.lang)) {
      return stored.lang;
    }
  } catch (e) {
    // storage 读取失败时忽略
  }
  return mapUiLang(chrome.i18n.getUILanguage());
}

// 取本地化文案。substitutions 用于替换 $PLACEHOLDER$ / $1 占位符。
// 找不到时：回退到 DEFAULT_LANG → 仍找不到回退到 key 本身。
function i18n(key, substitutions) {
  const entry = resolveEntry(key);
  if (!entry || typeof entry.message !== "string") return key;
  return applyPlaceholders(entry, substitutions);
}

// 在 currentLang 找不到时回退到 DEFAULT_LANG
function resolveEntry(key) {
  if (MESSAGES[currentLang] && MESSAGES[currentLang][key]) {
    return MESSAGES[currentLang][key];
  }
  if (MESSAGES[DEFAULT_LANG] && MESSAGES[DEFAULT_LANG][key]) {
    return MESSAGES[DEFAULT_LANG][key];
  }
  return null;
}

// 按 Chrome 规范解析占位符：
//   $XXX$ → 由 placeholders[xxx].content（形如 "$1"）映射到 substitutions[index]
//   兜底：若 content 不是 $N 形式，直接当成字面量替换
function applyPlaceholders(entry, substitutions) {
  let msg = entry.message;
  const ph = entry.placeholders || {};
  const subs = Array.isArray(substitutions) ? substitutions : substitutions != null ? [substitutions] : [];

  for (const [name, def] of Object.entries(ph)) {
    const token = "$" + name.toUpperCase() + "$";
    if (!msg.includes(token)) continue;
    const content = (def && def.content) || "";
    const m = content.match(/^\$(\d+)$/);
    let value = content;
    if (m) {
      const idx = parseInt(m[1], 10) - 1; // $1 → index 0
      value = idx >= 0 && idx < subs.length ? subs[idx] : "";
    }
    msg = msg.split(token).join(value);
  }
  return msg;
}

// 遍历 DOM 填充文案
function applyI18nToDom() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = i18n(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = i18n(el.getAttribute("data-i18n-placeholder"));
  });
}

// 同步下拉框的选中值到 currentLang
function syncLangSelect() {
  if (langSelect && SUPPORTED_LANGS.includes(currentLang)) {
    langSelect.value = currentLang;
  }
}

// 用户切换语言：保存 → 更新 currentLang → 重新渲染整个界面
async function changeLang(newLang) {
  if (!SUPPORTED_LANGS.includes(newLang) || newLang === currentLang) return;
  currentLang = newLang;
  try {
    await chrome.storage.local.set({ lang: newLang });
  } catch (e) {
    // 存储失败不影响本次切换
  }
  syncLangSelect();
  applyI18nToDom();
  // 若已有转换结果，结果标题也要跟着换语言
  if (resultWrapper && !resultWrapper.classList.contains("hidden")) {
    renderResult();
  }
}

if (langSelect) {
  langSelect.addEventListener("change", () => changeLang(langSelect.value));
}

// ===================================================
// 1. 初始化：加载语言 → 套用 → 再填当前标签页 URL
// ===================================================
(async function init() {
  // 先加载语言资源，避免界面闪现旧语言
  await loadAllMessages();
  currentLang = await detectInitialLang();
  syncLangSelect();
  applyI18nToDom();

  // 读取当前页选中文本（用于"选中即转"）
  try {
    const resp = await chrome.runtime.sendMessage({ action: "getSelection" });
    if (resp && resp.ok && typeof resp.text === "string" && resp.text.trim()) {
      pendingSelection = resp.text.trim();
      showSelectionBar(pendingSelection.length);
    }
  } catch (e) {
    // background 暂时不可用或注入失败，按整页处理
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) {
      urlInput.value = tab.url;
    }
  } catch (e) {
    // 某些页面（如 chrome:// 内部页）无法读取，忽略即可
  }

  // 检查是否由快捷键触发（background 写入的 pendingCommand）
  let autoFmt = null;
  try {
    const stored = await chrome.storage.session.get("pendingCommand");
    if (stored.pendingCommand === "md" || stored.pendingCommand === "json") {
      autoFmt = stored.pendingCommand === "md" ? "markdown" : "json";
      // 用完即清，避免下次开弹窗又自动转
      await chrome.storage.session.remove("pendingCommand");
    }
  } catch (e) {
    // session storage 读取失败忽略
  }

  if (autoFmt) {
    // 快捷键触发：直接转换，不抢焦点
    convert(autoFmt);
  } else {
    urlInput.focus();
  }
})();

// ===================================================
// 2. 绑定转换按钮
// ===================================================
btnMarkdown.addEventListener("click", () => convert("markdown"));
btnJson.addEventListener("click", () => convert("json"));

// ===================================================
// 3. 绑定复制 / 下载
// ===================================================
btnCopy.addEventListener("click", copyResult);
btnDownload.addEventListener("click", downloadResult);

// ===================================================
// 核心转换函数（混合方案：先试远程服务，被反爬挡住则本地回退）
// ===================================================
async function convert(format) {
  // 若启动时读到了选中文本，优先只转选中部分
  if (pendingSelection) {
    convertSelection(pendingSelection, format);
    return;
  }

  const rawUrl = urlInput.value.trim();
  if (!rawUrl) {
    showError(i18n("err_empty_url"));
    return;
  }

  const targetUrl = normalizeUrl(rawUrl);
  if (!targetUrl) {
    showError(i18n("err_bad_url"));
    return;
  }

  setLoading(true);
  hideResult();

  try {
    // ---- 第一步：尝试远程服务 ----
    let remoteOK = false;
    let remoteText = "";     // markdown 文本
    let remoteTitle = "";    // 页面标题
    let remoteSourceUrl = targetUrl;

    try {
      const reqUrl = ENDPOINT + targetUrl;
      const headers = format === "json" ? { Accept: "application/json" } : {};
      const data = await fetchWithTimeout(reqUrl, { headers }, FETCH_TIMEOUT_MS);

      if (format === "json") {
        // 服务返回的 JSON 包裹
        if (data && data.code === 200 && data.data) {
          remoteText = data.data.content || "";
          remoteTitle = data.data.title || "";
          remoteSourceUrl = data.data.url || targetUrl;
          if (!isBlocked(remoteText, data)) remoteOK = true;
        }
      } else {
        // 服务返回的纯文本 markdown
        remoteText = typeof data === "string" ? data : "";
        if (!isBlocked(remoteText, null)) remoteOK = true;
      }
    } catch (remoteErr) {
      // 远程失败（403/429/网络）不直接报错，先尝试本地回退
      // 仅当远程明显是限速(429)时，跳过本地（本地不解决限速问题）
      if (remoteErr instanceof ConvError && remoteErr.code === 429) {
        throw remoteErr; // 限速就直接抛，不做本地回退
      }
      // 其它错误：静默进入本地回退
    }

    // ---- 第二步：远程不可用 → 本地回退 ----
    if (!remoteOK) {
      const local = await fallbackToLocal(targetUrl);
      remoteText = local.markdown;
      remoteTitle = local.title;
      remoteSourceUrl = targetUrl;
      current.source = "local";
    } else {
      current.source = "remote";
    }

    // ---- 第三步：组装最终内容 ----
    if (format === "json") {
      const payload = {
        title: remoteTitle || "",
        description: "",
        url: remoteSourceUrl,
        content: remoteText,
      };
      current.content = JSON.stringify(payload, null, 2);
      current.format = "json";
      current.filename = sanitizeFileName(remoteTitle) || hostnameOf(targetUrl) || "result";
      resultMeta.textContent = remoteSourceUrl;
    } else {
      current.content = remoteText;
      current.format = "markdown";
      current.filename = sanitizeFileName(remoteTitle) || hostnameOf(targetUrl) || "result";
      resultMeta.textContent = remoteSourceUrl;
    }

    renderResult();
    if (current.source === "local") {
      showLocal(i18n("status_local"));
    } else {
      showInfo(i18n("status_success"));
    }
  } catch (err) {
    handleError(err);
  } finally {
    setLoading(false);
  }
}

// ===================================================
// 选中文本转换：直接用用户选中的文本，不走远程/本地抓取
// ===================================================
function convertSelection(text, format) {
  if (!text || !text.trim()) {
    showError(i18n("err_no_selection"));
    // 清空 pendingSelection，下次点转换就走整页流程
    pendingSelection = "";
    hideSelectionBar();
    return;
  }

  setLoading(true);
  hideResult();
  hideSelectionBar();
  // 用完即清，避免下次开弹窗仍走选中分支
  pendingSelection = "";

  try {
    const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    if (format === "json") {
      const payload = {
        title: "",
        description: "",
        url: "",
        content: cleaned,
      };
      current.content = JSON.stringify(payload, null, 2);
      current.format = "json";
    } else {
      current.content = cleaned;
      current.format = "markdown";
    }
    current.filename = "selection";
    current.source = "selection";
    resultMeta.textContent = "";

    renderResult();
    showInfo(i18n("status_success"));
  } catch (err) {
    handleError(err);
  } finally {
    setLoading(false);
  }
}

// ===================================================
// 选中文本提示条
// ===================================================
function showSelectionBar(charCount) {
  const bar = document.getElementById("selectionBar");
  if (!bar) return;
  bar.textContent = i18n("selection_bar", [String(charCount)]);
  bar.classList.remove("hidden");
}

function hideSelectionBar() {
  const bar = document.getElementById("selectionBar");
  if (bar) bar.classList.add("hidden");
}

// ===================================================
// Token 估算：CJK 字符 ≈ 1 token；其它字符 ≈ 4 字符/token
// 经验值，接近 GPT 分词器，非精确值
// ===================================================
function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    // CJK 统一汉字、平假名/片假名、韩文音节
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x3400 && code <= 0x4dbf)
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk + other / 4);
}

// ===================================================
// 反爬检测：命中典型验证页特征即判定被挡
// ===================================================
function isBlocked(text, jsonObj) {
  const sample = (text || "").toLowerCase();
  // 典型反爬/验证页文案
  const signals = [
    "just a moment",
    "performing security verification",
    "attention required",          // Cloudflare 1006
    "enable javascript and cookies",
    "checking your browser",       // DDoS-GUARD
    "verify you are human",
    "captcha",
    "access denied",
  ];
  if (signals.some((s) => sample.includes(s))) return true;

  // JSON 模式下，warning 字段含 403 / captcha 也算
  if (jsonObj && jsonObj.warning && /403|captcha|forbidden/i.test(jsonObj.warning)) {
    return true;
  }
  // 内容过短且含验证相关词
  if (sample.length < 500 && sample.includes("security")) return true;
  return false;
}

// ===================================================
// 本地回退：通过 background worker 抓取目标页 HTML（绕过 CORS）→ turndown 转 markdown
// ===================================================
async function fallbackToLocal(targetUrl) {
  let html;
  try {
    // 通过 background service worker 抓取（扩展特权，不受 CORS 限制）
    const resp = await chrome.runtime.sendMessage({ action: "fetchPage", url: targetUrl });
    if (!resp || !resp.ok) {
      const detail = resp && resp.error ? resp.error : i18n("err_unknown");
      throw new ConvError(i18n("err_local_fetch", [detail]), (resp && resp.status) || 0);
    }
    html = resp.html || "";
  } catch (e) {
    // 本地也失败：抛出友好错误
    if (e instanceof ConvError) throw e;
    throw new ConvError(i18n("err_local_unreachable"), 0);
  }

  if (!html || !html.trim()) {
    throw new ConvError(i18n("err_empty_content"), 0);
  }

  // 解析标题
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = decodeEntities(titleMatch[1].trim());

  // 转 markdown
  if (typeof TurndownService === "undefined") {
    throw new ConvError(i18n("err_no_lib"), 0);
  }
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  // 去掉脚本/样式/nav/footer 等干扰内容
  td.remove(["script", "style", "noscript", "iframe", "svg", "nav", "footer", "header", "form"]);

  // 预处理 HTML：先剥离 script/style 等再喂给 turndown
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  let markdown;
  try {
    markdown = td.turndown(cleaned);
  } catch (e) {
    // turndown 解析失败，退化为纯文本
    markdown = stripTags(cleaned);
  }

  // 过渡清理：压掉连续空行
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

  // 再次自检：本地结果若仍是反爬页，明确报错
  if (isBlocked(markdown, null)) {
    throw new ConvError(i18n("err_blocked_local"), 0);
  }

  return { markdown, title };
}

// HTML 实体解码（简易版）
function decodeEntities(str) {
  if (!str) return "";
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

// 剥离所有 HTML 标签，退化为纯文本
function stripTags(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

// ===================================================
// 请求工具：带超时的 fetch，并按期望类型解析
// ===================================================
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });

    if (!res.ok) {
      // 常见：429 = 超出 IP 限速 20 RPM
      if (res.status === 429) {
        throw new ConvError(i18n("err_rate_limit"), 429);
      }
      throw new ConvError(i18n("err_http", [String(res.status)]), res.status);
    }

    // 根据 options 中的 Accept 判断如何解析
    if (options.headers && options.headers.Accept === "application/json") {
      return await res.json();
    }
    return await res.text();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ConvError(i18n("err_timeout"), 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ===================================================
// 渲染结果
// ===================================================
function renderResult() {
  resultTitle.textContent = current.format === "json" ? i18n("result_title_json") : i18n("result_title_md");
  result.textContent = current.content;
  resultWrapper.classList.remove("hidden");

  // 追加 token / 字数预估到元信息区（保留之前可能设置的源 URL）
  const tokens = estimateTokens(current.content || "");
  const chars = (current.content || "").length;
  const meta = i18n("result_meta", [String(tokens), String(chars)]);
  // 若已有源 URL（整页转换），用分隔符衔接；选中模式无 URL，只显示统计
  const existing = resultMeta.textContent;
  resultMeta.textContent = existing ? existing + " · " + meta : meta;
}

function hideResult() {
  resultWrapper.classList.add("hidden");
  result.textContent = "";
}

// ===================================================
// 复制
// ===================================================
async function copyResult() {
  if (!current.content) return;
  try {
    await navigator.clipboard.writeText(current.content);
    showInfo(i18n("status_copied"));
  } catch (c) {
    // 某些环境下 clipboard API 不可用，降级
    try {
      result.focus();
      const range = document.createRange();
      range.selectNodeContents(result);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("copy");
      sel.removeAllRanges();
      showInfo(i18n("status_copied"));
    } catch (c2) {
      showError(i18n("err_copy_failed"));
    }
  }
}

// ===================================================
// 下载
// ===================================================
function downloadResult() {
  if (!current.content) return;
  const ext = current.format === "json" ? "json" : "md";
  const filename = `${current.filename}.${ext}`;

  const blob = new Blob([current.content], {
    type: current.format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);

  chrome.downloads.download(
    { url: objectUrl, filename, saveAs: true },
    (downloadId) => {
      // 下载发起后释放对象 URL
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      if (chrome.runtime.lastError || downloadId === undefined) {
        showError(i18n("err_download_failed", [chrome.runtime.lastError?.message || i18n("err_unknown")]));
      } else {
        showInfo(i18n("status_download_started", [filename]));
      }
    }
  );
}

// ===================================================
// 状态提示
// ===================================================
function setLoading(isLoading) {
  [btnMarkdown, btnJson].forEach((b) => (b.disabled = isLoading));
  if (isLoading) {
    statusBox.className = "status-box status-info";
    statusBox.innerHTML =
      '<span class="spinner"></span><span>' + i18n("status_loading") + "</span>";
    statusBox.classList.remove("hidden");
  }
}

function showInfo(msg) {
  statusBox.className = "status-box status-success";
  statusBox.textContent = msg;
  statusBox.classList.remove("hidden");
}

function showLocal(msg) {
  statusBox.className = "status-box status-local";
  statusBox.textContent = msg;
  statusBox.classList.remove("hidden");
}

function showError(msg) {
  statusBox.className = "status-box status-error";
  statusBox.textContent = msg;
  statusBox.classList.remove("hidden");
}

function handleError(err) {
  if (err instanceof ConvError) {
    showError(err.message);
  } else if (err instanceof TypeError && /Failed to fetch|NetworkError/i.test(err.message)) {
    showError(i18n("err_no_service"));
  } else {
    showError(i18n("err_generic", [(err && err.message) ? err.message : String(err)]));
  }
}

// ===================================================
// 辅助函数
// ===================================================
class ConvError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ConvError";
    this.code = code;
  }
}

// 规范化 URL：补全协议、校验
function normalizeUrl(input) {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) {
    u = "https://" + u;
  }
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes(".")) return null; // 至少要有点号域名
    return parsed.href;
  } catch (e) {
    return null;
  }
}

// 从 URL 取主机名做文件名兜底
function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return null;
  }
}

// 清理 Windows / macOS 非法文件名字符，裁剪长度
function sanitizeFileName(name) {
  if (!name) return null;
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || null;
}
