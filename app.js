const RECENT_KEY = 'aram-live-desk-recent';

const elements = {
  championSearch: document.querySelector('#championSearch'),
  searchButton: document.querySelector('#searchButton'),
  refreshButton: document.querySelector('#refreshButton'),
  featuredList: document.querySelector('#featuredList'),
  recentList: document.querySelector('#recentList'),
  resultTitle: document.querySelector('#resultTitle'),
  resultSubtitle: document.querySelector('#resultSubtitle'),
  emptyState: document.querySelector('#emptyState'),
  championHero: document.querySelector('#championHero'),
  championPortrait: document.querySelector('#championPortrait'),
  championKicker: document.querySelector('#championKicker'),
  championName: document.querySelector('#championName'),
  championBlurb: document.querySelector('#championBlurb'),
  statBar: document.querySelector('#statBar'),
  resultGrid: document.querySelector('#resultGrid'),
  buildBlock: document.querySelector('#buildBlock'),
  runeBlock: document.querySelector('#runeBlock'),
  skillBlock: document.querySelector('#skillBlock'),
  tipsBlock: document.querySelector('#tipsBlock'),
  statusPill: document.querySelector('#statusPill'),
  patchPill: document.querySelector('#patchPill'),
  championSuggestions: document.querySelector('#championSuggestions'),
  sourceLink: document.querySelector('#sourceLink'),
  chipTemplate: document.querySelector('#chipTemplate')
};

const state = {
  meta: null,
  currentResult: null,
  loading: false
};

let itemTooltip = null;

boot();

async function boot() {
  itemTooltip = createItemTooltip();
  bindEvents();
  renderRecentChips();

  try {
    setStatus('正在載入最新靜態資料...', false);
    state.meta = await fetchJson(buildDataUrl('data/meta.json'));
    populateSuggestions();
    renderFeaturedChips();
    updatePatchPill();
    setStatus('已載入最新資料快照，可以開始搜尋。', false);
  } catch (error) {
    setStatus(`初始化失敗：${error.message}`, true);
  }
}

function bindEvents() {
  elements.searchButton.addEventListener('click', () => lookupChampion(elements.championSearch.value));
  elements.refreshButton.addEventListener('click', () => {
    if (!state.currentResult) {
      lookupChampion(elements.championSearch.value);
      return;
    }
    lookupChampion(state.currentResult.champion.nameZh || state.currentResult.champion.nameEn, true);
  });

  elements.championSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      lookupChampion(elements.championSearch.value);
    }
  });
}

async function lookupChampion(query, forceRefresh = false) {
  const keyword = String(query || '').trim();
  if (!keyword) {
    setStatus('請先輸入英雄名稱。', true);
    return;
  }

  if (state.loading) {
    return;
  }

  state.loading = true;
  setStatus(forceRefresh ? `重新讀取 ${keyword} 的資料快照...` : `正在查詢 ${keyword} 的資料快照...`, false);

  try {
    if (!state.meta || forceRefresh) {
      state.meta = await fetchJson(buildDataUrl('data/meta.json'), forceRefresh);
      populateSuggestions();
      renderFeaturedChips();
      updatePatchPill();
    }

    const champion = resolveChampionEntry(keyword);
    if (!champion) {
      state.currentResult = null;
      const suggestions = buildClientSuggestions(keyword);
      renderNotFound(keyword, suggestions);
      setStatus(`找不到「${keyword}」對應的英雄。`, true);
      return;
    }

    const result = await fetchJson(buildDataUrl(`data/champions/${champion.slug}.json`), forceRefresh);
    if (result.error) {
      state.currentResult = null;
      renderUnavailableChampion(result);
      setStatus(result.message || `目前找不到 ${champion.nameZh} 的可用資料。`, true);
      return;
    }

    state.currentResult = result;
    elements.championSearch.value = result.champion.nameZh;
    saveRecent(result.champion.nameZh);
    renderRecentChips();
    renderChampion(result);
    setStatus(`已更新 ${result.champion.nameZh} 的 ARAM 資料快照。`, false);
  } catch (error) {
    const suggestions = buildClientSuggestions(keyword);
    renderNotFound(keyword, suggestions);
    setStatus(error.message, true);
  } finally {
    state.loading = false;
  }
}

