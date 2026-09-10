// src/shared/palettes.js
// 40 classic-theme palettes (ADR-0002): 26 overlay palettes (9 colors each)
// and 14 invert palettes (filter params). All values are original designs —
// night-sky inspired names and hue families. Compact tuples keep the data
// scannable; overlay() expands them.

const overlay = (id, label, tuple) => {
  if (tuple.length !== 9) throw new Error(`overlay ${id}: expected 9 colors, got ${tuple.length}`);
  const [bg, surface, fg, muted, link, visited, cite, inputBg, border] = tuple;
  return {
    id, family: 'overlay', label,
    colors: { bg, surface, fg, muted, link, visited, cite, inputBg, border },
  };
};

const invert = (id, label, tuple) => {
  if (tuple.length !== 3) throw new Error(`invert ${id}: expected 3 params, got ${tuple.length}`);
  const [brightness, contrast, grayscale] = tuple;
  return {
    id, family: 'invert', label,
    params: { brightness, contrast, grayscale },
  };
};

export const PALETTES = [
  // ---- 26 overlay palettes ----
  overlay('nv-simple',   'Evening',      ['#1e2229', '#262b33', '#e8e6e0', '#a8a49c', '#7fabec', '#d293c8', '#82d4a4', '#2b303a', '#3a4049']),
  overlay('nv-midnight', 'Midnight',     ['#12141d', '#181b26', '#dfe3ee', '#9aa0b5', '#8ea2d8', '#b48ecf', '#8fd4b0', '#171a24', '#2c3040']),
  overlay('nv-pitch',    'Pitch',        ['#0a0a0b', '#101012', '#e6e6e6', '#9c9c9c', '#9aa8ff', '#c9a0e8', '#8fd8a8', '#101013', '#2a2a2e']),
  overlay('nv-amoled',   'AMOLED',       ['#000000', '#0c0c0c', '#f0f0f0', '#a6a6a6', '#88aaff', '#cf9de0', '#90e0a8', '#0d0d0d', '#262626']),
  overlay('nv-graphite', 'Graphite',     ['#232323', '#2b2b2b', '#e9e7e2', '#a9a49d', '#9cb8e6', '#c88fdd', '#97d9a5', '#2e2e2e', '#404040']),
  overlay('nv-slate',    'Slate',        ['#1f2428', '#282e33', '#e5e9ec', '#a3abb1', '#8fb6e8', '#c390d8', '#8fd6b2', '#293036', '#3c444b']),
  overlay('nv-storm',    'Storm',        ['#1a1e24', '#22272f', '#e4e7ec', '#9fa7b3', '#84aee0', '#bb8bd4', '#87cfa8', '#242a33', '#37404a']),
  overlay('nv-navy',     'Navy',         ['#131a26', '#1a2331', '#e2e8f2', '#98a6bb', '#89a9e8', '#b48ed6', '#8ad2b4', '#182130', '#2b3a4d']),
  overlay('nv-steel',    'Steel',        ['#252a2f', '#2e343a', '#e8ebef', '#a8aeb5', '#94b4e4', '#c493da', '#93d8ac', '#333940', '#454c54']),
  overlay('nv-ice',      'Ice',          ['#1d2733', '#25303e', '#e8f0f8', '#a4b3c4', '#8fc0f0', '#c0a2e4', '#8fdcc2', '#232f3e', '#35455a']),
  overlay('nv-glacier',  'Glacier',      ['#18222c', '#202c38', '#e6eef6', '#9fb0c0', '#86b8ea', '#b99ade', '#85d4ba', '#1e2a37', '#304254']),
  overlay('nv-frost',    'Frost',        ['#20242c', '#282e38', '#eaeef4', '#a8b0be', '#9cc2ec', '#c8a2e0', '#9adec2', '#2a313d', '#3e4654']),
  overlay('nv-coffee',   'Coffee',       ['#211a14', '#2b231b', '#ede4d8', '#b0a391', '#d9a86c', '#d68cc0', '#a8d9a0', '#2f261e', '#42362a']),
  overlay('nv-mocha',    'Mocha',        ['#251d18', '#2f2620', '#efe6dd', '#b3a596', '#e0b078', '#db98c8', '#b0dcaa', '#332a23', '#463a30']),
  overlay('nv-ember',    'Ember',        ['#241816', '#2e201d', '#f0e4dc', '#b29d93', '#f0a074', '#d890c4', '#a8dca4', '#332421', '#47322c']),
  overlay('nv-amber',    'Amber',        ['#231c10', '#2d2416', '#f2e9d4', '#b5a884', '#f0b860', '#d898c8', '#b0dc9a', '#312818', '#453822']),
  overlay('nv-honey',    'Honey',        ['#26200f', '#302914', '#f4ecd2', '#b7ab86', '#f0c868', '#dc9ecb', '#b4e0a0', '#352c17', '#4a3f20']),
  overlay('nv-twilight', 'Twilight',     ['#191627', '#201c31', '#e9e5f4', '#a49ec0', '#98a8f0', '#c89ade', '#92d4c2', '#1e1a30', '#312a4a']),
  overlay('nv-dusk',     'Dusk',         ['#1e1723', '#271e2d', '#ece3f0', '#ada0b7', '#a898e4', '#d094d8', '#a0d4bc', '#261d30', '#3a2c44']),
  overlay('nv-owl',      'Owl',          ['#1b2016', '#242a1d', '#e9eee0', '#a8b09a', '#b8d078', '#cb9ad0', '#9ad8a8', '#252c1f', '#37402c']),
  overlay('nv-fern',     'Fern',         ['#141f18', '#1a281f', '#e2eee6', '#97b0a1', '#7cc898', '#b28fd6', '#7fd8b8', '#192820', '#273c30']),
  overlay('nv-moss',     'Moss',         ['#1a201a', '#232b23', '#e6ece4', '#a2b0a4', '#8cc88e', '#bb96d2', '#8cd4b0', '#222c23', '#334032']),
  overlay('nv-tidal',    'Tidal',        ['#122028', '#182b35', '#e0eef4', '#93aebc', '#70c0d8', '#aa9cd8', '#78d0c0', '#172a34', '#22404e']),
  overlay('nv-lagoon',   'Lagoon',       ['#10241e', '#16302a', '#e0f0ea', '#92b0a7', '#6cc4a8', '#a898d4', '#74d0bc', '#152e27', '#1f443a']),
  overlay('nv-violet',   'Violet',       ['#1d1626', '#261d31', '#eae2f2', '#ab9ec0', '#b090ec', '#e09ade', '#a0d4c4', '#251c33', '#392b4c']),
  overlay('nv-rose',     'Rose',         ['#241618', '#2e1d1f', '#f2e4e6', '#b59da1', '#ec9ab0', '#d894dc', '#b0dca4', '#322023', '#483034']),
  // ---- 14 invert palettes ----
  invert('nv-inv-soft',       'Invert Soft',       [95, 95, 0]),
  invert('nv-inv-soft-plus',  'Invert Soft Plus',  [100, 100, 0]),
  invert('nv-inv-balanced',   'Invert Balanced',   [105, 105, 0]),
  invert('nv-inv-balanced-plus', 'Invert Balanced Plus', [110, 110, 0]),
  invert('nv-inv-strong',     'Invert Strong',     [115, 115, 0]),
  invert('nv-inv-strong-plus', 'Invert Strong Plus', [120, 120, 0]),
  invert('nv-inv-crisp',      'Invert Crisp',      [100, 130, 0]),
  invert('nv-inv-deep',       'Invert Deep',       [85, 105, 0]),
  invert('nv-inv-warm',       'Invert Warm',       [105, 100, 10]),
  invert('nv-inv-cool',       'Invert Cool',       [100, 110, 5]),
  invert('nv-inv-mono',       'Invert Mono',       [100, 105, 100]),
  invert('nv-inv-mono-soft',  'Invert Mono Soft',  [92, 95, 100]),
  invert('nv-inv-mono-strong', 'Invert Mono Strong', [112, 125, 100]),
  invert('nv-inv-ultra',      'Invert Ultra',      [125, 125, 0]),
];

export function findPalette(id) {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
