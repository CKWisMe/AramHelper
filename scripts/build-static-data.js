const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(ROOT, 'data');
const CHAMPION_DATA_ROOT = path.join(DATA_ROOT, 'champions');
const STATIC_TTL_MS = 30 * 60 * 1000;
const RECENT_FEATURED = ['Lux', 'Jinx', 'Nautilus', 'Seraphine', 'Ahri', 'Brand', 'Ashe', 'Varus'];
const BUILD_CONCURRENCY = 10;

const cache = {
  shared: new Map()
};

function now() {
  return Date.now();
}

function normalizeQuery(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function championSlug(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'&]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function displayPatch(statsPatch) {
  return statsPatch.replace('_', '.');
}

function statPatchFromAsset(version) {
  const [major, minor] = String(version).split('.');
  return `${major}_${minor}`;
}

function getApiTrack(version) {
  const parts = String(version).split('.');
  return `${parts[0]}.${parts[1]}`;
}

async function fetchJson(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0',
          accept: 'application/json,text/plain,*/*'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(400 * attempt);
      }
    }
  }

  throw lastError;
}

async function getCachedJson(url, ttlMs = STATIC_TTL_MS) {
  const hit = cache.shared.get(url);
  if (hit && hit.expiresAt > now()) {
    return hit.data;
  }

  const data = await fetchJson(url);
  cache.shared.set(url, {
    data,
    expiresAt: now() + ttlMs
  });
  return data;
}

function buildRuneMaps(runeTrees) {
  const treeById = new Map();
  const runeById = new Map();

  runeTrees.forEach((tree) => {
    treeById.set(tree.id, {
      id: tree.id,
      key: tree.key,
      name: tree.name,
      icon: `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`
    });

    tree.slots.forEach((slot) => {
      slot.runes.forEach((rune) => {
        runeById.set(rune.id, {
          id: rune.id,
          name: rune.name,
          shortDesc: rune.shortDesc,
          longDesc: rune.longDesc,
          icon: `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`,
          treeId: tree.id
        });
      });
    });
  });

  return { treeById, runeById };
}

