import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const DATABASE_PATH = new URL('../data/official-library.json', import.meta.url);
const SOURCE_PATH = new URL('../data/imports/notion-tactics-2026-07-25.json', import.meta.url);
const ASSET_DIR = new URL('../assets/library/', import.meta.url);
const ASSET_MAP_PATH = new URL('../data/official-library-assets.ts', import.meta.url);
const database = JSON.parse(await readFile(DATABASE_PATH, 'utf8'));
const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const generals = database.categories.find(category => category.key === 'generals')?.items || [];
const category = database.categories.find(entry => entry.key === 'tactics');
if (!category) throw new Error('战法库分类不存在');
const troopTactics = new Set(source.typeGroups?.兵种 || []);
const eventTactics = new Set(source.sourceGroups?.事件战法 || []);

const setDetail = (item, key, value) => {
  if (!value) return;
  const detail = item.details.find(entry => entry.key === key);
  if (detail) detail.value = value;
  else item.details.push({ key, value });
};

const tacticSources = new Map();
for (const general of generals) {
  for (const [key, label] of [['自带战法', '自带战法'], ['传承战法', '传承战法']]) {
    const name = general.details.find(detail => detail.key === key)?.value;
    if (!name) continue;
    tacticSources.set(name, [...new Set([...(tacticSources.get(name) || []), label])]);
  }
}

let categoryFilter = category.filters.find(filter => filter.key === 'category');
if (!categoryFilter) {
  categoryFilter = { key: 'category', label: '战法分类', options: [] };
  category.filters.push(categoryFilter);
}
categoryFilter.options = [...new Set(source.items.map(item => item.category).filter(Boolean))]
  .sort((left, right) => left.localeCompare(right, 'zh-CN'));

let typeFilter = category.filters.find(filter => filter.key === 'type');
if (!typeFilter) {
  typeFilter = { key: 'type', label: '战法类型', options: [] };
  category.filters.unshift(typeFilter);
}
if (!typeFilter.options.includes('兵种')) {
  const insertAt = typeFilter.options.indexOf('内政');
  typeFilter.options.splice(insertAt >= 0 ? insertAt : typeFilter.options.length, 0, '兵种');
}

let sourceFilter = category.filters.find(filter => filter.key === 'source');
if (!sourceFilter) {
  sourceFilter = { key: 'source', label: '战法来源', options: [] };
  category.filters.push(sourceFilter);
}
if (!sourceFilter.options.includes('事件战法')) sourceFilter.options.push('事件战法');

const downloads = [];
let added = 0;
let updated = 0;
for (const sourceItem of source.items) {
  let item = category.items.find(entry => entry.name === sourceItem.name);
  if (!item) {
    item = {
      id: `notion-tactic-${sourceItem.sourceBlockId}`,
      name: sourceItem.name,
      filters: { type: [], quality: [], source: [] },
      details: [],
      imageAssetKey: '',
      artworkAssetKey: '',
    };
    category.items.push(item);
    added += 1;
  } else {
    updated += 1;
  }

  const sources = [
    ...(tacticSources.get(sourceItem.name) || []),
    ...(eventTactics.has(sourceItem.name) ? ['事件战法'] : []),
  ];
  if (troopTactics.has(sourceItem.name)) item.filters.type = ['兵种'];
  item.filters.category = sourceItem.category ? [sourceItem.category] : [];
  item.filters.source = [...new Set([...(item.filters.source || []), ...sources])];
  setDetail(item, '来源武将', sourceItem.owner);
  if (troopTactics.has(sourceItem.name)) setDetail(item, '战法类型', '兵种');
  setDetail(item, '战法分类', sourceItem.category);
  setDetail(item, '战法目标', sourceItem.target);
  setDetail(item, '发动概率', sourceItem.rate);
  setDetail(item, '战法来源', item.filters.source.join('、'));
  if (sourceItem.description !== '待补充') setDetail(item, '战法描述', sourceItem.description);

  if (!item.imageAssetKey && sourceItem.imageUrl) downloads.push({ sourceItem, item });
}

await mkdir(ASSET_DIR, { recursive: true });
let cursor = 0;
let downloaded = 0;
const workers = Array.from({ length: Math.min(6, downloads.length) }, async () => {
  while (cursor < downloads.length) {
    const index = cursor++;
    const { sourceItem, item } = downloads[index];
    const assetId = `notion-tactic-${sourceItem.sourceBlockId}`;
    const filename = `${assetId}-icon.png`;
    const url = new URL(sourceItem.imageUrl, 'https://spacekid.notion.site');
    url.searchParams.set('width', '512');
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`${sourceItem.name}图标下载失败：HTTP ${response.status}`);
    await writeFile(new URL(filename, ASSET_DIR), Buffer.from(await response.arrayBuffer()));
    item.imageAssetKey = `${assetId}:icon`;
    downloaded += 1;
  }
});
await Promise.all(workers);

category.items.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
await writeFile(DATABASE_PATH, `${JSON.stringify(database, null, 2)}\n`, 'utf8');

const files = await readdir(ASSET_DIR);
const entries = files.flatMap(filename => {
  const match = filename.match(/^(.+)-(icon|art)\.(png|jpe?g|webp|gif)$/i);
  return match ? [[`${match[1]}:${match[2]}`, filename]] : [];
});
const assetMap = [
  "import { ImageSourcePropType } from 'react-native';",
  '',
  'export const officialLibraryAssets: Record<string, ImageSourcePropType> = {',
  ...entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, filename]) => `  ${JSON.stringify(key)}: require(${JSON.stringify(`../assets/library/${filename}`)}),`),
  '};',
  '',
].join('\n');
await writeFile(ASSET_MAP_PATH, assetMap, 'utf8');

console.log(`战法库更新：${updated}，新增：${added}，新图标：${downloaded}，总数：${category.items.length}`);