function renderChampion(data) {
  elements.emptyState.classList.add('hidden');
  elements.championHero.classList.remove('hidden');
  elements.statBar.classList.remove('hidden');
  elements.resultGrid.classList.remove('hidden');
  elements.sourceLink.classList.remove('hidden');

  elements.resultTitle.textContent = `${data.champion.nameZh} / ${data.champion.nameEn}`;
  elements.resultSubtitle.textContent = `ARAM 靜態資料快照 - Patch ${data.patch.statsPatchLabel}`;
  elements.championPortrait.src = data.champion.imageUrl;
  elements.championPortrait.alt = `${data.champion.nameZh} portrait`;
  elements.championKicker.textContent = `${data.champion.titleZh} · 資料更新 ${formatTime(data.patch.sourceUpdatedAt)}`;
  elements.championName.textContent = data.champion.nameZh;
  elements.championBlurb.textContent = data.champion.blurb;
  elements.sourceLink.href = data.source.championUrl;

  renderStatBar(data);
  renderBuildBlock(data);
  renderRuneBlock(data);
  renderSkillBlock(data);
  renderTipsBlock(data);
}

function renderUnavailableChampion(data) {
  elements.resultTitle.textContent = `${data.champion.nameZh} / ${data.champion.nameEn}`;
  elements.resultSubtitle.textContent = data.message || '這隻英雄目前沒有可用資料。';
  elements.emptyState.classList.remove('hidden');
  elements.championHero.classList.add('hidden');
  elements.statBar.classList.add('hidden');
  elements.resultGrid.classList.add('hidden');
  elements.sourceLink.classList.add('hidden');

  elements.emptyState.innerHTML = `
    <h3>這隻英雄暫時沒有資料</h3>
    <p>${data.message || '目前這份靜態資料快照沒有收錄這隻英雄的 ARAM 建議。'}</p>
  `;
}

function renderNotFound(keyword, suggestions) {
  elements.resultTitle.textContent = keyword;
  elements.resultSubtitle.textContent = '找不到對應英雄，請試試中文、英文或較完整的名稱。';
  elements.emptyState.classList.remove('hidden');
  elements.championHero.classList.add('hidden');
  elements.statBar.classList.add('hidden');
  elements.resultGrid.classList.add('hidden');
  elements.sourceLink.classList.add('hidden');

  const suggestionText = suggestions.length
    ? `你可以試試：${suggestions.map((entry) => entry.nameZh).join('、')}`
    : '目前沒有相近建議。';

  elements.emptyState.innerHTML = `
    <h3>找不到這隻英雄</h3>
    <p>${suggestionText}</p>
  `;
}

function renderStatBar(data) {
  const stats = [
    ['配置樣本', `${data.recommended.sample.games.toLocaleString('en-US')} 場`],
    ['配置勝率', `${(data.recommended.sample.winRate * 100).toFixed(1)}%`],
    ['資料 Patch', data.patch.statsPatchLabel],
    ['Riot 資產', data.patch.assetVersion]
  ];

  if (data.balance.changed) {
    stats.push(['ARAM 調整', `${data.balance.entries.length} 項`]);
  }

  elements.statBar.replaceChildren(
    ...stats.map(([label, value]) => {
      const pill = document.createElement('div');
      pill.className = 'stat-pill';
      pill.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
      return pill;
    })
  );
}

function renderBuildBlock(data) {
  const block = document.createElement('div');
  block.className = 'block-stack';
  block.appendChild(renderItemSection('起手', data.recommended.starterItems));
  block.appendChild(renderItemSection('核心', data.recommended.coreItems));
  block.appendChild(renderItemSection('情境補裝', data.recommended.situationalItems));
  (data.recommended.lateGameBuilds || []).forEach((entry) => {
    block.appendChild(renderItemSection(entry.title, entry.items, entry.note));
  });
  elements.buildBlock.replaceChildren(block);
}

function renderRuneBlock(data) {
  const runes = data.recommended.runes;
  const wrapper = document.createElement('div');
  wrapper.className = 'block-stack';

  wrapper.appendChild(renderIconSection(
    `主系：${runes.primaryTree?.name || '未知'}`,
    runes.primaryRunes
  ));
  wrapper.appendChild(renderIconSection(
    `副系：${runes.secondaryTree?.name || '未知'}`,
    runes.secondaryRunes
  ));
  wrapper.appendChild(renderIconSection('碎片', runes.statShards));
  wrapper.appendChild(renderIconSection('召喚師技能', data.recommended.summoners));

  elements.runeBlock.replaceChildren(wrapper);
}

