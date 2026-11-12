import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const DATABASE_PATH = new URL('../data/official-library.json', import.meta.url);
const SOURCE_PATH = new URL('../data/imports/notion-generals-2026-07-25.json', import.meta.url);
const ASSET_DIR = new URL('../assets/library/', import.meta.url);
const ASSET_MAP_PATH = new URL('../data/official-library-assets.ts', import.meta.url);
const alias = new Map([['SP刘晔', '刘晔']]);
const attributeNames = ['武力', '智力', '统率', '速度', '政治', '魅力'];
const troopNames = ['骑兵', '盾兵', '弓兵', '枪兵', '器械', '水军'];
const tacticNameAliases = new Map([['鸠毒', '鸩毒']]);

const database = JSON.parse(await readFile(DATABASE_PATH, 'utf8'));
const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const category = database.categories.find(item => item.key === 'generals');
if (!category) throw new Error('武将库分类不存在');

const factionFilter = category.filters.find(filter => filter.key === 'faction');
if (factionFilter && !factionFilter.options.includes('汉')) factionFilter.options.push('汉');

const setDetail = (item, key, value) => {
  if (!value) return;
  const detail = item.details.find(entry => entry.key === key);
  if (detail) detail.value = value;
  else item.details.push({ key, value });
};

const downloadIcon = async (sourceItem, item) => {
  if (item.imageAssetKey || !sourceItem.imageUrl) return false;
  const assetId = `notion-${sourceItem.sourceBlockId}`;
  const filename = `${assetId}-icon.png`;
  const url = new URL(sourceItem.imageUrl, 'https://spacekid.notion.site');
  url.searchParams.set('width', '512');
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${sourceItem.name}头像下载失败：HTTP ${response.status}`);
  await writeFile(new URL(filename, ASSET_DIR), Buffer.from(await response.arrayBuffer()));
  item.imageAssetKey = `${assetId}:icon`;
  return true;
};

await mkdir(ASSET_DIR, { recursive: true });
let added = 0;
let updated = 0;
let downloaded = 0;

for (const sourceItem of source.items) {
  const localName = alias.get(sourceItem.name) || sourceItem.name;
  let item = category.items.find(entry => entry.name === localName);
  if (!item) {
    item = {
      id: `notion-${sourceItem.sourceBlockId}`,
      name: localName,
      filters: {},
      details: [],
      imageAssetKey: '',
      artworkAssetKey: '',
    };
    category.items.push(item);
    added += 1;
  } else {
    updated += 1;
  }

  item.filters.faction = [sourceItem.faction];
  item.filters.star = ['5星'];
  item.filters.cost = [sourceItem.cost];
  item.filters.tag = sourceItem.tags;
  setDetail(item, '阵营', sourceItem.faction);
  setDetail(item, '星级', '5星');
  setDetail(item, '统御', sourceItem.cost);
  setDetail(item, '武将标签', sourceItem.tags.join('、'));
  setDetail(item, '自带战法', tacticNameAliases.get(sourceItem.ownTactic) || sourceItem.ownTactic);
  setDetail(item, '传承战法', tacticNameAliases.get(sourceItem.inheritedTactic) || sourceItem.inheritedTactic);

  for (const troop of troopNames) setDetail(item, `兵种适性${troop}`, sourceItem.troop[troop]);
  for (const attribute of attributeNames) {
    setDetail(item, attribute, sourceItem.attributes[attribute]);
    setDetail(item, `${attribute}成长`, sourceItem.growth[attribute]);
    setDetail(item, `满级${attribute}`, sourceItem.maxAttributes[attribute]);
  }

  if (await downloadIcon(sourceItem, item)) downloaded += 1;
}

category.items.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
database.supplementedSources = [
  ...(database.supplementedSources || []).filter(entry => entry.url !== source.source),
  { url: source.source, updatedAt: source.updatedAt, importedAt: new Date().toISOString() },
];
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

console.log(`武将资料更新：${updated}，新增：${added}，新头像：${downloaded}，总数：${category.items.length}`);
