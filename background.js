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
  // 未识别的消息：不处理
  return false;
});

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