function renderSkillBlock(data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'block-stack';
  const skill = data.recommended.skillOrder;
  const spellMap = new Map((data.champion.spells || []).map((entry) => [entry.key, entry]));

  const priority = document.createElement('p');
  priority.innerHTML = `主升順序：<strong>${skill.priority}</strong>`;
  wrapper.appendChild(priority);

  wrapper.appendChild(renderSkillSequenceSection(
    '前 9 等點法',
    skill.firstLevels.map((entry, index) => ({
      level: index + 1,
      key: entry,
      name: skill.spellNames[entry] || entry,
      imageUrl: spellMap.get(entry)?.imageUrl || '',
      description: spellMap.get(entry)?.description || ''
    }))
  ));

  wrapper.appendChild(renderIconSection(
    '技能對照',
    ['Q', 'W', 'E', 'R'].map((key) => ({
      name: `${key} - ${skill.spellNames[key] || key}`,
      imageUrl: spellMap.get(key)?.imageUrl || '',
      description: spellMap.get(key)?.description || ''
    }))
  ));

  elements.skillBlock.replaceChildren(wrapper);
}

function renderTipsBlock(data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'block-stack';

  const tipsTitle = document.createElement('h4');
  tipsTitle.textContent = '這套配置的快速重點';
  wrapper.appendChild(tipsTitle);

  const tipList = document.createElement('ul');
  data.tips.forEach((tip) => {
    const item = document.createElement('li');
    item.textContent = tip;
    tipList.appendChild(item);
  });
  wrapper.appendChild(tipList);

  const balanceTitle = document.createElement('h4');
  balanceTitle.textContent = 'ARAM 專屬調整';
  wrapper.appendChild(balanceTitle);

  if (data.balance.changed) {
    wrapper.appendChild(renderInlineSection('目前調整', data.balance.entries));
  } else {
    const none = document.createElement('p');
    none.textContent = '目前沒有顯著的 ARAM 專屬調整。';
    wrapper.appendChild(none);
  }

  elements.tipsBlock.replaceChildren(wrapper);
}

function renderItemSection(title, items, note = '') {
  const section = document.createElement('section');
  section.className = 'block-stack';

  const heading = document.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);

  if (note) {
    const noteText = document.createElement('p');
    noteText.className = 'section-note';
    noteText.textContent = note;
    section.appendChild(noteText);
  }

  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = '目前沒有足夠樣本。';
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'item-list';

  items.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = 'item-chip';
    chip.innerHTML = `
      <img src="${item.imageUrl}" alt="${item.name}" loading="lazy" />
      <span>${item.name}</span>
    `;
    bindItemTooltip(chip, item);
    list.appendChild(chip);
  });

  section.appendChild(list);
  return section;
}

