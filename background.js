// Background service worker
// 唯一职责：用扩展特权 fetch 目标网页（绕过 popup 环境的 CORS 限制）
// 解析、转 markdown 等仍在 popup.js 完成（service worker 无 DOM）

const FETCH_TIMEOUT_MS = 30000;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "fetchPage" && typeof msg.url === "string") {
    fetchPage(msg.url)
      .then((html) => sendResponse({ ok: true, html }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
          status: err && err.status,
        })
      );
    // 关键：返回 true 表示异步 sendResponse
    return true;
  }

  // 读取当前标签页的选中文本（用 chrome.scripting 注入）
  if (msg && msg.action === "getSelection") {
    getSelectionText()
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
          text: "",
        })
      );
    return true;
  }

  // 未识别的消息：不处理
  return false;
});

// ===================================================
// 快捷键命令：打开弹窗并标记意图（md / json）
// ===================================================
chrome.commands.onCommand.addListener((command) => {
  let fmt = null;
  if (command === "convert-md") fmt = "md";
  else if (command === "convert-json") fmt = "json";
  if (!fmt) return;

  // 用 session storage 把意图传给 popup（弹窗一打开就读）
  chrome.storage.session
    .set({ pendingCommand: fmt })
    .then(() => {
      // 打开扩展弹窗（Chrome 127+ 支持；旧版本会静默失败，快捷键退化为无反应）
      if (chrome.action && typeof chrome.action.openPopup === "function") {
        chrome.action.openPopup(() => {
          if (chrome.runtime.lastError) {
            // openPopup 失败（如旧版本、或弹窗已被其他方式触发），忽略
          }
        });
      }
    })
    .catch(() => {
      // session storage 失败时不影响主流程
    });
});

// 读取当前活动标签页里的选中文本
async function getSelectionText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") return "";
  // 受限页面（chrome:// 等）无法注入，直接返回空
  if (!/^https?:/i.test(tab.url || "")) return "";

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const sel = window.getSelection && window.getSelection();
      return sel ? sel.toString() : "";
    },
  });
  if (Array.isArray(results) && results.length > 0) {
    return (results[0].result || "").trim();
  }
  return "";
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // 模拟普通浏览器请求头，提高抓取成功率
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    // 优先按响应头声明的编码读，兜底 utf-8
    const ct = res.headers.get("content-type") || "";
    let buffer;
    try {
      buffer = await res.arrayBuffer();
    } catch (e) {
      buffer = null;
    }
    if (buffer == null) {
      return "";
    }

    // 探测编码：content-type charset > meta charset > 默认 utf-8
    let charset = extractCharset(ct);
    if (!charset) {
      // 先按 utf-8 预读一小段找 meta charset
      const head = new TextDecoder("utf-8").decode(buffer.slice(0, 2048));
      charset = extractCharset(head) || "utf-8";
    }
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch (e) {
      return new TextDecoder("utf-8").decode(buffer);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("本地抓取超时（30 秒）");
      e.status = 0;
      throw e;
    }
    // TypeError: Failed to fetch —— 多为目标站 CSP/网络问题
    if (err instanceof TypeError) {
      const e = new Error("本地抓取失败：网络错误或被目标站拒绝");
      e.status = 0;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 从 "text/html; charset=gbk" 或 HTML meta 标签里提取编码
function extractCharset(str) {
  if (!str) return null;
  const m1 = str.match(/charset\s*=\s*["']?\s*([a-zA-Z0-9_-]+)/i);
  if (m1) return normalizeCharset(m1[1]);
  const m2 = str.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9_-]+)/i);
  if (m2) return normalizeCharset(m2[1]);
  return null;
}

function normalizeCharset(cs) {
  const c = cs.trim().toLowerCase();
  if (c === "gb2312") return "gbk";
  return c;
}
