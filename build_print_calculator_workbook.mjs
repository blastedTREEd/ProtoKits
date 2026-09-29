import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const artifactToolPath = process.env.OAI_ARTIFACT_TOOL_PATH;
if (!artifactToolPath) throw new Error('Missing OAI_ARTIFACT_TOOL_PATH');
const { Workbook, SpreadsheetFile } = await import(pathToFileURL(artifactToolPath).href);

const repoDir = process.cwd();
const outDir = path.join(repoDir, 'outputs', 'print-calculator-workbook');
await fs.mkdir(outDir, { recursive: true });

const backup = JSON.parse(await fs.readFile(path.join(repoDir, 'db backup'), 'utf8'));
const workbook = Workbook.create();

const colors = {
  navy: '#16324F',
  blue: '#2F6690',
  lightBlue: '#EAF3F8',
  teal: '#2A9D8F',
  lightTeal: '#E7F5F1',
  amber: '#F4B942',
  lightAmber: '#FFF4D6',
  green: '#2E7D32',
  lightGreen: '#EAF6EA',
  red: '#B3261E',
  lightRed: '#FCE8E6',
  gray: '#6B7280',
  lightGray: '#F3F4F6',
  border: '#D7DEE5',
  ink: '#1F2937',
  white: '#FFFFFF',
};
const font = 'Arial';

const safeNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const safeText = (v, fallback = '') => (v == null ? fallback : String(v));
const normalizeStatus = (v) => {
  const raw = safeText(v).toLowerCase();
  if (['online', 'available', 'ready', 'idle', 'active'].includes(raw)) return 'available';
  if (['offline', 'unavailable', 'disabled'].includes(raw)) return 'unavailable';
  return raw || 'available';
};
const label = (...parts) => parts.filter((v) => safeText(v).trim()).join(' ').trim();
const sheetRef = (name, cell) => `'${name.replaceAll("'", "''")}'!${cell}`;
const lookup = (key, range, col, fallback = 0) => `IFERROR(VLOOKUP(${key},${range},${col},FALSE),${fallback})`;

const printers = (backup.printers || []).map((p) => ({
  label: label(p.brand, p.model || p.name, `(${p.id})`),
  id: safeText(p.id),
  brand: safeText(p.brand),
  model: safeText(p.model || p.name),
  status: normalizeStatus(p.status),
  power: safeNum(p.wattage ?? p.power_watts, 120),
  capacity: safeText(p.buildCapacity || p.build_capacity),
  nozzle: safeNum(p.nozzleSize ?? p.nozzle_size, 0.4),
  slots: safeNum(p.filamentSlots ?? p.filament_slots, 1),
  boot: safeNum(p.bootupMins ?? p.bootuptimeMins, 0),
  home: safeNum(p.homingMins, 0),
  level: safeNum(p.bedLevelMins ?? p.bedlevellingMins, 0),
}));

const materials = (backup.filaments || []).map((m) => ({
  label: label(m.brand, m.type, m.colorName || m.colorLabel || m.colour),
  id: safeText(m.id),
  brand: safeText(m.brand),
  type: safeText(m.type),
  color: safeText(m.colorName || m.colorLabel || m.colour),
  price: safeNum(m.price),
  spool: safeNum(m.weight, safeNum(backup.rates?.find((r) => r.id === 'material cost')?.spool, 1000)),
  remaining: safeNum(m.remaining),
  status: safeText(m.status || 'stock'),
  load: safeNum(m.loadTime),
  purge: safeNum(m.purgeTime ?? m.cleanBuffer),
}));

const extras = [];
for (const e of (backup.extras || [])) {
  const variants = Array.isArray(e.variants) && e.variants.length > 0 ? e.variants : [null];
  for (const v of variants) {
    const name = v ? `${safeText(e.name)} - ${safeText(v.size)}` : safeText(e.name);
    extras.push({
      label: name,
      extraId: safeText(e.id),
      name: safeText(e.name),
      variantId: safeText(v?.id),
      size: safeText(v?.size),
      pack: safeNum(e.pack, 1),
      price: safeNum(v?.price ?? e.price),
      qty: safeNum(v?.qty ?? e.qty),
      status: safeText(e.status || 'enabled'),
    });
  }
}

const rateRows = [
  ['markupRate', 'Print', safeNum(backup.rates?.find((r) => r.id === 'print cost')?.markupRate, 20), 'Markup applied to material, labor, electricity, and extras'],
  ['reprintRate', 'Print', safeNum(backup.rates?.find((r) => r.id === 'print cost')?.reprintRate, 75), 'Reference rate from database snapshot'],
  ['materialClientShareRate', 'Material', safeNum(backup.rates?.find((r) => r.id === 'material cost')?.clientShareRate, 50), 'Client share applied to unused material purchased'],
  ['spoolWeight', 'Material', safeNum(backup.rates?.find((r) => r.id === 'material cost')?.spool, 1000), 'Default spool weight in grams'],
  ['extraClientShareRate', 'Extra', safeNum(backup.rates?.find((r) => r.id === 'extra cost')?.clientShareRate, 50), 'Client share applied to unused extra stock'],
  ['magnetSetupRate', 'Extra', safeNum(backup.rates?.find((r) => r.id === 'extra cost')?.magnetSetupRate, 5), 'Minutes per project when magnets are used'],
  ['magnetPlacementRate', 'Extra', safeNum(backup.rates?.find((r) => r.id === 'extra cost')?.magnetPlacementRate, 2), 'Minutes per magnet'],
  ['heatsetSetupRate', 'Extra', safeNum(backup.rates?.find((r) => r.id === 'extra cost')?.heatsetSetupRate, 5), 'Minutes per project when heatsets are used'],
  ['heatsetPlacementRate', 'Extra', safeNum(backup.rates?.find((r) => r.id === 'extra cost')?.heatsetPlacementRate, 1), 'Minutes per heatset'],
  ['laborRate', 'Labor', safeNum(backup.rates?.find((r) => r.id === 'labor cost')?.laborRate, 180), 'Monitoring labor rate per print hour'],
  ['preparationRatePerFile', 'Labor', safeNum(backup.rates?.find((r) => r.id === 'labor cost')?.preparationRatePerFile, 5), 'Model preparation per file/plate'],
  ['supportRemovalRatePerModel', 'Labor', safeNum(backup.rates?.find((r) => r.id === 'labor cost')?.supportRemovalRatePerModel, 2), 'Support removal per file/plate'],
  ['installationCost', 'Labor', 2, 'Hardware installation cost per piece'],
  ['filamentHandlingCost', 'Labor', 5, 'Material handling cost per handling event'],
  ['dailyPrintLimit', 'Labor', safeNum(backup.rates?.find((r) => r.id === 'labor cost')?.dailyPrintLimit, 10), 'Maximum scheduled print hours per day'],
  ['electricityRate', 'Electricity', safeNum(backup.rates?.find((r) => r.id === 'electricity cost')?.electricityRate, 14.16), 'Base electricity rate per kWh'],
  ['expectedIncrease', 'Electricity', safeNum(backup.rates?.find((r) => r.id === 'electricity cost')?.expectedIncrease, 4), 'Expected electricity increase percentage'],
  ['solderingIronPower', 'Electricity', 60, 'Soldering iron power in watts'],
  ['maintenanceRate', 'Maintenance', safeNum(backup.rates?.find((r) => r.id === 'maintenance cost')?.maintenanceRate, 5), 'Printer wear per runtime hour'],
  ['estimationFixedCost', 'Maintenance', safeNum(backup.rates?.find((r) => r.id === 'maintenance cost')?.estimationFixedCost, 50), 'Fixed estimation/assessment cost'],
  ['solderTipRate', 'Maintenance', 2, 'Soldering tip wear per heatset hour'],
  ['printStartTime', 'Scheduling', 9, 'Reference start hour for scheduling'],
  ['multicolorPenalty', 'Scheduling', 0, 'Fallback swap minutes when no feeder swap rate exists'],
];

