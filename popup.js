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
  source: null,        // "remote" | "local" —— 标记结果来源
};

// ===== 常量 =====
// Jina AI Reader API 端点（明文，便于商店审核透明化）
const ENDPOINT = "https://r.jina.ai/";
const FETCH_TIMEOUT_MS = 30000;

// ===================================================
// 1. 打开弹窗时自动填入当前标签页网址
// ===================================================
(async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) {
      urlInput.value = tab.url;
    }
  } catch (e) {
    // 某些页面（如 chrome:// 内部页）无法读取，忽略即可
  }
  urlInput.focus();
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
  const rawUrl = urlInput.value.trim();
  if (!rawUrl) {
    showError("请先输入或粘贴一个网址");
    return;
  }

  const targetUrl = normalizeUrl(rawUrl);
  if (!targetUrl) {
    showError("网址格式不正确，请以 http:// 或 https:// 开头");
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
      showLocal("转换完成（本地模式：远程被反爬挡住，已用浏览器本地抓取）");
    } else {
      showInfo("转换完成 ✓");
    }
  } catch (err) {
    handleError(err);
  } finally {
    setLoading(false);
  }
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
      const detail = resp && resp.error ? resp.error : "未知错误";
      throw new ConvError("本地抓取失败：" + detail, (resp && resp.status) || 0);
    }
    html = resp.html || "";
  } catch (e) {
    // 本地也失败：抛出友好错误
    if (e instanceof ConvError) throw e;
    throw new ConvError("该页面本地也无法抓取（可能需要登录或被反爬）", 0);
  }

  if (!html || !html.trim()) {
    throw new ConvError("抓取到的页面内容为空", 0);
  }

  // 解析标题
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = decodeEntities(titleMatch[1].trim());

  // 转 markdown
  if (typeof TurndownService === "undefined") {
    throw new ConvError("本地转换库未加载", 0);
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
    throw new ConvError("该页面开了反爬验证（如 Cloudflare），本地也无法获取正文", 0);
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
        throw new ConvError("请求过于频繁，免费 IP 限速 20 次/分钟，请稍候再试", 429);
      }
      throw new ConvError(`网络错误：HTTP ${res.status}`, res.status);
    }

    // 根据 options 中的 Accept 判断如何解析
    if (options.headers && options.headers.Accept === "application/json") {
      return await res.json();
    }
    return await res.text();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ConvError("请求超时（30 秒），请检查网络或稍后再试", 0);
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
  resultTitle.textContent = current.format === "json" ? "JSON 结果" : "Markdown 结果";
  result.textContent = current.content;
  resultWrapper.classList.remove("hidden");
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
    showInfo("已复制到剪贴板 ✓");
  } catch (e) {
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
      showInfo("已复制到剪贴板 ✓");
    } catch (e2) {
      showError("复制失败，请手动选中结果复制");
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
        showError("下载失败：" + (chrome.runtime.lastError?.message || "未知错误"));
      } else {
        showInfo("已开始下载：" + filename);
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
    statusBox.innerHTML = '<span class="spinner"></span><span>正在转换，请稍候…</span>';
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
    showError("无法连接转换服务，请检查网络后重试");
  } else {
    showError("转换失败：" + (err && err.message ? err.message : String(err)));
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
