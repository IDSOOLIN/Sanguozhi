import { mkdir, writeFile } from 'node:fs/promises';

const API_URL = 'https://galaxias-api.lingxigames.com/ds/ajax/endpoint.json';
const SOURCE_URL = 'https://sgzzlb.lingxigames.com/station/';
const OUTPUT_PATH = new URL('../data/official-library.json', import.meta.url);
const ASSET_DIR = new URL('../assets/library/', import.meta.url);
const ASSET_MAP_PATH = new URL('../data/official-library-assets.ts', import.meta.url);
const assetEntries = [];

const categories = [
  {
    key: 'generals',
    label: '武将库',
    tableId: '350659087930767364',
    all: '350958444404029449,350958444404029450,350958444404029451,350958444404029452',
    filters: [
      {
        key: 'faction', label: '阵营', options: [
          ['魏', '350958444404029449'], ['蜀', '350958444404029450'],
          ['吴', '350958444404029451'], ['群', '350958444404029452'],
        ],
      },
      {
        key: 'star', label: '星级', options: [
          ['5星', '350958444399835143'],
        ],
      },
      {
        key: 'cost', label: '统御', options: [
          ['3', '350958444412418055'], ['4', '350958444412418056'],
          ['5', '350958444412418057'], ['6', '350958444412418058'],
          ['7', '350958444412418059'],
        ],
      },
      {
        key: 'tag', label: '武将标签', options: [
          ['盾', '358567365744249865'], ['辅', '358567365744249866'],
          ['黄', '358567365744249867'], ['兼', '358567365744249868'],
          ['控', '358567365744249869'], ['蛮', '358567365744249870'],
          ['魅', '358567365744249871'], ['谋', '358567365744249872'],
          ['武', '358567365744249873'], ['医', '358567365744249874'],
          ['战', '358567365744249875'], ['政', '358567365744249876'],
          ['卒', '358567365744249877'], ['仙', '358567365744249878'],
          ['纪', '358567365744249879'],
        ],
      },
    ],
  },
  {
    key: 'tactics',
    label: '战法库',
    tableId: '350659307657771017',
    all: '352052655832446980,352052655832446981',
    filters: [
      {
        key: 'type', label: '战法类型', options: [
          ['指挥', '352052655819864069'], ['主动', '352052655819864070'],
          ['突击', '352052655819864071'], ['被动', '352052655819864072'],
          ['内政', '352052655819864073'], ['战前', '352052655819864074'],
          ['普攻', '352052655819864075'], ['阵法', '352052655819864077'],
        ],
      },
      {
        key: 'quality', label: '战法品质', options: [
          ['S', '352052655828252673'], ['A', '352052655828252674'],
          ['B', '352052655828252675'],
        ],
      },
      {
        key: 'source', label: '战法来源', options: [
          ['自带战法', '352052655832446980'], ['传承战法', '352052655832446981'],
        ],
      },
    ],
  },
  {
    key: 'equipment',
    label: '装备库',
    tableId: '350659411548294145',
    all: '352054216407136265,352054216407136266,352054216407136267,352054216407136268',
    filters: [
      {
        key: 'quality', label: '装备品质', options: [
          ['凡品', '352054216398747656'], ['精良', '352054216398747657'],
          ['上品', '352054216398747658'], ['珍品', '352054216398747659'],
        ],
      },
      {
        key: 'type', label: '装备类型', options: [
          ['武器', '352054216407136265'], ['防具', '352054216407136266'],
          ['坐骑', '352054216407136267'], ['宝物', '352054216407136268'],
        ],
      },
    ],
  },
  {
    key: 'troops',
    label: '兵种库',
    tableId: '553976671589912577',
    all: '553977003162226697,553977003162226698,553977003162226699',
    filters: [
      {
        key: 'restriction', label: '兵种限制', options: [
          ['骑兵', '553977003132866568'], ['盾兵', '554017620569384455'],
          ['弓兵', '554017620569384456'], ['枪兵', '554017620569384457'],
        ],
      },
      {
        key: 'source', label: '战法来源', options: [
          ['自带战法', '553977003162226697'], ['事件战法', '553977003162226699'],
        ],
      },
    ],
  },
];