function buildSpellMap(summonerData, assetVersion) {
  const spellById = new Map();
  Object.values(summonerData.data).forEach((spell) => {
    spellById.set(Number(spell.key), {
      id: Number(spell.key),
      name: spell.name,
      description: spell.description,
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${assetVersion}/img/spell/${spell.image.full}`
    });
  });
  return spellById;
}

function resolveItems(itemData, ids, assetVersion) {
  return ids
    .map((itemId) => {
      const record = itemData.data[String(itemId)];
      if (!record) {
        return null;
      }

      return {
        id: Number(itemId),
        name: record.name,
        description: record.plaintext || '',
        tooltipHtml: buildItemTooltipHtml(record),
        imageUrl: `https://ddragon.leagueoflegends.com/cdn/${assetVersion}/img/item/${record.image.full}`
      };
    })
    .filter(Boolean);
}

function buildItemTooltipHtml(record) {
  const body = formatItemDescriptionHtml(record.description || '');
  const fallback = record.plaintext ? `<p>${escapeHtml(record.plaintext)}</p>` : '';
  const cost = record.gold?.total ? `<span>總價 ${record.gold.total}</span>` : '';
  const sell = record.gold?.sell ? `<span>售價 ${record.gold.sell}</span>` : '';
  const priceLine = cost || sell
    ? `<div class="item-tooltip-meta">${[cost, sell].filter(Boolean).join('<span class="item-tooltip-dot">•</span>')}</div>`
    : '';

  return `
    <div class="item-tooltip-header">
      <div class="item-tooltip-name">${escapeHtml(record.name || '')}</div>
      ${priceLine}
    </div>
    <div class="item-tooltip-body">
      ${body || fallback || '<p>目前沒有額外說明。</p>'}
    </div>
  `.trim();
}

function formatItemDescriptionHtml(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .replace(/<br\s*\/?>/gi, '<br />')
    .replace(/<mainText>/gi, '<div>')
    .replace(/<\/mainText>/gi, '</div>')
    .replace(/<stats>/gi, '<div class="item-tooltip-stats">')
    .replace(/<\/stats>/gi, '</div>')
    .replace(/<passive>/gi, '<span class="item-tooltip-label passive">被動</span>')
    .replace(/<\/passive>/gi, '')
    .replace(/<active>/gi, '<span class="item-tooltip-label active">主動</span>')
    .replace(/<\/active>/gi, '')
    .replace(/<attention>/gi, '<span class="item-tooltip-emphasis">')
    .replace(/<\/attention>/gi, '</span>')
    .replace(/<rarityMythic>/gi, '<span class="item-tooltip-rarity mythic">')
    .replace(/<\/rarityMythic>/gi, '</span>')
    .replace(/<rarityLegendary>/gi, '<span class="item-tooltip-rarity legendary">')
    .replace(/<\/rarityLegendary>/gi, '</span>')
    .replace(/<flavorText>/gi, '<div class="item-tooltip-flavor">')
    .replace(/<\/flavorText>/gi, '</div>')
    .replace(/<rules>/gi, '<div class="item-tooltip-rules">')
    .replace(/<\/rules>/gi, '</div>');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveSummoners(spellMap, ids) {
  return ids
    .map((spellId) => spellMap.get(Number(spellId)))
    .filter(Boolean);
}

function resolveRuneSelection(runeMaps, primaryTreeId, secondaryTreeId, runeIds, shardIds) {
  const primaryTree = runeMaps.treeById.get(Number(primaryTreeId)) || null;
  const secondaryTree = runeMaps.treeById.get(Number(secondaryTreeId)) || null;
  const runes = runeIds.map((runeId) => runeMaps.runeById.get(Number(runeId))).filter(Boolean);

  const primaryRunes = runes.filter((rune) => rune.treeId === Number(primaryTreeId));
  const secondaryRunes = runes.filter((rune) => rune.treeId === Number(secondaryTreeId));
  const keystone = primaryRunes[0] || null;

  return {
    primaryTree,
    secondaryTree,
    keystone,
    primaryRunes,
    secondaryRunes,
    statShards: shardIds.map((id) => ({
      id,
      name: STAT_SHARD_NAMES[id] || id,
      icon: STAT_SHARD_ICONS[id] || null
    }))
  };
}

function describeModifier(label, value, inverse = false) {
  if (value === 1 || value === undefined || value === null) {
    return null;
  }

  const delta = Math.round(Math.abs(value - 1) * 100);
  const direction = value > 1 ? '增加' : '減少';

  if (inverse) {
    return `${label}${direction} ${delta}%`;
  }

  return `${label}${direction} ${delta}%`;
}

function buildBalanceSummary(balanceData) {
  if (!balanceData || !balanceData.changes) {
    return {
      changed: false,
      entries: [],
      raw: balanceData || null
    };
  }

  const entries = [
    describeModifier('造成傷害', balanceData.damage_dealt),
    describeModifier('承受傷害', balanceData.damage_taken),
    describeModifier('治療效果', balanceData.damage_healing),
    describeModifier('護盾效果', balanceData.damage_shielding),
    describeModifier('攻速倍率', balanceData.total_attack_speed),
    describeModifier('技能急速', balanceData.ability_haste),
    describeModifier('能量回復', balanceData.energy_regeneration),
    describeModifier('韌性', balanceData.tenacity)
  ].filter(Boolean);

  if (balanceData.abilities) {
    entries.push(balanceData.abilities);
  }

  return {
    changed: entries.length > 0,
    entries,
    raw: balanceData
  };
}

function pickBestBuild(overviewData) {
  const candidates = Object.entries(overviewData)
    .map(([bucket, payload]) => {
      const entry = payload?.['8']?.['6'];
      if (!Array.isArray(entry) || !Array.isArray(entry[0])) {
        return null;
      }

      const [stats, updatedAt] = entry;
      const runeStats = stats[0] || [0, 0];
      const games = Number(runeStats[0] || 0) + Number(runeStats[1] || 0);

      return {
        bucket,
        updatedAt,
        stats,
        games
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.games - left.games);

  return candidates[0] || null;
}

function dedupeSituationalItems(itemGroups, excludedIds, itemData, assetVersion) {
  const scores = new Map();

  itemGroups.flat().forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 3) {
      return;
    }

    const [itemId, wins, losses] = entry;
    if (excludedIds.has(Number(itemId))) {
      return;
    }

    const sample = Number(wins || 0) + Number(losses || 0);
    scores.set(Number(itemId), (scores.get(Number(itemId)) || 0) + sample);
  });

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([itemId]) => itemId)
    .map((itemId) => resolveItems(itemData, [itemId], assetVersion)[0])
    .filter(Boolean);
}

