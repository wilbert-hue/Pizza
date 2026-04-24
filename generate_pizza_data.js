// Convert Dataset-Global Pizza Base Market.xlsx into public/data/value.json + volume.json
// Injects "Cross-Segment Analysis" for every country that has cross data in the workbook.

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const WB = XLSX.readFile(path.join(__dirname, 'Dataset-Global Pizza Base Market.xlsx'));
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
  if (c0 === 'Region' || c0 === 'Unit' || c0 === 'Country') continue;
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

// ---------- Cross-Section Sheets (Value + Volume) ----------
// Structure per sheet:
//   <Geo>         (row with null col1 — geography header)
//   <Base>        (Ready to Eat Bases | Made From Scratch, null col1)
//   <Channel>     (row with year values in col1+)
//   <Pizza Type>  (row with year values in col1+, child of Channel)

const BASES = new Set(['Ready to Eat Bases', 'Made From Scratch']);
const PIZZA_TYPES = new Set([
  'Traditional Round Pizza', 'Pizza Romana', 'Pinsa',
  'Other Regional / Specialty Pizza Styles',
]);
const CROSS_SEG_NAME = 'Cross-Segment Analysis';

function parseCrossSheet(sheetName, dataTarget) {
  const rows = XLSX.utils.sheet_to_json(WB.Sheets[sheetName], { header: 1, blankrows: false });
  let curGeo = null, curBase = null, curChannel = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const label = row[0];
    const col1 = row[1];

    // Skip title row
    if (typeof label === 'string' && label.includes('Cross Section')) continue;
    // Skip header row
    if (label === 'Row Labels') continue;

    if (BASES.has(label)) {
      curBase = label; curChannel = null; continue;
    }

    // Geography header: string in col0, null/undefined in col1, not a known type
    if (typeof label === 'string' && (col1 == null) && !BASES.has(label) && !PIZZA_TYPES.has(label)) {
      curGeo = label; curBase = null; curChannel = null; continue;
    }

    if (!curGeo || !curBase) continue;

    // Channel row: has year values, not a pizza type
    if (typeof label === 'string' && typeof col1 === 'number' && !PIZZA_TYPES.has(label)) {
      curChannel = label;
      // Channel row itself IS the channel total (no nested pizza types in channel row)
      // We still record it below if no pizza-type child follows; handled per-leaf below.
      continue;
    }

    // Pizza Type leaf
    if (PIZZA_TYPES.has(label) && curChannel) {
      const channelKey = `${curBase} · ${curChannel}`;
      const leafKey = `${curBase} · ${curChannel} · ${label}`;
      if (!dataTarget[curGeo]) dataTarget[curGeo] = {};
      if (!dataTarget[curGeo][CROSS_SEG_NAME]) dataTarget[curGeo][CROSS_SEG_NAME] = {};
      if (!dataTarget[curGeo][CROSS_SEG_NAME][curBase]) dataTarget[curGeo][CROSS_SEG_NAME][curBase] = {};
      if (!dataTarget[curGeo][CROSS_SEG_NAME][curBase][channelKey]) dataTarget[curGeo][CROSS_SEG_NAME][curBase][channelKey] = {};
      const series = {};
      for (let y = 0; y < YEARS.length; y++) {
        const v = row[1 + y];
        series[String(YEARS[y])] = round(typeof v === 'number' ? v : 0);
      }
      dataTarget[curGeo][CROSS_SEG_NAME][curBase][channelKey][leafKey] = series;
    }
  }
}

parseCrossSheet('Cross Value', value);
parseCrossSheet('Cross Volume', volume);

// ---------- Add aggregated parent records with _aggregated/_level markers ----------
// The dashboard explicitly skips leaf children when an aggregated parent is selected,
// preventing double-counting. Channel → sum of 4 pizza types; Base → sum of channels.
function sumSeries(seriesList) {
  const out = {};
  for (const y of YEARS) {
    let s = 0;
    for (const ser of seriesList) s += Number(ser?.[String(y)]) || 0;
    out[String(y)] = round(s);
  }
  return out;
}

function addAggregatedParents(dataTarget) {
  for (const geo of Object.keys(dataTarget)) {
    const cs = dataTarget[geo][CROSS_SEG_NAME];
    if (!cs) continue;
    for (const base of Object.keys(cs)) {
      const baseNode = cs[base];
      const baseChannelTotals = [];
      for (const chKey of Object.keys(baseNode)) {
        const chNode = baseNode[chKey];
        const ptSeriesList = Object.values(chNode).filter(v => typeof v === 'object' && !Array.isArray(v));
        const channelTotal = sumSeries(ptSeriesList);
        Object.assign(chNode, channelTotal);
        chNode._aggregated = true;
        chNode._level = 3;
        baseChannelTotals.push(channelTotal);
      }
      const baseTotal = sumSeries(baseChannelTotals);
      Object.assign(baseNode, baseTotal);
      baseNode._aggregated = true;
      baseNode._level = 2;
    }
  }
}

addAggregatedParents(value);
addAggregatedParents(volume);

// ---------- Build geography hierarchy under "By Region" ----------
const REGION_COUNTRIES = {
  'North America': ['U.S.', 'Canada'],
  'Europe': ['Norway', 'UK', 'Republic of Ireland', 'Germany', 'Romania', 'Italy', 'France', 'Spain', 'Russia', 'Switzerland', 'Sweden', 'Finland', 'Rest of Europe'],
  'Asia Pacific': ['China', 'India', 'Japan', 'South Korea', 'ASEAN', 'Australia', 'New Zealand', 'Rest of Asia Pacific'],
  'Latin America': ['Brazil', 'Argentina', 'Mexico', 'Rest of Latin America'],
  'Middle East': ['GCC Countries', 'Rest of Middle East'],
  'Africa': ['North Africa', 'South Africa', 'Central Africa'],
};

function pizzaTypeTotal(target, geo) {
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
  if (!target['Global']) return;
  target['Global']['By Region'] = {};
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    const node = {};
    const regionTotal = pizzaTypeTotal(target, region);
    if (regionTotal) node[region] = regionTotal;
    for (const c of countries) {
      const ct = pizzaTypeTotal(target, c);
      if (ct) node[c] = ct;
    }
    target['Global']['By Region'][region] = node;
  }
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

// ---------- Write output ----------
const outDir = path.join(__dirname, 'public', 'data');
fs.writeFileSync(path.join(outDir, 'value.json'), JSON.stringify(value));
fs.writeFileSync(path.join(outDir, 'volume.json'), JSON.stringify(volume));
fs.writeFileSync(path.join(outDir, 'segmentation_analysis.json'), JSON.stringify(value));

// Summary
const crossGeos = Object.keys(value).filter(g => value[g][CROSS_SEG_NAME]);
console.log('Total regions:', Object.keys(value).length);
console.log('Geographies with Cross-Segment Analysis:', crossGeos);
for (const g of crossGeos) {
  const cs = value[g][CROSS_SEG_NAME];
  const bases = Object.keys(cs);
  const leafCount = bases.reduce((a, b) => {
    const channels = Object.keys(cs[b]).filter(k => typeof cs[b][k] === 'object' && cs[b][k]._level === 3);
    return a + channels.reduce((ca, ch) => ca + Object.keys(cs[b][ch]).filter(k => !/^\d{4}$/.test(k) && k !== '_aggregated' && k !== '_level').length, 0);
  }, 0);
  console.log(` ${g}: ${bases.length} bases, ${leafCount} leaves`);
}
