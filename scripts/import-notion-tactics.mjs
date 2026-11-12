import { readFile, writeFile } from 'node:fs/promises';

const DATABASE_PATH = new URL('../data/official-library.json', import.meta.url);
const SOURCE_PATH = new URL('../data/imports/notion-tactics-2026-07-25.json', import.meta.url);
const database = JSON.parse(await readFile(DATABASE_PATH, 'utf8'));
const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const generals = database.categories.find(category => category.key === 'generals')?.items || [];
const tactics = new Map(source.items.map(item => [item.name, item]));

const setDetail = (item, key, value) => {
  if (!value) return;
  const detail = item.details.find(entry => entry.key === key);
  if (detail) detail.value = value;
  else item.details.push({ key, value });
};

let matched = 0;
let descriptionsUpdated = 0;
const unmatched = [];

for (const general of generals) {
  for (const prefix of ['自带', '传承']) {
    const tacticName = general.details.find(detail => detail.key === `${prefix}战法`)?.value || '';
    if (!tacticName) continue;
    const tactic = tactics.get(tacticName);
    if (!tactic) {
      unmatched.push(`${general.name}：${tacticName}`);
      continue;
    }

    matched += 1;
    setDetail(general, `${prefix}战法分类`, tactic.category);
    setDetail(general, `${prefix}战法目标`, tactic.target);
    setDetail(general, `${prefix}战法发动概率`, tactic.rate);
    if (tactic.description !== '待补充') {
      setDetail(general, `${prefix}战法描述`, tactic.description);
      descriptionsUpdated += 1;
    }
  }
}

database.supplementedSources = [
  ...(database.supplementedSources || []).filter(entry => entry.url !== source.source),
  { url: source.source, updatedAt: source.updatedAt, importedAt: new Date().toISOString() },
];
await writeFile(DATABASE_PATH, `${JSON.stringify(database, null, 2)}\n`, 'utf8');

console.log(`战法匹配：${matched}，有效说明更新：${descriptionsUpdated}，未匹配：${unmatched.length}`);
if (unmatched.length) console.log(unmatched.join('\n'));