function buildLateGameSections(itemGroups, excludedIds, itemData, assetVersion) {
  if (!Array.isArray(itemGroups)) {
    return [];
  }

  const usedTitles = new Map();

  return itemGroups
    .map((group, index) => {
      if (!Array.isArray(group)) {
        return null;
      }

      const scores = new Map();

      group.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 3) {
          return;
        }

        const itemId = Number(entry[0]);
        if (excludedIds.has(itemId)) {
          return;
        }

        const sample = Number(entry[1] || 0) + Number(entry[2] || 0);
        scores.set(itemId, (scores.get(itemId) || 0) + sample);
      });

      const items = [...scores.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([itemId]) => resolveItems(itemData, [itemId], assetVersion)[0])
        .filter(Boolean);

      if (!items.length) {
        return null;
      }

      const descriptor = describeLateGameSection(items, itemData);
      let title = descriptor.title;
      if (usedTitles.has(title)) {
        title = `${lateGamePhaseLabel(index)}${title}`;
      }
      usedTitles.set(title, true);

      return {
        title,
        note: descriptor.note,
        items
      };
    })
    .filter(Boolean);
}

function describeLateGameSection(items, itemData) {
  const scores = {
    burst: 0,
    antiTank: 0,
    defense: 0,
    sustain: 0,
    utility: 0
  };

  items.forEach((item) => {
    const record = itemData.data[String(item.id)] || {};
    const tags = new Set(record.tags || []);
    const text = stripHtml(`${record.name || ''} ${record.plaintext || ''} ${record.description || ''}`);

    if (hasAnyTag(tags, ['Armor', 'SpellBlock', 'Health'])) {
      scores.defense += 3;
    }

    if (hasAnyTag(tags, ['ArmorPenetration', 'MagicPenetration'])) {
      scores.antiTank += 4;
    }

    if (hasAnyTag(tags, ['Damage', 'CriticalStrike', 'AttackSpeed', 'AbilityPower', 'SpellDamage', 'OnHit'])) {
      scores.burst += 2;
    }

    if (hasAnyTag(tags, ['LifeSteal', 'SpellVamp', 'Omnivamp'])) {
      scores.sustain += 3;
    }

    if (hasAnyTag(tags, ['Mana', 'ManaRegen', 'CooldownReduction', 'AbilityHaste', 'Active'])) {
      scores.utility += 2;
    }

    if (/穿甲|物穿|魔穿|百分比生命|最大生命|碎甲|破甲|坦克|斬切/.test(text)) {
      scores.antiTank += 3;
    }

    if (/護甲|魔防|雙防|護盾|復活|免疫|減傷|韌性|生命/.test(text)) {
      scores.defense += 2;
    }

    if (/吸血|回復|治療|續戰|續航/.test(text)) {
      scores.sustain += 2;
    }

    if (/重創|緩速|加速|跑速|控制|沉默|禁錮|削抗|燃燒|探視/.test(text)) {
      scores.utility += 2;
    }

    if (/暴擊|爆發|致命|收割|死帽|額外傷害|處決|斬殺/.test(text)) {
      scores.burst += 3;
    }
  });

  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const top = ranked[0]?.[0] || 'burst';

  if (top === 'antiTank') {
    return {
      title: '對坦',
      note: '對面有 2 隻以上前排，或你開始打不動鬥士、坦克時，就優先換這組。'
    };
  }

  if (top === 'defense') {
    return {
      title: '保命',
      note: '對面刺客一直切後排，或你常常一進場就蒸發時，先補這組保命。'
    };
  }

  if (top === 'sustain') {
    return {
      title: '拉扯續航',
      note: '會戰常常拉很久，或你需要邊打邊回、一直站場輸出時，就換這組。'
    };
  }

  if (top === 'utility') {
    return {
      title: '功能反制',
      note: '對面回血很兇，或你隊伍缺重創、緩速、功能裝時，優先補這組。'
    };
  }

  return {
    title: '順風收頭',
    note: '你方已經打出優勢，想更快秒後排或直接收頭滾雪球時，就優先這組。'
  };
}

