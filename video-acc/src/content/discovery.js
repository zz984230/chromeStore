// src/content/discovery.js — 视频发现：DOM 变更即收 + 周期兜底扫描（全 DI 可测）
export function startDiscovery({
  doc,
  onFound,
  isKept,
  pollMs = 1200,
  MutationObserver: MO = globalThis.MutationObserver,
  setInterval: timer = globalThis.setInterval,
} = {}) {
  const sweep = () => {
    for (const v of doc.querySelectorAll('video')) {
      if (!isKept(v)) onFound(v);
    }
  };
  const harvest = (node) => {
    if (node.nodeType !== 1) return; // 只看元素节点
    if (node.tagName === 'VIDEO') {
      if (!isKept(node)) onFound(node);
      return;
    }
    if (typeof node.querySelectorAll === 'function') {
      for (const v of node.querySelectorAll('video')) {
        if (!isKept(v)) onFound(v);
      }
    }
  };
  const mo = new MO((mutations) => {
    for (const m of mutations) for (const n of m.addedNodes) harvest(n);
  });
  mo.observe(doc.documentElement || doc, { childList: true, subtree: true });
  sweep(); // 启动即全量
  const pollId = timer(sweep, pollMs);
  return {
    stop() {
      mo.disconnect();
      if (typeof clearInterval === 'function') clearInterval(pollId);
    },
  };
}
