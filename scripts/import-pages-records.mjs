import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const docxPath = process.argv[2] ?? path.join(projectRoot, '抽卡记录 5300.docx');
const currentManifestPath = process.argv[3] ?? path.join(
  projectRoot,
  'backups/20260806-pages-import/manifest-before.json',
);
const outputPath = process.argv[4] ?? path.join(projectRoot, 'data/imports/抽卡记录-5300.json');
const stagedManifestPath = process.argv[5] ?? path.join(
  projectRoot,
  'backups/20260806-pages-import/manifest-after.json',
);

const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024,
});

const decodeXml = (value) => value
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'");

const textFromXml = (value) => [...value.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  .map((match) => decodeXml(match[1]))
  .join('')
  .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
  .trim();

const tables = [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/g)].map((tableMatch) =>
  [...tableMatch[1].matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((cellMatch) =>
      textFromXml(cellMatch[1]),
    ),
  ),
);

// Pages may repeat the same floating table in the exported Word layout.
const uniqueTables = [];
const tableSignatures = new Set();
for (const rows of tables) {
  const signature = JSON.stringify(rows);
  if (!tableSignatures.has(signature)) {
    tableSignatures.add(signature);
    uniqueTables.push(rows);
  }
}

const seasonYear = {
  英雄命世: 2025,
  霸王: 2025,
  长安: 2025,
};

const nameAliases = {
  sp黄月英: 'SP黄月英',
  sp许褚: 'SP许褚',
  sp关羽: 'SP关羽',
  sp袁绍: 'SP袁绍',
  黄浦嵩: '皇甫嵩',
  吕玲琪: '吕玲绮',
  张和: '张郃',
  终会: '钟会',
  诸葛可: '诸葛恪',
  旬攸: '荀攸',
  木鹿: '木鹿大王',
  朵思: '朵思大王',
};

function normalizeSeason(raw) {
  return raw.replace(/\s*20\d{2}年\d{1,2}月\d{1,2}日.*$/, '').trim();
}

function normalizeDate(raw, season) {
  const full = raw.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (full) {
    return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`;
  }

  const dotted = raw.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (dotted && seasonYear[season]) {
    return `${seasonYear[season]}-${dotted[1].padStart(2, '0')}-${dotted[2].padStart(2, '0')}`;
  }

  if (/^\d{3,4}$/.test(raw) && seasonYear[season]) {
    const month = raw.length === 3 ? raw.slice(0, 1) : raw.slice(0, 2);
    const day = raw.length === 3 ? raw.slice(1) : raw.slice(2);
    return `${seasonYear[season]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

function parseGenerals(raw) {
  const cleaned = raw
    .replace(/^18012\s*/, '')
    .replace(/^小卡包\s*1\.3w\s*/i, '')
    .replace(/(寻访|参访)/g, ' ')
    .replace(/[（）]/g, (character) => character === '（' ? '(' : ')')
    .replace(/([\p{L}])\((\d+)\)/gu, '$1$2')
    .trim();

  if (!cleaned) return [];

  const parsed = [];
  for (const token of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(token)) {
      const previous = parsed.at(-1);
      if (previous && previous.drawNumber == null) previous.drawNumber = Number(token);
      continue;
    }

    const numberMatch = token.match(/^(.*?)(\d+)$/);
    const rawName = (numberMatch ? numberMatch[1] : token).trim();
    if (!rawName) continue;
    const general = nameAliases[rawName] ?? rawName.replace(/^sp/, 'SP');
    parsed.push({
      general,
      ...(numberMatch ? { drawNumber: Number(numberMatch[2]) } : {}),
    });
  }
  return parsed;
}

const importedDraws = [];
const skipped = [];
const importedSeasons = [];

for (const rows of uniqueTables) {
  if (!rows.length || rows[0].length < 3) continue;
  const season = normalizeSeason(rows[0][0]);
  if (!season) continue;
  importedSeasons.push(season);

  const periodLabels = rows[0].slice(1, 3);
  for (const [rowIndex, row] of rows.slice(1).entries()) {
    const rawDate = row[0]?.trim() ?? '';
    if (!rawDate && !row.slice(1).some(Boolean)) continue;
    const date = normalizeDate(rawDate, season);
    if (!date) {
      skipped.push({ season, row: rowIndex + 2, cells: row });
      continue;
    }

    for (let column = 1; column <= 2; column += 1) {
      const generals = parseGenerals(row[column] ?? '');
      const label = periodLabels[column - 1] || (column === 1 ? '上午' : '下午');
      const hour = label.includes('晚') ? 20 : label.includes('下') ? 15 : 9;
      generals.forEach((record, recordIndex) => {
        const localTime = `${date}T${String(hour).padStart(2, '0')}:${String(recordIndex).padStart(2, '0')}:00+08:00`;
        importedDraws.push({
          id: `pages-5300-${season}-${date}-${column}-${recordIndex}-${record.general}`,
          general: record.general,
          season,
          createdAt: new Date(localTime).toISOString(),
          ...(record.drawNumber == null ? {} : { drawNumber: record.drawNumber }),
        });
      });
    }
  }
}

const currentManifest = JSON.parse(readFileSync(currentManifestPath, 'utf8'));
const currentDraws = JSON.parse(currentManifest['sanguo.draws.v1'] ?? '[]');
const currentSeasons = JSON.parse(currentManifest['sanguo.seasons.v1'] ?? '[]');

const localParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

function mergeKey(draw) {
  const parts = Object.fromEntries(localParts.formatToParts(new Date(draw.createdAt)).map((part) => [part.type, part.value]));
  const period = Number(parts.hour) < 12 ? '上午' : Number(parts.hour) < 18 ? '下午' : '晚上';
  return [draw.season, `${parts.year}-${parts.month}-${parts.day}`, period, draw.general, draw.drawNumber ?? ''].join('|');
}

const mergedDraws = [...currentDraws];
const knownDraws = new Set(currentDraws.map(mergeKey));
for (const draw of importedDraws) {
  const key = mergeKey(draw);
  if (!knownDraws.has(key)) {
    knownDraws.add(key);
    mergedDraws.push(draw);
  }
}
mergedDraws.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

const mergedSeasons = [...new Set([...importedSeasons, ...currentSeasons])];
const payload = {
  app: 'SanguoDrawLog',
  version: 1,
  exportedAt: new Date().toISOString(),
  seasons: mergedSeasons,
  draws: mergedDraws,
  importSummary: {
    source: docxPath,
    sourceTables: tables.length,
    uniqueTables: uniqueTables.length,
    parsedRecords: importedDraws.length,
    existingRecords: currentDraws.length,
    mergedRecords: mergedDraws.length,
    skipped,
  },
};

const stagedManifest = {
  ...currentManifest,
  'sanguo.draws.v1': JSON.stringify(mergedDraws),
  'sanguo.seasons.v1': JSON.stringify(mergedSeasons),
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(stagedManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`);
console.log(JSON.stringify(payload.importSummary, null, 2));