function hasAnyTag(tags, values) {
  return values.some((value) => tags.has(value));
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function lateGamePhaseLabel(index) {
  const labels = ['中後期', '後期', '滿裝'];
  return labels[index] || '後期';
}

function buildSkillOrder(skillStats, championSpells) {
  const sequence = Array.isArray(skillStats?.[2]) ? skillStats[2] : [];
  const priority = String(skillStats?.[3] || '')
    .split('')
    .filter(Boolean)
    .join(' > ');

  const spellNames = {
    Q: championSpells?.[0]?.name || 'Q',
    W: championSpells?.[1]?.name || 'W',
    E: championSpells?.[2]?.name || 'E',
    R: championSpells?.[3]?.name || 'R'
  };

  return {
    priority,
    sequence,
    firstLevels: sequence.slice(0, 9),
    spellNames
  };
}

function buildChampionTips(payload, balanceSummary) {
  const runeStats = payload[0] || [0, 0];
  const starter = payload[2]?.[2] || [];
  const core = payload[3]?.[2] || [];
  const skillOrder = payload[4]?.[3] || '';
  const games = Number(runeStats[0] || 0) + Number(runeStats[1] || 0);
  const winRate = games ? Number(runeStats[0] || 0) / games : 0;

  const tips = [
    `這套主流配置樣本約 ${games.toLocaleString('en-US')} 場，配置勝率 ${(winRate * 100).toFixed(1)}%。`,
    starter.length ? `起手通常從 ${starter.length} 件裝備開局，優先照系統推薦順序購買。` : null,
    core.length ? '核心成裝以前 3 件為主，先把主力傷害與鞋子湊齊，再補功能裝。' : null,
    skillOrder ? `技能主升順序多半是 ${skillOrder.split('').join(' > ')}，照前 9 等順序點法最穩。` : null,
    balanceSummary.changed ? '這隻英雄目前有 ARAM 專屬平衡調整，進場前記得看一下面板。' : '目前沒有顯著的 ARAM 專屬平衡調整。'
  ];

  return tips.filter(Boolean);
}

async function getMeta() {
  const versionsUrl = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/versions.json';
  const patchesUrl = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg/patches.json';
  const seoUrl = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/seo-champion-names.json';

  const [assetVersions, statsPatches, seoMap] = await Promise.all([
    getCachedJson(versionsUrl),
    getCachedJson(patchesUrl),
    getCachedJson(seoUrl)
  ]);

  const assetVersion = assetVersions[0];
  const statsPatch = statsPatches[0] || statPatchFromAsset(assetVersion);
  const apiVersionsUrl = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg/ugg-api-versions.json';
  const apiVersions = await getCachedJson(apiVersionsUrl);
  const overviewVersion = apiVersions[statsPatch]?.overview || '1.5.0';
  const apiTrack = getApiTrack(overviewVersion);

  const championEnUrl = `https://static.bigbrain.gg/assets/lol/riot_static/${assetVersion}/data/en_US/champion.json`;
  const championZhUrl = `https://static.bigbrain.gg/assets/lol/riot_static/${assetVersion}/data/zh_TW/champion.json`;
  const itemUrl = `https://static.bigbrain.gg/assets/lol/riot_static/${assetVersion}/data/zh_TW/item.json`;
  const summonerUrl = `https://static.bigbrain.gg/assets/lol/riot_static/${assetVersion}/data/zh_TW/summoner.json`;
  const runesUrl = `https://static.bigbrain.gg/assets/lol/riot_static/${assetVersion}/data/zh_TW/runesReforged.json`;
  const aramBalanceUrl = 'https://static.bigbrain.gg/assets/lol/queue_type_champion_changes/aram/latest.json';

  const [championEn, championZh, itemData, summonerData, runeData, aramBalance] = await Promise.all([
    getCachedJson(championEnUrl),
    getCachedJson(championZhUrl),
    getCachedJson(itemUrl),
    getCachedJson(summonerUrl),
    getCachedJson(runesUrl),
    getCachedJson(aramBalanceUrl)
  ]);

  const spellMap = buildSpellMap(summonerData, assetVersion);
  const runeMaps = buildRuneMaps(runeData);

  const champions = Object.values(championEn.data)
    .map((entry) => {
      const zhEntry = championZh.data[entry.id];
      const seoEntry = seoMap[String(entry.key)] || {};
      const englishRouteName = seoEntry.name || entry.name;
      const aliases = [
        entry.name,
        entry.id,
        zhEntry?.name,
        zhEntry?.title,
        entry.title,
        seoEntry.altName,
        seoEntry.altName2,
        englishRouteName
      ].filter(Boolean);

      return {
        key: Number(entry.key),
        id: entry.id,
        slug: championSlug(englishRouteName),
        nameEn: englishRouteName,
        nameZh: zhEntry?.name || entry.name,
        titleEn: entry.title,
        titleZh: zhEntry?.title || entry.title,
        imageUrl: `https://ddragon.leagueoflegends.com/cdn/${assetVersion}/img/champion/${entry.image.full}`,
        splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${entry.id}_0.jpg`,
        aliases,
        normalized: aliases.map(normalizeQuery)
      };
    })
    .sort((left, right) => left.nameEn.localeCompare(right.nameEn, 'en'));

  const championById = new Map(champions.map((champion) => [champion.id, champion]));
  const featured = RECENT_FEATURED.map((name) => championById.get(name)).filter(Boolean);

  return {
    patch: {
      statsPatch,
      statsPatchLabel: displayPatch(statsPatch),
      assetVersion,
      overviewVersion,
      apiTrack
    },
    champions,
    featured,
    itemData,
    spellMap,
    runeMaps,
    aramBalance
  };
}

async function buildChampionData(meta, champion) {
  const overviewUrl = `https://stats2.u.gg/lol/${meta.patch.apiTrack}/overview/${meta.patch.statsPatch}/normal_aram/${champion.key}/${meta.patch.overviewVersion}.json`;
  const championDetailUrl = `https://static.bigbrain.gg/assets/lol/riot_static/${meta.patch.assetVersion}/data/zh_TW/champion/${champion.id}.json`;

  const [overviewData, championDetail] = await Promise.all([
    fetchJson(overviewUrl),
    getCachedJson(championDetailUrl, STATIC_TTL_MS)
  ]);

  const bestBuild = pickBestBuild(overviewData);
  if (!bestBuild) {
    return {
      error: 'NO_ARAM_DATA',
      message: `${champion.nameZh} 目前沒有可用的 ARAM 即時資料。`,
      patch: meta.patch,
      champion: {
        key: champion.key,
        id: champion.id,
        slug: champion.slug,
        nameZh: champion.nameZh,
        nameEn: champion.nameEn,
        titleZh: champion.titleZh,
        titleEn: champion.titleEn,
        imageUrl: champion.imageUrl,
        splashUrl: champion.splashUrl
      }
    };
  }

  const payload = bestBuild.stats;
  const championRecord = championDetail.data[champion.id];
  const starterItems = resolveItems(meta.itemData, payload[2]?.[2] || [], meta.patch.assetVersion);
  const coreItems = resolveItems(meta.itemData, payload[3]?.[2] || [], meta.patch.assetVersion);
  const excludedIds = new Set([...starterItems, ...coreItems].map((item) => item.id));
  const situationalItems = dedupeSituationalItems(payload[5] || [], excludedIds, meta.itemData, meta.patch.assetVersion);
  const lateGameBuilds = buildLateGameSections(payload[5] || [], excludedIds, meta.itemData, meta.patch.assetVersion);
  const runes = resolveRuneSelection(
    meta.runeMaps,
    payload[0]?.[2],
    payload[0]?.[3],
    payload[0]?.[4] || [],
    payload[8]?.[2] || []
  );
  const summoners = resolveSummoners(meta.spellMap, payload[1]?.[2] || []);
  const skillOrder = buildSkillOrder(payload[4], championRecord.spells);
  const balanceSummary = buildBalanceSummary(meta.aramBalance[champion.slug] || meta.aramBalance[champion.id.toLowerCase()] || null);
  const sampleGames = Number(payload[0]?.[0] || 0) + Number(payload[0]?.[1] || 0);
  const sampleWins = Number(payload[0]?.[0] || 0);
  const sampleLosses = Number(payload[0]?.[1] || 0);
  const tips = buildChampionTips(payload, balanceSummary);

  return {
    patch: {
      ...meta.patch,
      sourceUpdatedAt: bestBuild.updatedAt
    },
    source: {
      provider: 'U.GG stats2 + Riot static',
      championUrl: `https://u.gg/lol/champions/aram/${champion.slug}-aram`,
      overviewUrl
    },
    champion: {
      key: champion.key,
      id: champion.id,
      slug: champion.slug,
      nameZh: champion.nameZh,
      nameEn: champion.nameEn,
      titleZh: champion.titleZh,
      titleEn: champion.titleEn,
      imageUrl: champion.imageUrl,
      splashUrl: champion.splashUrl,
      blurb: championRecord.blurb,
      passive: championRecord.passive,
      spells: championRecord.spells.map((spell, index) => ({
        key: ['Q', 'W', 'E', 'R'][index],
        name: spell.name,
        description: spell.description,
        imageUrl: `https://ddragon.leagueoflegends.com/cdn/${meta.patch.assetVersion}/img/spell/${spell.image.full}`
      }))
    },
    recommended: {
      sample: {
        wins: sampleWins,
        losses: sampleLosses,
        games: sampleGames,
        winRate: sampleGames ? sampleWins / sampleGames : 0
      },
      runes,
      summoners,
      starterItems,
      coreItems,
      situationalItems,
      lateGameBuilds,
      skillOrder
    },
    balance: balanceSummary,
    tips
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function mapInBatches(items, batchSize, mapper) {
  const results = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
  }
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  const meta = await getMeta();

  await fs.rm(DATA_ROOT, { recursive: true, force: true });
  await fs.mkdir(CHAMPION_DATA_ROOT, { recursive: true });

  const championSummaries = await mapInBatches(meta.champions, BUILD_CONCURRENCY, async (champion) => {
    const body = await buildChampionData(meta, champion);
    await writeJson(path.join(CHAMPION_DATA_ROOT, `${champion.slug}.json`), body);

    return {
      key: champion.key,
      id: champion.id,
      slug: champion.slug,
      nameZh: champion.nameZh,
      nameEn: champion.nameEn,
      titleZh: champion.titleZh,
      titleEn: champion.titleEn,
      imageUrl: champion.imageUrl,
      aliases: champion.aliases,
      normalized: champion.normalized,
      hasData: !body.error
    };
  });

  const featured = meta.featured
    .map((champion) => championSummaries.find((entry) => entry.slug === champion.slug))
    .filter(Boolean)
    .map((champion) => ({
      nameZh: champion.nameZh,
      nameEn: champion.nameEn,
      slug: champion.slug,
      imageUrl: champion.imageUrl,
      hasData: champion.hasData
    }));

  const publicMeta = {
    builtAt: startedAt,
    patch: meta.patch,
    featured,
    champions: championSummaries
  };

  await writeJson(path.join(DATA_ROOT, 'meta.json'), publicMeta);
  await fs.writeFile(path.join(ROOT, '.nojekyll'), '\n', 'utf8');

  console.log(`Built static data for ${championSummaries.length} champions at ${startedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const STAT_SHARD_NAMES = {
  '5005': '攻速',
  '5007': '技能急速',
  '5008': '適性之力',
  '5001': '成長生命',
  '5010': '跑速',
  '5011': '生命值',
  '5013': '韌性與緩速抗性'
};

const STAT_SHARD_ICONS = {
  '5005': 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAttackSpeedIcon.png',
  '5007': 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsCDRScalingIcon.png',
  '5008': 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png',
  '5001': 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsHealthScalingIcon.png',
  '5010': 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsMovementSpeedIcon.png',
  '5011': 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsHealthPlusIcon.png',
  '5013': 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsTenacityIcon.png'
};