const addTitle = (sheet, title, subtitle = '') => {
  sheet.getRange('A1').values = [[title]];
  sheet.getRange('A1').format = { font: { name: font, size: 16, bold: true, color: colors.navy } };
  sheet.getRange('A2').values = [[subtitle]];
  sheet.getRange('A2').format = { font: { name: font, size: 10, italic: true, color: colors.gray } };
};
const styleHeader = (range, fill = colors.navy) => {
  range.format = {
    fill,
    font: { name: font, size: 10, bold: true, color: colors.white },
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
    borders: { preset: 'outside', style: 'thin', color: fill },
  };
};
const styleBody = (range) => {
  range.format = {
    font: { name: font, size: 10, color: colors.ink },
    verticalAlignment: 'center',
  };
};
const sectionBand = (sheet, range, text, fill = colors.blue) => {
  sheet.getRange(range).merge();
  const topLeft = range.split(':')[0];
  sheet.getRange(topLeft).values = [[text]];
  sheet.getRange(range).format = {
    fill,
    font: { name: font, size: 10, bold: true, color: colors.white },
    verticalAlignment: 'center',
  };
};
const setWidths = (sheet, widths) => {
  for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}:${col}`).format.columnWidth = width;
};

// README / use guide
const readme = workbook.worksheets.add('README');
readme.showGridLines = false;
readme.tabColor = colors.gray;
addTitle(readme, 'Offline Prints Calculator Workbook', 'SNORLAXGARAGE • STL and 3MF project estimation');
readme.getRange('A4:F4').values = [['What this workbook does', '', '', '', '', '']];
readme.getRange('A4:F4').merge();
readme.getRange('A4:F4').format = { fill: colors.navy, font: { name: font, size: 11, bold: true, color: colors.white } };
readme.getRange('A5:F10').values = [
  ['Use the Calculator tab to estimate a print project offline.', '', '', '', '', ''],
  ['STL projects: enter the sliced print time and material weight from your slicer; dimensions are retained as audit notes.', '', '', '', '', ''],
  ['3MF projects: enter the sliced print time, total material weight, and color swaps from the 3MF/slicer output.', '', '', '', '', ''],
  ['Printer, material, extra, and rate lookups are embedded snapshots, so the workbook does not require internet access after download.', '', '', '', '', ''],
  ['To refresh database values later, replace the rows in Printers, Materials, Extras, and Rates, then use the same labels in Calculator dropdowns.', '', '', '', '', ''],
  ['The workbook does not parse binary STL/3MF files itself; it calculates from the metrics shown by the slicer, matching the current app’s cost engine inputs.', '', '', '', '', ''],
];
readme.getRange('A5:F10').merge(true);
readme.getRange('A5:F10').format = { font: { name: font, size: 10, color: colors.ink }, wrapText: true, verticalAlignment: 'center' };
readme.getRange('A12:C12').values = [['Embedded data snapshot', '', '']];
readme.getRange('A12:C12').merge();
readme.getRange('A12:C12').format = { fill: colors.blue, font: { name: font, size: 10, bold: true, color: colors.white } };
readme.getRange('A13:C18').values = [
  ['Source', 'db backup (workspace snapshot)', ''],
  ['Printers', printers.length, 'records'],
  ['Materials', materials.length, 'records'],
  ['Extras', extras.length, 'flattened base/variant rows'],
  ['Rate keys', rateRows.length, 'normalized calculation inputs'],
  ['Snapshot note', 'Live Firestore could not be queried from this workspace', 'refresh manually when needed'],
];
styleBody(readme.getRange('A13:C18'));
readme.getRange('B14:B17').format.numberFormat = '0';
readme.getRange('A20:F20').values = [['App-engine mapping', '', '', '', '', '']];
readme.getRange('A20:F20').merge();
readme.getRange('A20:F20').format = { fill: colors.blue, font: { name: font, size: 10, bold: true, color: colors.white } };
readme.getRange('A21:F28').values = [
  ['App calculation block', 'Workbook implementation', '', 'App calculation block', 'Workbook implementation', ''],
  ['Material usage', 'Weight × spool price ÷ spool weight', '', 'Electricity', 'Printer kWh + heatset iron kWh × effective rate', ''],
  ['Material excess', 'Purchase packs when usage exceeds remaining stock', '', 'Maintenance', 'Runtime wear + heatset wear + fixed assessment', ''],
  ['Labor', 'Prep + support + monitoring + hardware + handling', '', 'Markup', 'Applied to material, labor, electricity, extras', ''],
  ['Extras', 'Pack/variant cost plus client share of unused pack units', '', 'Downpayment', 'Rounded-up formula based on raw costs and 10% labor reserve', ''],
  ['Timeline', 'Scheduled hours ÷ daily print limit', '', '3MF swaps', 'Explicit color swaps × feeder/printer swap minutes', ''],
  ['STL workflow', 'Slicer-derived time/weight inputs', '', 'Offline behavior', 'Embedded reference tables; no network calls', ''],
  ['3MF workflow', 'Sliced time/weight/swap inputs', '', 'Auditability', 'Helper calculation blocks remain visible below the main estimate', ''],
];
styleHeader(readme.getRange('A21:F21'));
styleBody(readme.getRange('A22:F28'));
readme.getRange('A21:F28').format.wrapText = true;
setWidths(readme, { A: 24, B: 42, C: 4, D: 24, E: 48, F: 4 });
readme.getRange('1:1').format.rowHeight = 24;

// Reference sheets
const printersSheet = workbook.worksheets.add('Printers');
printersSheet.showGridLines = false;
printersSheet.tabColor = colors.teal;
addTitle(printersSheet, 'Printer Reference', 'Snapshot data used by offline lookup formulas');
const printerHeaders = ['Label', 'ID', 'Brand', 'Model', 'Status', 'Power W', 'Build capacity', 'Nozzle mm', 'Slots', 'Boot min', 'Home min', 'Level min'];
printersSheet.getRange(`A4:L${4 + printers.length}`).values = [printerHeaders, ...printers.map((p) => [p.label, p.id, p.brand, p.model, p.status, p.power, p.capacity, p.nozzle, p.slots, p.boot, p.home, p.level])];
styleHeader(printersSheet.getRange('A4:L4'));
styleBody(printersSheet.getRange(`A5:L${4 + printers.length}`));
printersSheet.getRange(`F5:F${4 + printers.length}`).format.numberFormat = '0.0';
printersSheet.getRange(`H5:L${4 + printers.length}`).format.numberFormat = '0.0';
printersSheet.tables.add(`A4:L${4 + printers.length}`, true, 'PrintersTable');
setWidths(printersSheet, { A: 32, B: 18, C: 14, D: 22, E: 13, F: 11, G: 22, H: 11, I: 9, J: 10, K: 10, L: 10 });
printersSheet.freezePanes.freezeRows(4);

const materialsSheet = workbook.worksheets.add('Materials');
materialsSheet.showGridLines = false;
materialsSheet.tabColor = colors.teal;
addTitle(materialsSheet, 'Material / Filament Reference', 'Snapshot data used by offline lookup formulas');
const materialHeaders = ['Label', 'ID', 'Brand', 'Type', 'Color', 'Price / spool', 'Spool g', 'Remaining g', 'Status', 'Load min', 'Purge min'];
materialsSheet.getRange(`A4:K${4 + materials.length}`).values = [materialHeaders, ...materials.map((m) => [m.label, m.id, m.brand, m.type, m.color, m.price, m.spool, m.remaining, m.status, m.load, m.purge])];
styleHeader(materialsSheet.getRange('A4:K4'));
styleBody(materialsSheet.getRange(`A5:K${4 + materials.length}`));
materialsSheet.getRange(`F5:H${4 + materials.length}`).format.numberFormat = '₱#,##0.00';
materialsSheet.getRange(`G5:K${4 + materials.length}`).format.numberFormat = '0.00';
materialsSheet.tables.add(`A4:K${4 + materials.length}`, true, 'MaterialsTable');
setWidths(materialsSheet, { A: 34, B: 18, C: 14, D: 10, E: 22, F: 14, G: 11, H: 13, I: 12, J: 10, K: 10 });
materialsSheet.freezePanes.freezeRows(4);

const extrasSheet = workbook.worksheets.add('Extras');
extrasSheet.showGridLines = false;
extrasSheet.tabColor = colors.teal;
addTitle(extrasSheet, 'Extras / Hardware Reference', 'Flattened base and variant rows from the snapshot');
const extraHeaders = ['Label', 'Extra ID', 'Extra name', 'Variant ID', 'Size', 'Pack units', 'Pack price', 'Stock qty', 'Status', 'Unit price'];
extrasSheet.getRange(`A4:J${4 + extras.length}`).values = [extraHeaders, ...extras.map((e) => [e.label, e.extraId, e.name, e.variantId, e.size, e.pack, e.price, e.qty, e.status, null])];
styleHeader(extrasSheet.getRange('A4:J4'));
styleBody(extrasSheet.getRange(`A5:J${4 + extras.length}`));
extrasSheet.getRange('J5').formulas = [['=IFERROR(G5/F5,0)']];
extrasSheet.getRange(`J5:J${4 + extras.length}`).fillDown();
extrasSheet.getRange(`F5:F${4 + extras.length}`).format.numberFormat = '0';
extrasSheet.getRange(`G5:G${4 + extras.length}`).format.numberFormat = '₱#,##0.00';
extrasSheet.getRange(`H5:H${4 + extras.length}`).format.numberFormat = '0.00';
extrasSheet.getRange(`J5:J${4 + extras.length}`).format.numberFormat = '₱#,##0.00';
extrasSheet.tables.add(`A4:J${4 + extras.length}`, true, 'ExtrasTable');
setWidths(extrasSheet, { A: 34, B: 10, C: 18, D: 12, E: 18, F: 11, G: 12, H: 11, I: 12, J: 12 });
extrasSheet.freezePanes.freezeRows(4);

const ratesSheet = workbook.worksheets.add('Rates');
ratesSheet.showGridLines = false;
ratesSheet.tabColor = colors.teal;
addTitle(ratesSheet, 'Rate Reference', 'Normalized rate keys consumed by the Calculator formulas');
ratesSheet.getRange(`A4:D${4 + rateRows.length}`).values = [['Key', 'Category', 'Value', 'Notes'], ...rateRows];
styleHeader(ratesSheet.getRange('A4:D4'));
styleBody(ratesSheet.getRange(`A5:D${4 + rateRows.length}`));
ratesSheet.getRange(`C5:C${4 + rateRows.length}`).format.numberFormat = '0.00';
ratesSheet.tables.add(`A4:D${4 + rateRows.length}`, true, 'RatesTable');
setWidths(ratesSheet, { A: 30, B: 16, C: 13, D: 60 });
ratesSheet.freezePanes.freezeRows(4);

// Main calculator
const calc = workbook.worksheets.add('Calculator');
calc.showGridLines = false;
calc.tabColor = colors.navy;
addTitle(calc, 'Offline STL / 3MF Print Cost Calculator', 'Editable cells are amber; calculated cells are blue/green. Currency is Philippine peso.');

sectionBand(calc, 'A4:B4', 'Project controls', colors.navy);
calc.getRange('A5:B12').values = [
  ['Project name', 'Demo project – change me'],
  ['Project type', 'STL'],
  ['Cost mode', 'Customer estimate'],
  ['Printer', printers[0]?.label || ''],
  ['Primary material', materials.find((m) => /BLACK/i.test(m.color))?.label || materials[0]?.label || ''],
  ['Secondary material', ''],
  ['Use multicolor / CFS', 'No'],
  ['Default print adjustment %', 0],
];
styleBody(calc.getRange('A5:B12'));
calc.getRange('A5:A12').format.font = { name: font, size: 10, bold: true, color: colors.ink };
calc.getRange('B5:B12').format = { fill: colors.lightAmber, font: { name: font, size: 10, color: colors.ink }, verticalAlignment: 'center' };
calc.getRange('B12').format.numberFormat = '0.00%';
calc.getRange('B6').dataValidation = { rule: { type: 'list', values: ['STL', '3MF'] } };
calc.getRange('B7').dataValidation = { rule: { type: 'list', values: ['Customer estimate', 'Inventory cost'] } };
calc.getRange('B8').dataValidation = { rule: { type: 'list', formula1: `Printers!$A$5:$A$${4 + printers.length}` } };
calc.getRange('B9:B10').dataValidation = { rule: { type: 'list', formula1: `Materials!$A$5:$A$${4 + materials.length}` } };
calc.getRange('B11').dataValidation = { rule: { type: 'list', values: ['Yes', 'No'] } };

sectionBand(calc, 'D4:F4', 'Estimate output', colors.teal);
calc.getRange('D5:F12').values = [
  ['Total estimate', null, 'Customer-facing project total'],
  ['Minimum downpayment', null, 'Rounded to the nearest ₱10'],
  ['Total project profit', null, 'Markup profit only; excludes stock excess charges'],
  ['Total effort', null, 'Print + prep + setup + hardware time'],
  ['Scheduled sessions', null, 'Uses daily print limit'],
  ['Electricity used', null, 'Printer + heatset iron'],
  ['Database snapshot', 'db backup', 'Replace reference tabs when refreshing'],
  ['Status', null, 'Input check'],
];
styleBody(calc.getRange('D5:F12'));
calc.getRange('D5:D12').format.font = { name: font, size: 10, bold: true, color: colors.ink };
calc.getRange('E5:E12').format = { fill: colors.lightGreen, font: { name: font, size: 12, bold: true, color: colors.green }, horizontalAlignment: 'right', verticalAlignment: 'center' };
calc.getRange('F5:F12').format = { font: { name: font, size: 9, italic: true, color: colors.gray }, wrapText: true };
calc.getRange('E5:E7').format.numberFormat = '₱#,##0.00';
calc.getRange('E8').format.numberFormat = '0.00';
calc.getRange('E9').format.numberFormat = '0';
calc.getRange('E10').format.numberFormat = '0.000';

sectionBand(calc, 'A14:B14', 'Project totals', colors.blue);
calc.getRange('A15:B24').values = [
  ['Included files / plates', null],
  ['Base slicer time (min)', null],
  ['Adjusted print time (min)', null],
  ['Total material weight (g)', null],
  ['Color swaps', null],
  ['Magnet quantity', null],
  ['Heatset quantity', null],
  ['Material handling events', 2],
  ['Load + purge time (min)', null],
  ['Hardware / setup time (min)', null],
];
styleBody(calc.getRange('A15:B24'));
calc.getRange('A15:A24').format.font = { name: font, size: 10, bold: true, color: colors.ink };
calc.getRange('B15:B24').format = { fill: colors.lightBlue, font: { name: font, size: 10, color: colors.ink }, horizontalAlignment: 'right' };
calc.getRange('B22').format.fill = colors.lightAmber;
calc.getRange('B15:B24').format.numberFormat = '0.00';

sectionBand(calc, 'D14:F14', 'Cost summary', colors.blue);
calc.getRange('D15:F22').values = [
  ['Materials', null, 'Usage + excess stock share'],
  ['Labor', null, 'Prep + support + monitoring + hardware + handling'],
  ['Electricity', null, 'Markup included'],
  ['Maintenance', null, 'No markup'],
  ['Extras', null, 'Hardware + excess stock share'],
  ['Base cost before markup', null, 'Raw usage, labor, electricity, and extras'],
  ['Total cost / sell price', null, 'Final estimate'],
  ['Output validation', null, ''],
];
styleBody(calc.getRange('D15:F22'));
calc.getRange('D15:D22').format.font = { name: font, size: 10, bold: true, color: colors.ink };
calc.getRange('E15:E21').format = { fill: colors.lightBlue, font: { name: font, size: 10, bold: true, color: colors.navy }, horizontalAlignment: 'right' };
calc.getRange('E15:E21').format.numberFormat = '₱#,##0.00';
calc.getRange('F15:F22').format = { font: { name: font, size: 9, italic: true, color: colors.gray }, wrapText: true };
calc.getRange('E22').format = { fill: colors.lightGreen, font: { name: font, size: 10, bold: true, color: colors.green } };

sectionBand(calc, 'A26:Q26', 'Project item inputs (amber cells)', colors.navy);
const itemHeaders = ['Include?', 'Item / plate', 'Source', 'Slicer time min', 'Weight g', 'Color swaps', 'Material 1', 'Material 1 g', 'Material 2', 'Material 2 g', 'Magnets', 'Heatsets', 'Adjusted time min', 'Mat 1 raw ₱', 'Mat 2 raw ₱', 'Hardware min'];
calc.getRange('A27:P35').values = [
  itemHeaders,
  ['Yes', 'Demo STL / plate 1', 'STL', 120, 120, 0, calc.getRange('B9').values[0][0], 120, '', 0, 0, 0, null, null, null, null],
  ['No', 'Second item / plate', '3MF', 0, 0, 0, calc.getRange('B9').values[0][0], 0, '', 0, 0, 0, null, null, null, null],
  ['No', 'Third item / plate', 'STL', 0, 0, 0, calc.getRange('B9').values[0][0], 0, '', 0, 0, 0, null, null, null, null],
  ['No', 'Fourth item / plate', '3MF', 0, 0, 0, calc.getRange('B9').values[0][0], 0, '', 0, 0, 0, null, null, null, null],
  ['No', 'Fifth item / plate', 'STL', 0, 0, 0, calc.getRange('B9').values[0][0], 0, '', 0, 0, 0, null, null, null],
  ['No', 'Sixth item / plate', '3MF', 0, 0, 0, calc.getRange('B9').values[0][0], 0, '', 0, 0, 0, null, null, null],
  ['No', 'Seventh item / plate', 'STL', 0, 0, 0, calc.getRange('B9').values[0][0], 0, '', 0, 0, 0, null, null],
  ['No', 'Eighth item / plate', '3MF', 0, 0, 0, calc.getRange('B9').values[0][0], 0, '', 0, 0, 0, null, null],
];
calc.getRange('Q27').values = [['Load + purge min']];
styleHeader(calc.getRange('A27:Q27'));
styleBody(calc.getRange('A28:Q35'));
calc.getRange('A28:L35').format.fill = colors.lightAmber;
calc.getRange('M28:Q35').format.fill = colors.lightBlue;
calc.getRange('A28:A35').dataValidation = { rule: { type: 'list', values: ['Yes', 'No'] } };
calc.getRange('C28:C35').dataValidation = { rule: { type: 'list', values: ['STL', '3MF'] } };
calc.getRange('G28:G35').dataValidation = { rule: { type: 'list', formula1: `Materials!$A$5:$A$${4 + materials.length}` } };
calc.getRange('I28:I35').dataValidation = { rule: { type: 'list', formula1: `Materials!$A$5:$A$${4 + materials.length}` } };
calc.getRange('A28:Q35').format.numberFormat = '0.00';
calc.getRange('A28:C35').format.numberFormat = '@';
calc.getRange('M28:Q35').format.numberFormat = '0.00';
calc.getRange('M28').formulas = [[`=IF(A28="Yes",D28*(1+$B$12)+IF($B$11="Yes",F28*${lookup('"multicolorPenalty"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)},0),0)`]];
calc.getRange('M28:M35').fillDown();
calc.getRange('N28').formulas = [[`=IF(A28="Yes",IFERROR(H28*${lookup('G28', `Materials!$A$5:$K$${4 + materials.length}`, 6, 0)}/${lookup('G28', `Materials!$A$5:$K$${4 + materials.length}`, 7, 1)},0),0)`]];
calc.getRange('N28:N35').fillDown();
calc.getRange('O28').formulas = [[`=IF(A28="Yes",IFERROR(J28*${lookup('I28', `Materials!$A$5:$K$${4 + materials.length}`, 6, 0)}/${lookup('I28', `Materials!$A$5:$K$${4 + materials.length}`, 7, 1)},0),0)`]];
calc.getRange('O28:O35').fillDown();
calc.getRange('P28').formulas = [[`=IF(A28="Yes",IF(K28>0,${lookup('"magnetSetupRate"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)}+K28*${lookup('"magnetPlacementRate"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)},0)+IF(L28>0,${lookup('"heatsetSetupRate"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)}+L28*${lookup('"heatsetPlacementRate"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)},0),0)`]];
calc.getRange('P28:P35').fillDown();
calc.getRange('Q28').formulas = [[`=IF(A28="Yes",IFERROR(VLOOKUP(G28,Materials!$A$5:$K$${4 + materials.length},10,FALSE),0)+IFERROR(VLOOKUP(G28,Materials!$A$5:$K$${4 + materials.length},11,FALSE),0)+IFERROR(VLOOKUP(I28,Materials!$A$5:$K$${4 + materials.length},10,FALSE),0)+IFERROR(VLOOKUP(I28,Materials!$A$5:$K$${4 + materials.length},11,FALSE),0),0)`]];
calc.getRange('Q28:Q35').fillDown();

sectionBand(calc, 'A37:G37', 'Extra inputs and purchase-pack calculation', colors.navy);
const extraInputHeaders = ['Extra / variant', 'Qty used', 'Pack units', 'Pack price', 'Base cost', 'Purchased packs', 'Excess share'];
calc.getRange('A38:G43').values = [
  extraInputHeaders,
  [extras.find((e) => /Magnets - 8/i.test(e.label))?.label || extras[0]?.label || '', 0, null, null, null, null, null],
  [extras.find((e) => /Heatsets - 8/i.test(e.label))?.label || extras[0]?.label || '', 0, null, null, null, null, null],
  ['', 0, null, null, null, null, null],
  ['', 0, null, null, null, null, null],
  ['', 0, null, null, null, null, null],
];
styleHeader(calc.getRange('A38:G38'));
styleBody(calc.getRange('A39:G43'));
calc.getRange('A39:B43').format.fill = colors.lightAmber;
calc.getRange('C39:G43').format.fill = colors.lightBlue;
calc.getRange('A39:A43').dataValidation = { rule: { type: 'list', formula1: `Extras!$A$5:$A$${4 + extras.length}` } };
calc.getRange('C39').formulas = [[`=IFERROR(VLOOKUP(A39,Extras!$A$5:$J$${4 + extras.length},6,FALSE),0)`]];
calc.getRange('C39:C43').fillDown();
calc.getRange('D39').formulas = [[`=IFERROR(VLOOKUP(A39,Extras!$A$5:$J$${4 + extras.length},7,FALSE),0)`]];
calc.getRange('D39:D43').fillDown();
calc.getRange('E39').formulas = [['=B39*IFERROR(D39/C39,0)']];
calc.getRange('E39:E43').fillDown();
calc.getRange('F39').formulas = [['=IF(B39>0,ROUNDUP(B39/C39,0),0)']];
calc.getRange('F39:F43').fillDown();
calc.getRange('G39').formulas = [[`=IF($B$7="Inventory cost",0,MAX(0,F39*C39-B39)*IFERROR(D39/C39,0)*${lookup('"extraClientShareRate"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)}/100)`]];
calc.getRange('G39:G43').fillDown();
calc.getRange('C39:C43').format.numberFormat = '0';
calc.getRange('D39:G43').format.numberFormat = '₱#,##0.00';

sectionBand(calc, 'I37:P37', 'Material usage / stock calculation', colors.navy);
const materialCalcHeaders = ['Material label', 'Usage g', 'Raw cost ₱', 'Shortfall g', 'Packs', 'Excess units', 'Excess share', 'Final material cost'];
calc.getRange('I38:P39').values = [materialCalcHeaders, [null, null, null, null, null, null, null, null]];
styleHeader(calc.getRange('I38:P38'));
styleBody(calc.getRange('I39:P39'));
calc.getRange('I39').formulas = [['=B9']];
calc.getRange('I40').formulas = [['=B10']];
calc.getRange('I39:I40').format.fill = colors.lightBlue;
calc.getRange('I39:P40').format.fill = colors.lightBlue;
calc.getRange('I39:I40').dataValidation = { rule: { type: 'list', formula1: `Materials!$A$5:$A$${4 + materials.length}` } };
for (const row of [39, 40]) {
  calc.getRange(`J${row}`).formulas = [[`=SUMIF($G$28:$G$35,I${row},$H$28:$H$35)+SUMIF($I$28:$I$35,I${row},$J$28:$J$35)`]];
  calc.getRange(`K${row}`).formulas = [[`=J${row}*IFERROR(VLOOKUP(I${row},Materials!$A$5:$K$${4 + materials.length},6,FALSE)/VLOOKUP(I${row},Materials!$A$5:$K$${4 + materials.length},7,FALSE),0)`]];
  calc.getRange(`L${row}`).formulas = [[`=IF(J${row}=0,0,IF($B$7="Inventory cost",0,MAX(0,J${row}-IFERROR(VLOOKUP(I${row},Materials!$A$5:$K$${4 + materials.length},8,FALSE),0))))`]];
  calc.getRange(`M${row}`).formulas = [[`=IF(L${row}>0,ROUNDUP(L${row}/IFERROR(VLOOKUP(I${row},Materials!$A$5:$K$${4 + materials.length},7,FALSE),1),0),0)`]];
  calc.getRange(`N${row}`).formulas = [[`=IF(L${row}>0,M${row}*IFERROR(VLOOKUP(I${row},Materials!$A$5:$K$${4 + materials.length},7,FALSE),0)-L${row},0)`]];
  calc.getRange(`O${row}`).formulas = [[`=IF($B$7="Inventory cost",0,N${row}*IFERROR(VLOOKUP(I${row},Materials!$A$5:$K$${4 + materials.length},6,FALSE)/VLOOKUP(I${row},Materials!$A$5:$K$${4 + materials.length},7,FALSE),0)*${lookup('"materialClientShareRate"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)}/100)`]];
  calc.getRange(`P${row}`).formulas = [[`=K${row}*(1+${lookup('"markupRate"', `Rates!$A$5:$C$${4 + rateRows.length}`, 3, 0)}/100)+O${row}`]];
}
calc.getRange('J39:J40').format.numberFormat = '0.00';
calc.getRange('K39:K40').format.numberFormat = '₱#,##0.00';
calc.getRange('L39:N40').format.numberFormat = '0.00';
calc.getRange('O39:P40').format.numberFormat = '₱#,##0.00';

sectionBand(calc, 'I42:P42', 'Engine helper calculations', colors.blue);
calc.getRange('I43:P55').values = [
  ['Printer status', null, 'Printer power W', null, 'Daily print limit h', null, 'Effective electricity rate', null],
  ['Boot + home + level min', null, 'Swap penalty min', null, 'Markup %', null, 'Client material share %', null],
  ['Base labor', null, 'Base electricity', null, 'Base extras', null, 'Base materials', null],
  ['Startup min', null, 'Hardware min', null, 'Handling min', null, 'Runtime min', null],
  ['Heatset min', null, 'Printer kWh', null, 'Iron kWh', null, 'Total kWh', null],
  ['Material final', null, 'Labor final', null, 'Electricity final', null, 'Maintenance final', null],
  ['Extras final', null, 'Markup profit', null, 'Stock excess charges', null, 'Base cost before markup', null],
  ['Downpayment raw', null, 'Days / sessions', null, 'Effort min', null, 'Validation', null],
  ['', '', '', '', '', '', '', ''],
  ['Formula note', 'Uses reference rows above and bounded ranges for offline compatibility.', '', '', '', '', '', ''],
  ['STL note', 'Enter slicer time/weight; dimensions are not used to invent pricing.', '', '', '', '', '', ''],
  ['3MF note', 'Enter sliced time/weight/color swaps; swaps are added when CFS is Yes.', '', '', '', '', '', ''],
  ['Refresh note', 'Replace embedded reference rows when Firestore is refreshed.', '', '', '', '', '', ''],
];
styleBody(calc.getRange('I43:P55'));
calc.getRange('I43:I50').format.font = { name: font, size: 9, bold: true, color: colors.ink };
calc.getRange('K43:K50').format.font = { name: font, size: 9, bold: true, color: colors.ink };
calc.getRange('M43:M50').format.font = { name: font, size: 9, bold: true, color: colors.ink };
calc.getRange('O43:O50').format.font = { name: font, size: 9, bold: true, color: colors.ink };
calc.getRange('J43:J50').format = { fill: colors.lightBlue, font: { name: font, size: 9, color: colors.navy }, horizontalAlignment: 'right' };
calc.getRange('L43:L50').format = { fill: colors.lightBlue, font: { name: font, size: 9, color: colors.navy }, horizontalAlignment: 'right' };
calc.getRange('N43:N50').format = { fill: colors.lightBlue, font: { name: font, size: 9, color: colors.navy }, horizontalAlignment: 'right' };
calc.getRange('P43:P50').format = { fill: colors.lightBlue, font: { name: font, size: 9, color: colors.navy }, horizontalAlignment: 'right' };
calc.getRange('I52:I55').format.font = { name: font, size: 9, italic: true, color: colors.gray };
calc.getRange('J52:P55').format = { font: { name: font, size: 9, italic: true, color: colors.gray }, wrapText: true };

// Formulas linked to helper cells and outputs
const rateRange = `Rates!$A$5:$C$${4 + rateRows.length}`;
const printerRange = `Printers!$A$5:$L$${4 + printers.length}`;
const materialRange = `Materials!$A$5:$K$${4 + materials.length}`;
calc.getRange('B15').formulas = [['=COUNTIF($A$28:$A$35,"Yes")']];
calc.getRange('B16').formulas = [['=SUMIF($A$28:$A$35,"Yes",$D$28:$D$35)']];
calc.getRange('B17').formulas = [['=SUMIF($A$28:$A$35,"Yes",$M$28:$M$35)']];
calc.getRange('B18').formulas = [['=SUMIF($A$28:$A$35,"Yes",$E$28:$E$35)']];
calc.getRange('B19').formulas = [['=SUMIF($A$28:$A$35,"Yes",$F$28:$F$35)']];
calc.getRange('B20').formulas = [['=SUMIF($A$28:$A$35,"Yes",$K$28:$K$35)']];
calc.getRange('B21').formulas = [['=SUMIF($A$28:$A$35,"Yes",$L$28:$L$35)']];
// Keep the bounded helper above simple and auditable; per-row load/purge is more portable than array formulas.
calc.getRange('B23').formulas = [['=SUMIF($A$28:$A$35,"Yes",$Q$28:$Q$35)']];
calc.getRange('B24').formulas = [['=SUMIF($A$28:$A$35,"Yes",$P$28:$P$35)']];

calc.getRange('J43').formulas = [[`=${lookup('$B$8', printerRange, 5, '"unknown"')}`]];
calc.getRange('L43').formulas = [[`=${lookup('$B$8', printerRange, 6, 0)}`]];
calc.getRange('N43').formulas = [[`=${lookup('"electricityRate"', rateRange, 3, 0)}*(1+${lookup('"expectedIncrease"', rateRange, 3, 0)}/100)`]];
calc.getRange('P43').formulas = [[`=${lookup('"dailyPrintLimit"', rateRange, 3, 10)}`]];
calc.getRange('J44').formulas = [[`=${lookup('$B$8', printerRange, 10, 0)}+${lookup('$B$8', printerRange, 11, 0)}+${lookup('$B$8', printerRange, 12, 0)}`]];
calc.getRange('L44').formulas = [[`=${lookup('"multicolorPenalty"', rateRange, 3, 0)}`]];
calc.getRange('N44').formulas = [[`=${lookup('"markupRate"', rateRange, 3, 0)}`]];
calc.getRange('P44').formulas = [[`=${lookup('"materialClientShareRate"', rateRange, 3, 0)}`]];
calc.getRange('J45').formulas = [[`=$B$15*(${lookup('"preparationRatePerFile"', rateRange, 3, 0)}+${lookup('"supportRemovalRatePerModel"', rateRange, 3, 0)})+$B$20*${lookup('"installationCost"', rateRange, 3, 0)}+$B$22*${lookup('"filamentHandlingCost"', rateRange, 3, 0)}+$B$17/60*${lookup('"laborRate"', rateRange, 3, 0)}`]];
calc.getRange('L45').formulas = [['=$P$47*$N$43']];
calc.getRange('N45').formulas = [['=SUM(E39:E43)']];
calc.getRange('P45').formulas = [['=SUM(K39:K40)']];
calc.getRange('J46').formulas = [['=ROUNDUP(($B$17+$B$23+$B$24)/($P$43*60),0)*$J$44']];
calc.getRange('L46').formulas = [['=$B$24']];
calc.getRange('N46').formulas = [['=$B$22*5']];
calc.getRange('P46').formulas = [['=$B$17+$J$46+$L$46+$N$46']];
calc.getRange('J47').formulas = [[`=$B$21*${lookup('"heatsetSetupRate"', rateRange, 3, 0)}+$B$21*${lookup('"heatsetPlacementRate"', rateRange, 3, 0)}`]];
calc.getRange('L47').formulas = [['=$L$43/1000*($P$46/60)']];
calc.getRange('N47').formulas = [[`=(${lookup('"solderingIronPower"', rateRange, 3, 60)}/1000)*($J$47/60)`]];
calc.getRange('P47').formulas = [['=$L$47+$N$47']];
calc.getRange('J48').formulas = [['=SUM(P39:P40)']];
calc.getRange('L48').formulas = [[`=$J$45*(1+${lookup('"markupRate"', rateRange, 3, 0)}/100)`]];
calc.getRange('N48').formulas = [['=$P$47*$N$43*(1+$N$44/100)']];
calc.getRange('P48').formulas = [[`=($P$46/60)*${lookup('"maintenanceRate"', rateRange, 3, 0)}+($J$47/60)*${lookup('"solderTipRate"', rateRange, 3, 0)}+${lookup('"estimationFixedCost"', rateRange, 3, 0)}`]];
calc.getRange('J49').formulas = [[`=SUM(E39:E43)*(1+${lookup('"markupRate"', rateRange, 3, 0)}/100)+SUM(G39:G43)`]];
calc.getRange('L49').formulas = [[`=(${lookup('"markupRate"', rateRange, 3, 0)}/100)*(SUM(K39:K40)+$J$45+$P$47*$N$43+SUM(E39:E43))`]];
calc.getRange('N49').formulas = [['=SUM(G39:G43)+SUM(O39:O40)']];
calc.getRange('P49').formulas = [[`=SUM(K39:K40)+$J$45+$P$47*${lookup('"electricityRate"', rateRange, 3, 0)}*(1+${lookup('"expectedIncrease"', rateRange, 3, 0)}/100)+SUM(E39:E43)`]];
calc.getRange('J50').formulas = [['=ROUNDUP((SUM(K39:K40)+$J$45+$P$47*0)/10,0)*10']];
calc.getRange('L50').formulas = [['=ROUNDUP(($B$17+$B$23+$B$24)/($P$43*60),0)']];
calc.getRange('N50').formulas = [['=$P$46+$B$15*7+$B$23']];
calc.getRange('P50').formulas = [['=IF($B$15=0,"CHECK INPUTS",IF($B$17=0,"CHECK INPUTS",IF($E$21>0,"READY","CHECK INPUTS")))']];

// Main outputs referencing helper calculations.
calc.getRange('E5').formulas = [['=ROUND($E$21,2)']];
calc.getRange('E6').formulas = [['=ROUND($J$50,2)']];
calc.getRange('E7').formulas = [['=ROUND($L$49,2)']];
calc.getRange('E8').formulas = [['=$N$50/60']];
calc.getRange('E9').formulas = [['=$L$50']];
calc.getRange('E10').formulas = [['=$P$47']];
calc.getRange('E12').formulas = [['=$P$50']];
calc.getRange('E15').formulas = [['=ROUND($J$48,2)']];
calc.getRange('E16').formulas = [['=ROUND($L$48,2)']];
calc.getRange('E17').formulas = [['=ROUND($N$48,2)']];
calc.getRange('E18').formulas = [['=ROUND($P$48,2)']];
calc.getRange('E19').formulas = [['=ROUND($J$49,2)']];
calc.getRange('E20').formulas = [['=ROUND($P$49,2)']];
calc.getRange('E21').formulas = [['=ROUND($J$48+$L$48+$N$48+$P$48+$J$49,2)']];
calc.getRange('E22').formulas = [['=IF($E$21>0,"READY","CHECK INPUTS")']];

// Correct the helper formulas for material/extras totals and keep the base cost visible.
calc.getRange('J48').formulas = [['=SUM(P39:P40)']];
calc.getRange('P49').formulas = [[`=SUM(K39:K40)+$J$45+$P$47*${lookup('"electricityRate"', rateRange, 3, 0)}*(1+${lookup('"expectedIncrease"', rateRange, 3, 0)}/100)+SUM(E39:E43)`]];
calc.getRange('J50').formulas = [[`=ROUNDUP((SUM(K39:K40)+SUM(E39:E43)+SUM(G39:G43)+$P$47*$N$43+($J$45*0.1)+$P$48)/10,0)*10`]];

// Subtle visual cues and conditional validation.
calc.getRange('E12').conditionalFormats.add('containsText', { text: 'CHECK', format: { fill: colors.lightRed, font: { color: colors.red, bold: true } } });
calc.getRange('E22').conditionalFormats.add('containsText', { text: 'CHECK', format: { fill: colors.lightRed, font: { color: colors.red, bold: true } } });
calc.getRange('E22').conditionalFormats.add('containsText', { text: 'READY', format: { fill: colors.lightGreen, font: { color: colors.green, bold: true } } });

setWidths(calc, { A: 18, B: 34, C: 11, D: 16, E: 18, F: 30, G: 30, H: 13, I: 30, J: 13, K: 14, L: 13, M: 16, N: 13, O: 13, P: 15, Q: 15 });
calc.getRange('A27:P35').format.wrapText = true;
calc.getRange('A27:P27').format.rowHeight = 34;
calc.getRange('A1:P55').format.verticalAlignment = 'center';
calc.freezePanes.freezeRows(27);

// Reapply title emphasis after all content has been written.
for (const sheet of [readme, printersSheet, materialsSheet, extrasSheet, ratesSheet, calc]) {
  sheet.getRange('A1').format.font = { name: font, size: 16, bold: true, color: colors.navy };
  sheet.getRange('A2').format.font = { name: font, size: 10, italic: true, color: colors.gray };
}

// Explicit number formats for the main reader-facing outputs.
calc.getRange('E5:E7').setNumberFormat('₱#,##0.00');
calc.getRange('E8').setNumberFormat('0.00');
calc.getRange('E9').setNumberFormat('0');
calc.getRange('E10').setNumberFormat('0.000');
calc.getRange('B12').setNumberFormat('0.00%');
calc.getRange('B15:B24').setNumberFormat('0.00');
calc.getRange('E15:E21').setNumberFormat('₱#,##0.00');
calc.getRange('M28:Q35').setNumberFormat('0.00');
calc.getRange('D39:G43').setNumberFormat('₱#,##0.00');
calc.getRange('J39:J40').setNumberFormat('0.00');
calc.getRange('K39:K40').setNumberFormat('₱#,##0.00');
calc.getRange('L39:N40').setNumberFormat('0.00');
calc.getRange('O39:P40').setNumberFormat('₱#,##0.00');

workbook.recalculate();

const inspection = await workbook.inspect({
  kind: 'region,formula',
  sheetId: 'Calculator',
  range: 'A1:P55',
  maxChars: 30000,
  options: { maxResults: 250 },
});
await fs.writeFile(path.join(outDir, 'calculator-inspection.json'), JSON.stringify(inspection, null, 2));

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 200 },
  summary: 'final formula error scan',
  maxChars: 12000,
});
await fs.writeFile(path.join(outDir, 'formula-error-scan.json'), JSON.stringify(errors, null, 2));

for (const sheetName of ['README', 'Calculator', 'Printers', 'Materials', 'Extras', 'Rates']) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(path.join(outDir, `${sheetName.toLowerCase()}-preview.png`), new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outDir, 'SnorlaxGarage_Offline_Print_Calculator.xlsx');
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, inspectionPath: path.join(outDir, 'calculator-inspection.json'), errorScanPath: path.join(outDir, 'formula-error-scan.json') }));
