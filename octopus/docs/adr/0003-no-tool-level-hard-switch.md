# v1 不设工具级硬开关

工具自身的总开关(veil 的 Global State、pace 的总开关)即启停语义,octopus 不再叠加「禁用某工具」层。content script 照常注入、总开关关闭时早退;重 observer(MutationObserver、Flash Guard 等)一律以总开关为闸门,关闭即零挂载。

两层开关(「关掉暗色」vs「禁用暗色工具」)是认知陷阱,且没有任何真实用户反馈要求硬禁用;若未来出现性能/隐私抱怨,用 `scripting.registerContentScripts` 动态注册补做硬禁用,不影响现有结构——该回退路径记入 BACKLOG。