async function request(api, params) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api, params: { gameId: 10000100, ...params } }),
      });
      if (!response.ok) throw new Error(`Official API returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.resultDesc || `Official API error for ${api}`);
      return payload.result;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mapLimit(items, limit, task) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

const localAssetExtension = value => {
  try {
    const match = new URL(value).pathname.match(/\.(png|jpe?g|webp|gif)$/i);
    return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.png';
  } catch {
    return '.png';
  }
};

async function downloadAsset(value, itemId, kind) {
  if (!value) return '';
  const url = value.replace(/^http:/, 'https:');
  const filename = `${itemId}-${kind}${localAssetExtension(url)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFile(new URL(filename, ASSET_DIR), Buffer.from(await response.arrayBuffer()));
    const key = `${itemId}:${kind}`;
    assetEntries.push([key, filename]);
    return key;
  } catch (error) {
    console.warn(`Image skipped ${url}: ${error.message}`);
    return '';
  }
}

async function fetchAll(tableId, categoryIds) {
  const items = [];
  let page = 0;
  let totalCount = Infinity;
  while (items.length < totalCount) {
    const result = await request('/api/l/owresource/getQueryDataInfoListByCategory', {
      tbId: tableId,
      categoryIds,
      page,
      size: 20,
    });
    totalCount = result.totalCount || 0;
    const pageItems = result.items || [];
    items.push(...pageItems);
    if (!pageItems.length) break;
    page += 1;
  }
  return items;
}

function normalizeItem(item, tableId) {
  const icon = item.details.find(detail => detail.key === '移动icon')
    || item.details.find(detail => detail.key === 'PCicon')
    || item.details.find(detail => detail.val);
  return {
    id: item.priRowId,
    name: item.priVal,
    image: icon?.val?.replace(/^http:/, 'https:') || '',
    filters: {},
    details: [],
    imageAssetKey: '',
    artworkAssetKey: '',
    officialUrl: `${SOURCE_URL}?tbid=${tableId}&rowid=${item.priRowId}`,
  };
}

async function syncCategory(category) {
  const allItems = await fetchAll(category.tableId, category.all);
  const itemMap = new Map(allItems.map(item => [item.priRowId, normalizeItem(item, category.tableId)]));

  for (const filter of category.filters) {
    for (const [label, categoryId] of filter.options) {
      const matchingItems = await fetchAll(category.tableId, categoryId);
      for (const matchingItem of matchingItems) {
        if (!itemMap.has(matchingItem.priRowId)) {
          itemMap.set(matchingItem.priRowId, normalizeItem(matchingItem, category.tableId));
        }
        const item = itemMap.get(matchingItem.priRowId);
        item.filters[filter.key] = [...new Set([...(item.filters[filter.key] || []), label])];
      }
    }
  }

  const items = [...itemMap.values()];
  let completed = 0;
  await mapLimit(items, 6, async item => {
    const result = await request('/api/l/owresource/getQueryDataInfoByPriId', {
      tbId: category.tableId,
      priRowId: item.id,
    });
    const details = result.items?.[0]?.details || [];
    item.details = details
      .filter(detail => detail.val && (detail.colType === 2 || detail.colType === 3))
      .map(detail => ({
        key: detail.key === 'cost' ? '统御' : detail.key,
        value: detail.val,
      }));

    const artwork = details.find(detail => detail.key === '移动立绘' && detail.val)
      || details.find(detail => detail.key === 'PC立绘' && detail.val);
    item.imageAssetKey = await downloadAsset(item.image, item.id, 'icon');
    item.artworkAssetKey = await downloadAsset(artwork?.val || '', item.id, 'art');
    delete item.image;
    delete item.officialUrl;
    completed += 1;
    if (completed % 25 === 0 || completed === items.length) {
      console.log(`${category.label} 详情: ${completed}/${items.length}`);
    }
  });

  return {
    key: category.key,
    label: category.label,
    filters: category.filters.map(filter => ({
      key: filter.key,
      label: filter.label,
      options: filter.options.map(([label]) => label),
    })),
    items: items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
  };
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await mkdir(ASSET_DIR, { recursive: true });

const syncedCategories = [];
for (const category of categories) {
  const result = await syncCategory(category);
  syncedCategories.push(result);
  console.log(`${result.label}: ${result.items.length}`);
}

const output = {
  source: SOURCE_URL,
  syncedAt: new Date().toISOString(),
  categories: syncedCategories,
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
const assetMap = [
  "import { ImageSourcePropType } from 'react-native';",
  '',
  'export const officialLibraryAssets: Record<string, ImageSourcePropType> = {',
  ...assetEntries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, filename]) => `  ${JSON.stringify(key)}: require(${JSON.stringify(`../assets/library/${filename}`)}),`),
  '};',
  '',
].join('\n');
await writeFile(ASSET_MAP_PATH, assetMap, 'utf8');
console.log(`Saved ${OUTPUT_PATH.pathname}`);
console.log(`Bundled ${assetEntries.length} local images`);