function renderInlineSection(title, values) {
  const section = document.createElement('section');
  section.className = 'block-stack';

  const heading = document.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'inline-list';

  values.forEach((value) => {
    const item = document.createElement('li');
    item.textContent = value;
    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

function renderSkillSequenceSection(title, entries) {
  const section = document.createElement('section');
  section.className = 'block-stack';

  const heading = document.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.textContent = '目前沒有足夠樣本。';
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'skill-sequence-list';

  entries.forEach((entry) => {
    const chip = document.createElement('div');
    chip.className = 'skill-sequence-chip';

    if (entry.imageUrl) {
      const icon = document.createElement('img');
      icon.src = entry.imageUrl;
      icon.alt = entry.name;
      icon.loading = 'lazy';
      chip.appendChild(icon);
    }

    const meta = document.createElement('div');
    meta.className = 'skill-sequence-meta';

    const level = document.createElement('span');
    level.className = 'skill-level';
    level.textContent = `Lv.${entry.level}`;
    meta.appendChild(level);

    const label = document.createElement('strong');
    label.textContent = `${entry.key} - ${entry.name}`;
    meta.appendChild(label);

    chip.appendChild(meta);
    bindItemTooltip(chip, entry);
    list.appendChild(chip);
  });

  section.appendChild(list);
  return section;
}

function renderIconSection(title, entries) {
  const section = document.createElement('section');
  section.className = 'block-stack';

  const heading = document.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.textContent = '目前沒有足夠樣本。';
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'icon-list';

  entries.forEach((entry) => {
    const chip = document.createElement('div');
    chip.className = 'icon-chip';

    const iconUrl = entry.imageUrl || entry.icon;
    if (iconUrl) {
      const icon = document.createElement('img');
      icon.src = iconUrl;
      icon.alt = entry.name;
      icon.loading = 'lazy';
      chip.appendChild(icon);
    }

    const label = document.createElement('span');
    label.textContent = entry.name;
    chip.appendChild(label);
    bindItemTooltip(chip, entry);
    list.appendChild(chip);
  });

  section.appendChild(list);
  return section;
}

function createItemTooltip() {
  const tooltip = document.createElement('div');
  tooltip.className = 'item-tooltip hidden';
  document.body.appendChild(tooltip);
  return tooltip;
}

function bindItemTooltip(target, item) {
  const html = item.tooltipHtml || '';
  if (!html && !item.description && !item.name) {
    return;
  }

  target.addEventListener('mouseenter', (event) => showItemTooltip(item, event));
  target.addEventListener('mousemove', moveItemTooltip);
  target.addEventListener('mouseleave', hideItemTooltip);
}

function showItemTooltip(item, event) {
  if (!itemTooltip) {
    return;
  }

  itemTooltip.innerHTML = item.tooltipHtml || `
    <div class="item-tooltip-header">
      <div class="item-tooltip-name">${escapeHtml(item.name || '')}</div>
    </div>
    <div class="item-tooltip-body">
      <p>${escapeHtml(item.description || item.name || '')}</p>
    </div>
  `;
  itemTooltip.classList.remove('hidden');
  moveItemTooltip(event);
}

function moveItemTooltip(event) {
  if (!itemTooltip || itemTooltip.classList.contains('hidden')) {
    return;
  }

  const offset = 18;
  const maxLeft = window.innerWidth - itemTooltip.offsetWidth - 12;
  const maxTop = window.innerHeight - itemTooltip.offsetHeight - 12;
  const left = Math.min(event.clientX + offset, Math.max(12, maxLeft));
  const top = Math.min(event.clientY + offset, Math.max(12, maxTop));

  itemTooltip.style.left = `${left}px`;
  itemTooltip.style.top = `${top}px`;
}

function hideItemTooltip() {
  if (!itemTooltip) {
    return;
  }

  itemTooltip.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function populateSuggestions() {
  elements.championSuggestions.replaceChildren(
    ...state.meta.champions.flatMap((champion) => {
      return [champion.nameZh, champion.nameEn].map((value) => {
        const option = document.createElement('option');
        option.value = value;
        return option;
      });
    })
  );
}

function renderFeaturedChips() {
  renderChipGroup(elements.featuredList, state.meta.featured.map((entry) => entry.nameZh));
}

function renderRecentChips() {
  const recent = loadRecent();
  if (!recent.length) {
    const note = document.createElement('p');
    note.className = 'panel-note';
    note.textContent = '你最近查過的英雄會出現在這裡。';
    elements.recentList.replaceChildren(note);
    return;
  }

  renderChipGroup(elements.recentList, recent);
}

function renderChipGroup(container, values) {
  container.replaceChildren(
    ...values.map((value) => {
      const chip = elements.chipTemplate.content.firstElementChild.cloneNode(true);
      chip.textContent = value;
      chip.addEventListener('click', () => lookupChampion(value));
      return chip;
    })
  );
}

function saveRecent(name) {
  const next = [name, ...loadRecent().filter((entry) => entry !== name)].slice(0, 10);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function loadRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (_error) {
    return [];
  }
}

function updatePatchPill() {
  if (!state.meta) {
    return;
  }

  const builtAt = state.meta.builtAt ? ` / 快照 ${formatTime(state.meta.builtAt)}` : '';
  elements.patchPill.textContent = `目前資料 Patch ${state.meta.patch.statsPatchLabel} / Riot 資產 ${state.meta.patch.assetVersion}${builtAt}`;
}

function setStatus(message, isWarning) {
  elements.statusPill.textContent = message;
  elements.statusPill.style.background = isWarning ? 'rgba(255, 200, 87, 0.12)' : 'rgba(255, 255, 255, 0.06)';
  elements.statusPill.style.color = isWarning ? '#ffe39b' : '#fff4da';
}

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (_error) {
    return value;
  }
}

async function fetchJson(url, bustCache = false) {
  const targetUrl = bustCache ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url;
  const response = await fetch(targetUrl, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`讀取資料失敗：${response.status}`);
  }

  return response.json();
}

function buildDataUrl(relativePath) {
  return new URL(relativePath, window.location.href).toString();
}

function resolveChampionEntry(query) {
  const keyword = normalizeQuery(query);
  if (!keyword || !state.meta) {
    return null;
  }

  const exact = state.meta.champions.find((champion) => champion.normalized.includes(keyword));
  if (exact) {
    return exact;
  }

  return state.meta.champions.find((champion) => champion.normalized.some((alias) => alias.includes(keyword)));
}

function buildClientSuggestions(query) {
  const keyword = normalizeQuery(query);
  if (!keyword || !state.meta) {
    return [];
  }

  return state.meta.champions
    .filter((champion) => champion.normalized.some((alias) => alias.includes(keyword)))
    .slice(0, 8)
    .map((champion) => ({
      nameZh: champion.nameZh,
      nameEn: champion.nameEn,
      slug: champion.slug
    }));
}

function normalizeQuery(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}
