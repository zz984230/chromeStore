// src/tools/diff/background/main.js — open-diff 命令:新标签页打开工作页(ADR-0005)
export function wireBackground({
  commands = globalThis.chrome?.commands,
  tabsApi = globalThis.chrome?.tabs,
  runtime = globalThis.chrome?.runtime,
} = {}) {
  if (!commands?.onCommand || !tabsApi?.create || !runtime?.getURL) return;
  commands.onCommand.addListener((id) => {
    if (id !== 'open-diff') return;
    tabsApi.create({ url: runtime.getURL('diff.html') });
  });
}

wireBackground();
