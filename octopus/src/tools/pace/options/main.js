// src/tools/pace/options/main.js — 倍速翼:七字段完整态(弹窗为快调子集,同键互写)
import { loadSettings, saveSettings } from '../shared/store.js';
import { PRESETS, clampPace, samePace, stepSkip } from '../shared/paceMath.js';
import { PACE_STRINGS as S } from '../shared/strings.js';

const fmt = (v) => `${Number(v).toFixed(2).replace(/\.?0+$/, '')}×`;
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.flat());
  return n;
};

// 滑杆 --fill 百分比(veil 翼同款;轨道金/灰分界随值走)
function fillSlider(input) {
  const p = (input.value - input.min) / (input.max - input.min) * 100;
  input.style.setProperty('--fill', `${p}%`);
}

export function initPaceOptions(host = document.getElementById('opt-pace')) {
  if (!host) return; // 预览/测试环境无宿主,静默
  loadSettings().then((s) => render(host, s));
}

function section(parent, title, note) {
  const sec = el('section', { class: 'opt-sec' });
  sec.append(el('div', { class: 'sec-head' }, el('h4', {}, title), note ? el('span', { class: 'note' }, note) : []));
  parent.append(sec);
  return sec;
}

function render(host, s) {
  host.replaceChildren();
  host.append(el('div', { class: 'page-head' },
    el('div', {}, el('h2', {}, S.optionsHeading), el('p', {}, S.optionsIntro)),
    el('button', {
      class: 'reset', type: 'button',
      onclick: async () => {
        await saveSettings({ pace: 1, hold: false, heldPace: 1, introSkip: 0, outroSkip: 0, skipOn: false, autoAdvance: false });
        render(host, await loadSettings());
      },
    }, S.optionsReset)));

  // 档位
  const dialSec = section(host, S.dialTitle, S.dialNote);
  const out = el('output', {}, fmt(s.pace));
  const dial = el('input', { type: 'range', min: '0.07', max: '16', step: '0.05', value: String(s.pace), 'aria-label': S.dialLabel });
  fillSlider(dial);
  dial.addEventListener('input', () => { out.textContent = fmt(dial.value); fillSlider(dial); });
  dial.addEventListener('change', () => saveSettings({ pace: clampPace(Number(dial.value)) }));
  dialSec.append(el('div', { class: 'row' }, el('span', { class: 'row-label' }, S.dialLabel), dial, out));
  const pills = PRESETS.map((p) => el('button', {
    class: 'pill' + (samePace(p, s.pace) ? ' on' : ''), type: 'button',
    onclick: async () => { await saveSettings({ pace: p }); render(host, await loadSettings()); },
  }, fmt(p)));
  dialSec.append(el('div', { class: 'presets' }, el('span', { class: 'pill-label', style: 'border:0;background:none;color:var(--ink-3);cursor:default;padding-left:0' }, S.presetsLabel), ...pills));

  // 保持
  const holdSec = section(host, S.holdTitle, S.holdNote);
  const holdLine = el('span', { style: 'color:var(--ink-2)' }, s.hold ? S.holdOnLine.replace('{pace}', fmt(s.heldPace)) : S.holdOffLine);
  holdSec.append(switchRow(S.holdLabel, s.hold, async (on) => {
    await saveSettings({ hold: on });
    holdLine.textContent = on ? S.holdOnLine.replace('{pace}', fmt((await loadSettings()).heldPace)) : S.holdOffLine;
  }, holdLine));

  // 片头片尾
  const skipSec = section(host, S.skipTitle, S.skipNote);
  skipSec.append(switchRow(S.skipSwitchLabel, s.skipOn, (on) => saveSettings({ skipOn: on })));
  skipSec.append(stepperRow([
    [S.skipIntroLabel, s.introSkip, (v) => saveSettings({ introSkip: v })],
    [S.skipOutroLabel, s.outroSkip, (v) => saveSettings({ outroSkip: v })],
  ]));
  skipSec.append(el('p', { class: 'hint' }, S.skipStepNote));

  // 续播
  const advSec = section(host, S.advanceTitle, S.advanceNote);
  advSec.append(switchRow(S.advanceLabel, s.autoAdvance, (on) => saveSettings({ autoAdvance: on })));
  advSec.append(el('p', { class: 'hint' }, S.advanceHint));

  host.append(el('div', { class: 'go-hint' }, S.shortcutHint));
}

function switchRow(label, checked, onToggle, ...tail) {
  const input = el('input', { type: 'checkbox' }); input.checked = checked;
  const sw = el('span', { class: 'inline-switch' }, input, el('span', { class: 'track' }), el('span', { class: 'knob' }));
  if (checked) sw.classList.add('is-on');
  input.addEventListener('change', () => { sw.classList.toggle('is-on', input.checked); onToggle(input.checked); });
  return el('div', { class: 'row' }, el('span', { class: 'row-label' }, label), sw, ...tail);
}

// 步进器:闭包持当前值,stepSkip 纯函数算下一拍,持久化成功后回写显示
function stepperRow(pairs) {
  const kids = [];
  for (const [label, value, onStep] of pairs) {
    let v = stepSkip(value, 0); // 入界归整(负值/非整数回正)
    const out = el('output', {}, `${v} ${S.skipUnit}`);
    const step = async (d) => {
      v = stepSkip(v, d);
      await onStep(v);
      out.textContent = `${v} ${S.skipUnit}`;
    };
    kids.push(el('span', { class: 'row-label', style: 'width:auto' }, label),
      el('span', { class: 'stepper' }, el('button', { type: 'button', onclick: () => step(-5) }, '−'), out, el('button', { type: 'button', onclick: () => step(5) }, '＋')));
  }
  return el('div', { class: 'row' }, ...kids);
}
