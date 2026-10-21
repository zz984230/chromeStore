// src/tools/registry.js — 工具注册表:新增工具 = 加目录 + 这里一行(ADR-0002)
import { tool as veilTool } from './veil/tool.js';
import { tool as paceTool } from './pace/tool.js';
import { tool as diffTool } from './diff/tool.js';

export const TOOLS = [veilTool, paceTool, diffTool];
export const toolById = (id) => TOOLS.find((t) => t.id === id) ?? null;
