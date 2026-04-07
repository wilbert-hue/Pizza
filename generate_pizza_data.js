// Convert Dataset-Global Pizza Market.xlsx into public/data/value.json + volume.json
// Also injects an "Italy Cross-Segment Analysis" segment type for Italy only.

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const WB = XLSX.readFile(path.join(__dirname, 'Dataset-Global Pizza Market.xlsx'));
const YEARS = Array.from({ length: 13 }, (_, i) => 2021 + i); // 2021..2033

function round(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ---------- Master Sheet ----------
const master = XLSX.utils.sheet_to_json(WB.Sheets['Master Sheet'], { header: 1, blankrows: false });
const value = {};
const volume = {};
let mode = null; // 'value' | 'volume'

for (let i = 0; i < master.length; i++) {
  const row = master[i];
  if (!row || row.length === 0) continue;
  const c0 = row[0];
  const c1 = row[1];
  if (c0 === 'Value' || c1 === 'Value') { mode = 'value'; continue; }
  if (c0 === 'Volume' || c1 === 'Volume') { mode = 'volume'; continue; }
  if (!mode) continue;
  if (c0 === 'Region' || c0 === 'Unit') continue;
  // Stop when we hit the trailing Italy cross-section block (4-col key form)
  if (c0 === 'Value' || c0 === 'Volume') continue;
  const region = row[0];
  const segment = row[1];
  const sub = row[2];
  if (!region || !segment || !sub) continue;
  const target = mode === 'value' ? value : volume;
  if (!target[region]) target[region] = {};
  if (!target[region][segment]) target[region][segment] = {};
  const series = {};
  for (let y = 0; y < YEARS.length; y++) {
    const v = row[3 + y];
    series[String(YEARS[y])] = round(typeof v === 'number' ? v : 0);
  }
  target[region][segment][sub] = series;
}

// ---------- Italy Cross Section Analysis ----------
const cross = XLSX.utils.sheet_to_json(WB.Sheets['Italy Cross Section Analysis'], { header: 1, blankrows: false });
const BASES = new Set(['Ready to Eat Bases', 'Made From Scratch']);
const CHANNELS = new Set([
  'Bars/Hotels',
  'Full-Service Restaurants (FSR)',
  'Others ( (Institutional Food Service, etc.)',
  'Pizzeria',
  'Quick Service Restaurants (QSR)',
  'Retail',
]);

const CROSS_SEG = 'Italy Cross-Segment Analysis';
let cMode = null, cBase = null, cChannel = null;

for (let i = 0; i < cross.length; i++) {
  const row = cross[i];
  if (!row || row.length === 0) continue;
  const label = row[0];
  if (label === 'Value') { cMode = 'value'; cBase = null; cChannel = null; continue; }
  if (label === 'Volume') { cMode = 'volume'; cBase = null; cChannel = null; continue; }
  if (!cMode) continue;
  if (BASES.has(label)) { cBase = label; continue; }
  if (CHANNELS.has(label)) { cChannel = label; continue; }
  if (!cBase || !cChannel) continue;
  // Hierarchical with context-prefixed node names so each level is unique.
  // (Otherwise the dashboard would sum same-named children across bases.)
  const channelKey = `${cBase} · ${cChannel}`;
  const leafKey = `${cBase} · ${cChannel} · ${label}`;
  const target = cMode === 'value' ? value : volume;
  if (!target['Italy']) target['Italy'] = {};
  if (!target['Italy'][CROSS_SEG]) target['Italy'][CROSS_SEG] = {};
  if (!target['Italy'][CROSS_SEG][cBase]) target['Italy'][CROSS_SEG][cBase] = {};
  if (!target['Italy'][CROSS_SEG][cBase][channelKey]) target['Italy'][CROSS_SEG][cBase][channelKey] = {};
  const series = {};
  for (let y = 0; y < YEARS.length; y++) {
    const v = row[1 + y];
    series[String(YEARS[y])] = round(typeof v === 'number' ? v : 0);
  }
  target['Italy'][CROSS_SEG][cBase][channelKey][leafKey] = series;
}

// Add aggregated parent records (with _aggregated/_level markers) so the
// dashboard shows the channel/base totals when a parent is selected, without
// double-counting children (the data-processor explicitly excludes child leaves
// when the aggregated parent record is also included).
function sumSeries(seriesList) {
  const out = {};
  for (const y of YEARS) {
    let s = 0;
    for (const ser of seriesList) s += Number(ser?.[String(y)]) || 0;
    out[String(y)] = round(s);
  }
  return out;
}
for (const target of [value, volume]) {
  const cs = target?.['Italy']?.[CROSS_SEG];
  if (!cs) continue;
  for (const base of Object.keys(cs)) {
    const baseNode = cs[base];
    const baseChannelTotals = [];
    for (const chKey of Object.keys(baseNode)) {
      const chNode = baseNode[chKey];
      const ptSeriesList = Object.values(chNode);
      const channelTotal = sumSeries(ptSeriesList);
      // mark this channel node as an aggregated parent (level 3)
      Object.assign(chNode, channelTotal);
      chNode._aggregated = true;
      chNode._level = 3;
      baseChannelTotals.push(channelTotal);
    }
    // mark this base node as an aggregated parent (level 2)
    const baseTotal = sumSeries(baseChannelTotals);
    Object.assign(baseNode, baseTotal);
    baseNode._aggregated = true;
    baseNode._level = 2;
  }
}
// Note: don't add self-referencing leaves — the dashboard sums descendants
// when a parent is selected, so adding parent leaves causes double counting.


// ---------- Build geography hierarchy under "By Region" ----------
// The dashboard's processor expects nested structure:
//   Global['By Region'][region][country] = { 2021: n, ... }
// so it can extract regions + countries as additional geographies.
const REGION_COUNTRIES = {
  'North America': ['U.S.', 'Canada'],
  'Europe': ['Norway', 'UK', 'Germany', 'Romania', 'Italy', 'France', 'Spain', 'Russia', 'Switzerland', 'Sweden', 'Finland', 'Rest of Europe'],
  'Asia Pacific': ['China', 'India', 'Japan', 'South Korea', 'ASEAN', 'Australia', 'New Zealand', 'Rest of Asia Pacific'],
  'Latin America': ['Brazil', 'Argentina', 'Mexico', 'Rest of Latin America'],
  'Middle East': ['GCC Countries', 'Rest of Middle East'],
  'Africa': ['North Africa', 'South Africa', 'Central Africa'],
};

function pizzaTypeTotal(target, geo) {
  // Sum of Pizza Type sub-segments per year = total geography series
  const seg = target?.[geo]?.['Pizza Type'];
  if (!seg) return null;
  const out = {};
  for (const y of YEARS) {
    let s = 0;
    for (const sub of Object.keys(seg)) s += Number(seg[sub][String(y)]) || 0;
    out[String(y)] = round(s);
  }
  return out;
}

function buildByRegion(target) {
  // Rebuild Global -> By Region -> region -> country = totals
  if (!target['Global']) return;
  target['Global']['By Region'] = {};
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    const node = {};
    // region-level total (under same name, matches processor's "redundant" pattern)
    const regionTotal = pizzaTypeTotal(target, region);
    if (regionTotal) node[region] = regionTotal;
    for (const c of countries) {
      const ct = pizzaTypeTotal(target, c);
      if (ct) node[c] = ct;
    }
    target['Global']['By Region'][region] = node;
  }
  // Also expose By Region inside each parent region so country drilldown works
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    if (!target[region]) continue;
    target[region]['By Region'] = { [region]: {} };
    for (const c of countries) {
      const ct = pizzaTypeTotal(target, c);
      if (ct) target[region]['By Region'][region][c] = ct;
    }
  }
}

buildByRegion(value);
buildByRegion(volume);

const outDir = path.join(__dirname, 'public', 'data');
fs.writeFileSync(path.join(outDir, 'value.json'), JSON.stringify(value));
fs.writeFileSync(path.join(outDir, 'volume.json'), JSON.stringify(volume));

// Use the full value structure as segmentation_analysis so the processor can
// extract the geography hierarchy (regions/countries under By Region).
fs.writeFileSync(path.join(outDir, 'segmentation_analysis.json'), JSON.stringify(value));

console.log('Regions:', Object.keys(value).length);
console.log('Italy segs:', Object.keys(value['Italy'] || {}));
console.log('Italy cross sub count:', Object.keys((value['Italy'] || {})[CROSS_SEG] || {}).length);
