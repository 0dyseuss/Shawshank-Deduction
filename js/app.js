import { MOVIES_DB, TV_DB, TICTACTOE_CATEGORIES, TV_CATEGORIES } from "./data.js?v=9";
import {
  verifyTypedAnswer,
  resolveFullTitle,
  fetchPersonHeadshot,
  fetchPosterForMedia
} from "./tmdb.js?v=9";

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const GRID_DURATION_SECONDS = 180; // 3 minutes (03:00) for the entire grid

const state = {
  inSetup: true,
  section: "movies", // 'movies' | 'tv'
  mode: "solo", // 'daily' | 'solo' | 'pass' | 'online' | 'random' | 'bot'
  filters: {
    difficulty: "medium", // 'easy' | 'medium' | 'hard'
    scope: "global" // 'global' | 'hollywood' | 'animations'
  },
  rows: [],
  cols: [],
  cells: Array.from({ length: 9 }, () => ({ owner: null, movie: null, revealed: false })),
  usedIds: new Set(),
  turn: "X",
  scores: { X: 0, O: 0 },
  activeCellIndex: null,
  pendingSuggestionItem: null,
  gameOver: false,
  winningLine: null,
  gridSeconds: GRID_DURATION_SECONDS,
  timerInterval: null,
  dailyCountdownInterval: null,
  roomCode: null,
  channel: null,
  recentBoardSignatures: []
};

// ============================================================================
// CUSTOM SVG ICONS & TMDB HEADSHOT / POSTER VISUAL BUILDERS
// ============================================================================
function getEmptyCellClapperSvg() {
  return `
    <svg class="cell-watermark-svg" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="14" y="34" width="60" height="42" rx="4" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.5"/>
      <path d="M14 24C14 21.7909 15.7909 20 18 20H70C72.2091 20 74 21.7909 74 24V32H14V24Z" fill="currentColor" fill-opacity="0.32" stroke="currentColor" stroke-width="2.5"/>
      <line x1="26" y1="20" x2="20" y2="32" stroke="currentColor" stroke-width="2.5"/>
      <line x1="42" y1="20" x2="36" y2="32" stroke="currentColor" stroke-width="2.5"/>
      <line x1="58" y1="20" x2="52" y2="32" stroke="currentColor" stroke-width="2.5"/>
      <line x1="22" y1="48" x2="66" y2="48" stroke="currentColor" stroke-width="2" stroke-opacity="0.5"/>
      <line x1="22" y1="60" x2="50" y2="60" stroke="currentColor" stroke-width="2" stroke-opacity="0.5"/>
    </svg>
  `;
}

function getCornerReelCrestSvg() {
  return `
    <svg class="corner-crest-svg" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="36" cy="36" r="32" fill="#120E07" stroke="#F3E09C" stroke-width="2.5"/>
      <circle cx="36" cy="36" r="24" stroke="#BEA260" stroke-width="1.8" stroke-dasharray="4 3"/>
      <circle cx="36" cy="21" r="4.5" fill="#F3E09C"/>
      <circle cx="36" cy="51" r="4.5" fill="#F3E09C"/>
      <circle cx="21" cy="36" r="4.5" fill="#F3E09C"/>
      <circle cx="51" cy="36" r="4.5" fill="#F3E09C"/>
      <polygon points="36,29 38.2,33.6 43.2,34.3 39.6,37.8 40.5,42.8 36,40.4 31.5,42.8 32.4,37.8 28.8,34.3 33.8,33.6" fill="#F3E09C"/>
    </svg>
  `;
}

function getOscarTrophySvg() {
  return `
    <div class="cat-icon-badge-wrap">
      <svg class="cat-svg-icon trophy-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="oscarGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FFF2BD"/>
            <stop offset="50%" stop-color="#F3E09C"/>
            <stop offset="100%" stop-color="#B8923A"/>
          </linearGradient>
        </defs>
        <circle cx="32" cy="12" r="5.5" fill="url(#oscarGold)"/>
        <path d="M24 20C24 18.3 25.5 17 27.5 17H36.5C38.5 17 40 18.3 40 20L37.5 36L35.5 47H28.5L26.5 36L24 20Z" fill="url(#oscarGold)"/>
        <path d="M28 22L32 38L36 22" stroke="#5C4312" stroke-width="1.4" stroke-linecap="round"/>
        <rect x="23" y="47" width="18" height="4" rx="1.5" fill="#BEA260"/>
        <rect x="19" y="51" width="26" height="6" rx="2" fill="#231D14" stroke="#F3E09C" stroke-width="1.5"/>
      </svg>
    </div>
  `;
}

function getEraSlateSvg(decadeText) {
  return `
    <div class="cat-icon-badge-wrap">
      <svg class="cat-svg-icon slate-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="12" width="48" height="42" rx="6" fill="#181216" stroke="#F3E09C" stroke-width="2.2"/>
        <path d="M8 18C8 14.6863 10.6863 12 14 12H50C53.3137 12 56 14.6863 56 18V23H8V18Z" fill="#F3E09C"/>
        <circle cx="16" cy="17.5" r="2" fill="#181216"/>
        <circle cx="48" cy="17.5" r="2" fill="#181216"/>
        <text x="32" y="42" text-anchor="middle" fill="#F8F5EC" font-family="Futura PT, Jost, sans-serif" font-weight="800" font-size="16" letter-spacing="0.5">${decadeText}</text>
      </svg>
    </div>
  `;
}

function getNetworkCrestSvg(networkLabel) {
  let shortCode = "TV";
  let bg = "#1A2234";
  const lower = networkLabel.toLowerCase();
  if (lower.includes("hbo")) {
    shortCode = "HBO";
    bg = "#141824";
  } else if (lower.includes("netflix")) {
    shortCode = "N";
    bg = "#7A1216";
  } else if (lower.includes("amc")) {
    shortCode = "AMC";
    bg = "#4A2E0B";
  } else if (lower.includes("fx") || lower.includes("apple")) {
    shortCode = "FX+";
    bg = "#1A2E3B";
  }
  return `
    <div class="cat-icon-badge-wrap">
      <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="12" width="48" height="40" rx="8" fill="${bg}" stroke="#F3E09C" stroke-width="2.2"/>
        <text x="32" y="37" text-anchor="middle" fill="#F3E09C" font-family="Futura PT, Jost, sans-serif" font-weight="800" font-size="16" letter-spacing="1">${shortCode}</text>
      </svg>
    </div>
  `;
}

function getHookIconSvg(catId) {
  if (catId === "hook_sequel") {
    return `
      <div class="cat-icon-badge-wrap">
        <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none">
          <circle cx="25" cy="34" r="15" fill="#191318" stroke="#BEA260" stroke-width="2.2"/>
          <circle cx="39" cy="30" r="15" fill="#231920" stroke="#F3E09C" stroke-width="2.4"/>
          <text x="39" y="35" text-anchor="middle" fill="#F3E09C" font-family="Futura PT, Jost, sans-serif" font-weight="800" font-size="14">II·III</text>
        </svg>
      </div>
    `;
  }
  if (catId === "hook_truestory") {
    return `
      <div class="cat-icon-badge-wrap">
        <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none">
          <rect x="12" y="10" width="40" height="44" rx="4" fill="#1A1518" stroke="#F3E09C" stroke-width="2.2"/>
          <line x1="20" y1="22" x2="44" y2="22" stroke="#F3E09C" stroke-width="2.2"/>
          <line x1="20" y1="31" x2="44" y2="31" stroke="#BEA260" stroke-width="2"/>
          <line x1="20" y1="40" x2="36" y2="40" stroke="#BEA260" stroke-width="2"/>
        </svg>
      </div>
    `;
  }
  if (catId === "hook_nyc") {
    return `
      <div class="cat-icon-badge-wrap">
        <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="23" fill="#151D2A" stroke="#F3E09C" stroke-width="2.2"/>
          <path d="M32 13L35 23H29L32 13Z" fill="#F3E09C"/>
          <rect x="28" y="23" width="8" height="24" fill="#BEA260"/>
          <rect x="20" y="31" width="6" height="16" fill="#8E7946"/>
          <rect x="38" y="28" width="6" height="19" fill="#8E7946"/>
          <line x1="16" y1="47" x2="48" y2="47" stroke="#F3E09C" stroke-width="2"/>
        </svg>
      </div>
    `;
  }
  if (catId === "hook_number_title") {
    return `
      <div class="cat-icon-badge-wrap">
        <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="23" fill="#1A1418" stroke="#F3E09C" stroke-width="2.2"/>
          <circle cx="32" cy="32" r="17" stroke="#BEA260" stroke-width="1.4" stroke-dasharray="3 3"/>
          <text x="32" y="38" text-anchor="middle" fill="#F3E09C" font-family="DM Mono, monospace" font-weight="700" font-size="18">#7</text>
        </svg>
      </div>
    `;
  }
  if (catId === "hook_char_title") {
    return `
      <div class="cat-icon-badge-wrap">
        <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="23" fill="#1E151B" stroke="#F3E09C" stroke-width="2.2"/>
          <circle cx="32" cy="26" r="7" fill="#F3E09C"/>
          <path d="M20 46C20 39.5 25.4 35 32 35C38.6 35 44 39.5 44 46" stroke="#F3E09C" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>
    `;
  }
  if (catId === "tv_seasons_4plus" || catId === "tv_seasons_short") {
    const badge = catId === "tv_seasons_4plus" ? "4+ S" : "1-3 S";
    return `
      <div class="cat-icon-badge-wrap">
        <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none">
          <rect x="12" y="16" width="40" height="30" rx="5" fill="#18141B" stroke="#F3E09C" stroke-width="2.2"/>
          <line x1="22" y1="51" x2="42" y2="51" stroke="#BEA260" stroke-width="2.5" stroke-linecap="round"/>
          <text x="32" y="36" text-anchor="middle" fill="#F3E09C" font-family="Futura PT, Jost, sans-serif" font-weight="800" font-size="13">${badge}</text>
        </svg>
      </div>
    `;
  }
  return `
    <div class="cat-icon-badge-wrap">
      <svg class="cat-svg-icon" viewBox="0 0 64 64" fill="none">
        <rect x="10" y="16" width="44" height="32" rx="5" fill="#1A1418" stroke="#F3E09C" stroke-width="2.2"/>
        <text x="32" y="37" text-anchor="middle" fill="#F3E09C" font-family="Futura PT, Jost, sans-serif" font-weight="800" font-size="14">1 WORD</text>
      </svg>
    </div>
  `;
}

function getHeaderDisplayParts(cat) {
  if (cat.group === "actor") {
    return {
      kicker: "STARRING",
      mainLabel: cat.label,
      personLookup: cat.label
    };
  }
  if (cat.group === "director") {
    return {
      kicker: "DIRECTED BY",
      mainLabel: cat.label,
      personLookup: cat.label
    };
  }
  if (cat.group === "composer") {
    const cleanName = cat.label.replace(/^Score by\s+/i, "").trim();
    return {
      kicker: "SCORE BY",
      mainLabel: cleanName,
      personLookup: cleanName
    };
  }
  return {
    kicker: (cat.sublabel || "CRITERIA").toUpperCase(),
    mainLabel: cat.label,
    personLookup: null
  };
}

function buildCategoryVisualHTML(cat) {
  const parts = getHeaderDisplayParts(cat);

  if (parts.personLookup) {
    const initials = parts.mainLabel
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return `
      <div class="cat-avatar-frame" data-person-name="${parts.personLookup.replace(/"/g, "&quot;")}">
        <span class="cat-avatar-initials">${initials}</span>
        <img class="cat-avatar-img hidden" alt="${parts.mainLabel}" />
      </div>
    `;
  }

  if (cat.group === "award") {
    return getOscarTrophySvg();
  }

  if (cat.group === "era") {
    if (cat.id === "decade_70s") return getEraSlateSvg("'70s");
    if (cat.id === "decade_80s") return getEraSlateSvg("'80s");
    if (cat.id === "decade_90s") return getEraSlateSvg("'90s");
    if (cat.id === "decade_00s") return getEraSlateSvg("'00s");
    if (cat.id === "decade_10s" || cat.id === "tv_era_2010s") return getEraSlateSvg("'10s");
    if (cat.id === "decade_20s") return getEraSlateSvg("'20s");
    if (cat.id === "tv_era_pre2015") return getEraSlateSvg("<2015");
    return getEraSlateSvg("2015+");
  }

  if (cat.group === "network") {
    return getNetworkCrestSvg(cat.label);
  }

  return getHookIconSvg(cat.id);
}

function hydrateHeadshotsInContainer(containerEl) {
  if (!containerEl) return;
  const frames = containerEl.querySelectorAll("[data-person-name]");
  frames.forEach(async (frame) => {
    const personName = frame.getAttribute("data-person-name");
    if (!personName) return;
    const imgEl = frame.querySelector(".cat-avatar-img");
    const initEl = frame.querySelector(".cat-avatar-initials");
    if (!imgEl) return;

    const url = await fetchPersonHeadshot(personName);
    if (url) {
      const revealImg = () => {
        imgEl.classList.remove("hidden");
        if (initEl) initEl.classList.add("hidden");
      };
      imgEl.onload = revealImg;
      imgEl.src = url;
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        revealImg();
      }
    }
  });
}

function hydrateCellPoster(cellEl, movieObj, section) {
  if (!cellEl || !movieObj) return;
  const imgEl = cellEl.querySelector(".cell-poster-img");
  const fallbackEl = cellEl.querySelector(".cell-poster-fallback");
  if (!imgEl) return;

  fetchPosterForMedia(movieObj, section).then((posterUrl) => {
    if (posterUrl) {
      const revealPoster = () => {
        imgEl.classList.remove("hidden");
        if (fallbackEl) fallbackEl.classList.add("hidden");
      };
      imgEl.onload = revealPoster;
      imgEl.src = posterUrl;
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        revealPoster();
      }
    }
  });
}

// ============================================================================
// SEEDED PRNG & SUB-MILLISECOND PRECOMPUTED BOARD SOLVER (< 4ms)
// ============================================================================
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng(arr, rng = Math.random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getTodayDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCatalogForSection(section = state.section, scope = state.filters.scope) {
  const rawDb = section === "tv" ? TV_DB : MOVIES_DB;
  const filtered = rawDb.filter((item) => {
    if (scope === "hollywood" || scope === "only_hollywood") return item.language === "en";
    if (scope === "animations" || scope === "only_animations") return Boolean(item.isAnimated);
    return true;
  });
  return filtered.length >= 9 ? filtered : rawDb;
}

function getCategoriesForSection(section = state.section) {
  return section === "tv" ? TV_CATEGORIES : TICTACTOE_CATEGORIES;
}

function canCategoriesIntersect(catA, catB) {
  if (catA.id === catB.id) return false;
  if (catA.group === "director" && catB.group === "director") return false;
  if (catA.group === "network" && catB.group === "network") return false;
  if (catA.group === "era" && catB.group === "era") return false;
  if (catA.group === "composer" && catB.group === "composer") return false;
  return true;
}

function findNineDistinctAssignment(rows, cols, catalog, existingCells = null) {
  const cellCandidates = [];
  const preUsedKeys = new Set();

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      if (existingCells && existingCells[idx] && existingCells[idx].owner && existingCells[idx].movie) {
        const m = existingCells[idx].movie;
        const key = `${m.title.toLowerCase()}_${m.year}`;
        preUsedKeys.add(key);
        cellCandidates.push([m]);
        continue;
      }

      if (!canCategoriesIntersect(rows[r], cols[c])) return null;
      const matches = catalog.filter((m) => rows[r].matches(m) && cols[c].matches(m));
      if (matches.length === 0) return null;
      cellCandidates.push(matches);
    }
  }

  const usedKeys = new Set(preUsedKeys);
  const chosen = Array(9).fill(null);

  function backtrack(idx) {
    if (idx === 9) return true;
    if (existingCells && existingCells[idx] && existingCells[idx].owner && existingCells[idx].movie) {
      chosen[idx] = existingCells[idx].movie;
      return backtrack(idx + 1);
    }

    for (const m of cellCandidates[idx]) {
      const key = `${m.title.toLowerCase()}_${m.year}`;
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        chosen[idx] = m;
        if (backtrack(idx + 1)) return true;
        usedKeys.delete(key);
        chosen[idx] = null;
      }
    }
    return false;
  }

  return backtrack(0) ? chosen : null;
}

function hasNineDistinctSolutions(rows, cols, catalog) {
  return Boolean(findNineDistinctAssignment(rows, cols, catalog, null));
}

function dedupeCategories(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function areAxesBalanced(rows, cols) {
  const colIds = cols.map((c) => c.id);
  if (new Set(colIds).size !== 3) return false;

  const eraCount = cols.filter((c) => c.group === "era").length;
  if (eraCount > 1) return false;

  const awardCount = cols.filter((c) => c.group === "award" || c.id.startsWith("stat_")).length;
  if (awardCount > 1) return false;

  const composerCount = cols.filter((c) => c.group === "composer").length;
  if (composerCount > 1) return false;

  const hookCount = cols.filter((c) => c.group === "hook").length;
  if (hookCount > 1) return false;

  const allSix = [...rows, ...cols];
  const intlCount = allSix.filter((c) => Boolean(c.isInternational)).length;
  if (intlCount > 1) return false;

  return true;
}

function generateSolvableBoard({ section, scope, difficulty, seedKey = null }) {
  const rng = seedKey ? createMulberry32(hashStringToSeed(seedKey)) : Math.random;
  const catalog = getCatalogForSection(section, scope);
  const allCats = getCategoriesForSection(section);

  const isHollywoodOnly = scope === "hollywood" || scope === "only_hollywood";

  const catMatchIndices = new Map();
  const activeCats = [];

  for (const cat of allCats) {
    if (isHollywoodOnly && (cat.id === "origin_foreign" || cat.isInternational)) continue;
    const indices = [];
    for (let mIdx = 0; mIdx < catalog.length; mIdx++) {
      if (cat.matches(catalog[mIdx])) {
        indices.push(mIdx);
      }
    }
    if (indices.length >= 2) {
      catMatchIndices.set(cat.id, indices);
      activeCats.push(cat);
    }
  }

  const pairCache = new Map();
  function getPairIndices(catA, catB) {
    if (!canCategoriesIntersect(catA, catB)) return [];
    const key = catA.id < catB.id ? `${catA.id}|${catB.id}` : `${catB.id}|${catA.id}`;
    const cached = pairCache.get(key);
    if (cached !== undefined) return cached;

    const arrA = catMatchIndices.get(catA.id) || [];
    const arrB = catMatchIndices.get(catB.id) || [];
    const setB = new Set(arrB);
    const inter = [];
    for (let i = 0; i < arrA.length; i++) {
      if (setB.has(arrA[i])) inter.push(arrA[i]);
    }
    pairCache.set(key, inter);
    return inter;
  }

  function hasNineDistinctFast(rows, cols) {
    const cellArrays = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const inter = getPairIndices(rows[r], cols[c]);
        if (inter.length === 0) return false;
        cellArrays.push(inter);
      }
    }
    const used = new Set();
    function solve(idx) {
      if (idx === 9) return true;
      const arr = cellArrays[idx];
      for (let i = 0; i < arr.length; i++) {
        const mIdx = arr[i];
        if (!used.has(mIdx)) {
          used.add(mIdx);
          if (solve(idx + 1)) return true;
          used.delete(mIdx);
        }
      }
      return false;
    }
    return solve(0);
  }

  let preferredPool = [];
  let backupPool = [];

  if (difficulty === "easy") {
    preferredPool = activeCats.filter((c) => c.difficulty === "easy");
    backupPool = activeCats.filter((c) => c.difficulty === "medium");
  } else if (difficulty === "medium") {
    preferredPool = activeCats.filter((c) => c.difficulty === "medium" || c.difficulty === "easy");
    backupPool = activeCats.filter((c) => c.difficulty === "hard");
  } else if (difficulty === "medium_hard") {
    preferredPool = activeCats.filter((c) => c.difficulty === "medium" || c.difficulty === "hard");
    backupPool = activeCats.filter((c) => c.difficulty === "easy");
  } else {
    const hardItems = shuffleWithRng(
      activeCats.filter((c) => c.difficulty === "hard"),
      rng
    );
    const medItems = shuffleWithRng(
      activeCats.filter((c) => c.difficulty === "medium"),
      rng
    );
    preferredPool = [...hardItems, ...medItems];
    backupPool = activeCats.filter((c) => c.difficulty === "easy");
  }

  const rowCandidates = shuffleWithRng(
    preferredPool.filter(
      (c) => c.group === "director" || c.group === "actor" || c.group === "network"
    ),
    rng
  );
  const rowBackup = shuffleWithRng(
    backupPool.filter(
      (c) => c.group === "director" || c.group === "actor" || c.group === "network"
    ),
    rng
  );
  const combinedRows = dedupeCategories([...rowCandidates, ...rowBackup]);

  const colActors = shuffleWithRng(
    preferredPool.filter((c) => c.group === "actor"),
    rng
  );
  const colFeatures = shuffleWithRng(
    preferredPool.filter(
      (c) => c.group !== "director" && c.group !== "network" && c.group !== "actor"
    ),
    rng
  );
  const colBackup = shuffleWithRng(
    [...backupPool, ...activeCats].filter(
      (c) => c.group !== "director" && c.group !== "network"
    ),
    rng
  );

  const interleavedCols = [];
  const maxLen = Math.max(colActors.length, colFeatures.length);
  for (let idx = 0; idx < maxLen; idx++) {
    if (idx < colActors.length) interleavedCols.push(colActors[idx]);
    if (idx < colFeatures.length) interleavedCols.push(colFeatures[idx]);
  }
  const combinedCols = dedupeCategories([...interleavedCols, ...colBackup]);

  if (combinedRows.length >= 3) {
    for (let attempt = 0; attempt < 180; attempt++) {
      const rPool = attempt < 120 ? combinedRows : activeCats;
      if (rPool.length < 3) continue;

      const idx1 = Math.floor(rng() * rPool.length);
      let idx2 = Math.floor(rng() * rPool.length);
      let idx3 = Math.floor(rng() * rPool.length);
      if (idx1 === idx2 || idx1 === idx3 || idx2 === idx3) continue;

      const candidateRows = [rPool[idx1], rPool[idx2], rPool[idx3]];
      const intlInRows = candidateRows.filter((r) => Boolean(r.isInternational)).length;
      if (intlInRows > 1) continue;

      const validCols = [];
      for (let c = 0; c < combinedCols.length; c++) {
        const col = combinedCols[c];
        if (
          getPairIndices(candidateRows[0], col).length > 0 &&
          getPairIndices(candidateRows[1], col).length > 0 &&
          getPairIndices(candidateRows[2], col).length > 0
        ) {
          validCols.push(col);
        }
      }

      if (validCols.length < 3) continue;

      const shuffledValidCols = shuffleWithRng(validCols, rng);
      const limit = Math.min(shuffledValidCols.length, 10);

      for (let c1 = 0; c1 < limit - 2; c1++) {
        for (let c2 = c1 + 1; c2 < limit - 1; c2++) {
          for (let c3 = c2 + 1; c3 < limit; c3++) {
            const candidateCols = [
              shuffledValidCols[c1],
              shuffledValidCols[c2],
              shuffledValidCols[c3]
            ];
            if (!areAxesBalanced(candidateRows, candidateCols)) continue;
            if (!hasNineDistinctFast(candidateRows, candidateCols)) continue;

            const sig = `${candidateRows.map((r) => r.id).join(",")}|${candidateCols
              .map((c) => c.id)
              .join(",")}`;

            if (attempt < 90 && !seedKey && state.recentBoardSignatures.includes(sig)) {
              continue;
            }

            if (!seedKey) {
              state.recentBoardSignatures.push(sig);
              if (state.recentBoardSignatures.length > 35) {
                state.recentBoardSignatures.shift();
              }
            }

            return { rows: candidateRows, cols: candidateCols };
          }
        }
      }
    }
  }

  const fallbackPool = shuffleWithRng(activeCats, rng);
  for (let i = 0; i < fallbackPool.length - 2; i++) {
    for (let j = i + 1; j < fallbackPool.length - 1; j++) {
      for (let k = j + 1; k < fallbackPool.length; k++) {
        const rTriple = [fallbackPool[i], fallbackPool[j], fallbackPool[k]];
        const cMatches = fallbackPool.filter(
          (col) =>
            getPairIndices(rTriple[0], col).length > 0 &&
            getPairIndices(rTriple[1], col).length > 0 &&
            getPairIndices(rTriple[2], col).length > 0
        );
        if (cMatches.length < 3) continue;
        for (let c1 = 0; c1 < cMatches.length - 2; c1++) {
          for (let c2 = c1 + 1; c2 < cMatches.length - 1; c2++) {
            for (let c3 = c2 + 1; c3 < cMatches.length; c3++) {
              const cTriple = [cMatches[c1], cMatches[c2], cMatches[c3]];
              if (hasNineDistinctFast(rTriple, cTriple)) {
                return { rows: rTriple, cols: cTriple };
              }
            }
          }
        }
      }
    }
  }

  return { rows: activeCats.slice(0, 3), cols: activeCats.slice(3, 6) };
}

// ============================================================================
// INITIALIZATION, DEMO SLATE HYDRATION & PLAYBILL WIZARD
// ============================================================================
function init() {
  bindEvents();
  startDailyCountdown();
  hydrateSetupDemoVisuals();

  const params = new URLSearchParams(window.location.search);
  const urlSection = params.get("section");
  const urlMode = params.get("mode");
  const urlRoom = params.get("room");
  const urlRows = params.get("rows");
  const urlCols = params.get("cols");

  if (urlSection === "tv" || urlSection === "movies") {
    state.section = urlSection;
  }

  syncHeaderUI();

  if (urlMode === "online" && urlRows && urlCols) {
    const allCats = getCategoriesForSection(state.section);
    const foundRows = urlRows
      .split(",")
      .map((id) => allCats.find((c) => c.id === id))
      .filter(Boolean);
    const foundCols = urlCols
      .split(",")
      .map((id) => allCats.find((c) => c.id === id))
      .filter(Boolean);

    if (foundRows.length === 3 && foundCols.length === 3) {
      state.mode = "online";
      state.roomCode = urlRoom || Math.random().toString(36).slice(2, 8).toUpperCase();
      launchGameStage({ presetRows: foundRows, presetCols: foundCols, keepScores: false });
      setupOnlineSync();
      showFeedbackPopup(`Joined Multiplayer Room #${state.roomCode}`, "neutral");
      return;
    }
  }

  openSetupWizard();
}

function hydrateSetupDemoVisuals() {
  const demoPanel = document.querySelector(".setup-demo-panel");
  if (!demoPanel) return;
  hydrateHeadshotsInContainer(demoPanel);

  demoPanel.querySelectorAll("[data-demo-movie-id]").forEach((card) => {
    const id = Number(card.getAttribute("data-demo-movie-id"));
    const title = card.getAttribute("data-demo-movie-title") || "";
    hydrateCellPoster(card, { id, title, type: "movie" }, "movies");
  });
}

function toggleModesSidebar(forceOpen = null) {
  const sidebar = document.getElementById("modes-sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggleBtn = document.getElementById("sidebar-toggle-btn");
  if (!sidebar || !backdrop) return;

  const isCurrentlyOpen = sidebar.classList.contains("is-open");
  const shouldOpen = forceOpen !== null ? forceOpen : !isCurrentlyOpen;

  sidebar.classList.toggle("is-open", shouldOpen);
  sidebar.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
  backdrop.classList.toggle("hidden", !shouldOpen);

  if (toggleBtn) {
    toggleBtn.classList.toggle("is-open", shouldOpen);
    toggleBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }
}

function openSetupWizard() {
  state.inSetup = true;
  clearInterval(state.timerInterval);
  document.getElementById("setup-screen")?.classList.remove("hidden");
  document.getElementById("game-stage")?.classList.add("hidden");
  showWizardStep("mode");
}

function showWizardStep(stepName) {
  document.getElementById("wizard-step-mode")?.classList.toggle("hidden", stepName !== "mode");
  document.getElementById("wizard-step-scope")?.classList.toggle("hidden", stepName !== "scope");
  document.getElementById("wizard-step-diff")?.classList.toggle("hidden", stepName !== "diff");
}

function launchGameStage({ presetRows = null, presetCols = null, keepScores = false } = {}) {
  state.inSetup = false;
  document.getElementById("setup-screen")?.classList.add("hidden");
  document.getElementById("game-stage")?.classList.remove("hidden");
  startNewBoard({ presetRows, presetCols, keepScores });
}

// ============================================================================
// UI SYNCHRONIZATION (DAILY GRID NEVER SHOWS DIFFICULTY OR REVEAL ANSWERS)
// ============================================================================
function syncHeaderUI() {
  document.querySelectorAll(".section-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === state.section);
  });
}

function syncStageUI() {
  syncHeaderUI();

  document.querySelectorAll(".mode-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.mode === state.mode);
  });

  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.diff === state.filters.difficulty);
  });

  document.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scope === state.filters.scope);
  });

  const isDaily = state.mode === "daily";
  const isOnlineInvite = state.mode === "online";
  const isSoloStyle = state.mode === "daily" || state.mode === "solo";

  document.getElementById("custom-controls-row")?.classList.toggle("hidden", isDaily);
  document.getElementById("daily-info-bar")?.classList.toggle("hidden", !isDaily);
  document.getElementById("friend-invite-bar")?.classList.toggle("hidden", !isOnlineInvite);

  document.getElementById("solo-scoreboard")?.classList.toggle("hidden", !isSoloStyle);
  document.getElementById("duel-scoreboard")?.classList.toggle("hidden", isSoloStyle);

  const dailyDateLabel = document.getElementById("daily-date-label");
  if (dailyDateLabel) {
    const todayFormatted = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    const secLabel = state.section === "tv" ? "TV SERIES" : "MOVIES";
    dailyDateLabel.textContent = `DAILY ${secLabel} GRID · ${todayFormatted.toUpperCase()}`;
  }

  const pX = document.getElementById("player-x-name");
  const pO = document.getElementById("player-o-name");
  if (pX && pO) {
    if (state.mode === "bot") {
      pX.textContent = "YOU (X)";
      pO.textContent = "CINEMA BOT (O)";
    } else if (state.mode === "random") {
      pX.textContent = "YOU (X)";
      pO.textContent = "ONLINE RIVAL (O)";
    } else if (state.mode === "online") {
      pX.textContent = "HOST (X)";
      pO.textContent = "CHALLENGER (O)";
    } else {
      pX.textContent = "PLAYER 1";
      pO.textContent = "PLAYER 2";
    }
  }
}

// ============================================================================
// START NEW BOARD & RENDER VISUAL 3x3 CINEMA PITCH GRID
// ============================================================================
function startNewBoard({ presetRows = null, presetCols = null, keepScores = true } = {}) {
  state.cells = Array.from({ length: 9 }, () => ({ owner: null, movie: null, revealed: false }));
  state.usedIds = new Set();
  state.turn = "X";
  state.gameOver = false;
  state.winningLine = null;

  if (!keepScores) {
    state.scores = { X: 0, O: 0 };
  }

  if (presetRows && presetCols) {
    state.rows = presetRows;
    state.cols = presetCols;
  } else if (state.mode === "daily") {
    const dailySeed = `shawshank_daily_v7_${getTodayDateKey()}_${state.section}`;
    const board = generateSolvableBoard({
      section: state.section,
      scope: "global",
      difficulty: "medium_hard",
      seedKey: dailySeed
    });
    state.rows = board.rows;
    state.cols = board.cols;
  } else {
    const board = generateSolvableBoard({
      section: state.section,
      scope: state.filters.scope,
      difficulty: state.filters.difficulty,
      seedKey: null
    });
    state.rows = board.rows;
    state.cols = board.cols;
  }

  if (state.mode === "online" && !state.roomCode) {
    state.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    setupOnlineSync();
  }

  syncStageUI();
  renderBoard();
  updateStatusAndScoreboard();
  startThreeMinuteGridTimer();
}

function renderBoard() {
  const grid = document.getElementById("ttt-grid");
  if (!grid) return;
  grid.innerHTML = "";

  // Top-Left Corner Emblem (Box2Box-inspired Royal Gold & Reel Crest)
  const corner = document.createElement("div");
  corner.className = "ttt-corner";
  const badgeTitle = state.section === "tv" ? "TV GRID" : "SHAWSHANK";
  const subLabel =
    state.mode === "daily" ? "DAILY 3×3" : `${state.filters.difficulty.toUpperCase()} 3×3`;
  corner.innerHTML = `
    ${getCornerReelCrestSvg()}
    <span class="corner-crest">${badgeTitle}</span>
    <span class="corner-sub">${subLabel}</span>
  `;
  grid.appendChild(corner);

  // Top Column Headers with Headshots / Trophy / Era Icons
  state.cols.forEach((col, cIdx) => {
    const colEl = document.createElement("div");
    colEl.className = "ttt-header col-header";
    colEl.style.setProperty("--cell-order", String(cIdx + 1));
    const parts = getHeaderDisplayParts(col);
    colEl.innerHTML = `
      <div class="cat-visual-slot">
        ${buildCategoryVisualHTML(col)}
      </div>
      <div class="cat-text-stack">
        <span class="cat-sublabel">${parts.kicker}</span>
        <span class="cat-label">${parts.mainLabel}</span>
      </div>
    `;
    grid.appendChild(colEl);
  });

  // Left Row Headers + 3x3 Pitch Cells
  state.rows.forEach((row, rIdx) => {
    const rowEl = document.createElement("div");
    rowEl.className = "ttt-header row-header";
    rowEl.style.setProperty("--cell-order", String((rIdx + 1) * 4));
    const parts = getHeaderDisplayParts(row);
    rowEl.innerHTML = `
      <div class="cat-visual-slot">
        ${buildCategoryVisualHTML(row)}
      </div>
      <div class="cat-text-stack">
        <span class="cat-sublabel">${parts.kicker}</span>
        <span class="cat-label">${parts.mainLabel}</span>
      </div>
    `;
    grid.appendChild(rowEl);

    for (let cIdx = 0; cIdx < 3; cIdx++) {
      const cellIdx = rIdx * 3 + cIdx;
      const cellData = state.cells[cellIdx];
      const cellEl = document.createElement("button");
      cellEl.type = "button";
      const checkerParity = (rIdx + cIdx) % 2 === 0 ? "pitch-even" : "pitch-odd";
      cellEl.className = `ttt-cell ${checkerParity}`;
      cellEl.dataset.cellIndex = String(cellIdx);
      cellEl.style.setProperty("--cell-order", String((rIdx + 1) * 4 + cIdx + 1));

      if (cellData.owner && cellData.movie) {
        const isRev = Boolean(cellData.revealed);
        cellEl.classList.add("taken", isRev ? "revealed-cell" : "correct-cell");

        const badgeText = isRev
          ? "REVEALED"
          : state.mode === "daily" || state.mode === "solo"
          ? "✓ CORRECT"
          : `PLAYER ${cellData.owner}`;

        cellEl.innerHTML = `
          <span class="cell-mark-badge">${badgeText}</span>
          <div class="cell-poster-frame">
            <div class="cell-poster-fallback">
              ${getEmptyCellClapperSvg()}
            </div>
            <img class="cell-poster-img hidden" alt="${cellData.movie.title}" loading="lazy" />
          </div>
          <div class="cell-movie-title">${cellData.movie.title}</div>
        `;
        hydrateCellPoster(cellEl, cellData.movie, state.section);
      } else {
        cellEl.innerHTML = `
          <div class="cell-empty-watermark">
            ${getEmptyCellClapperSvg()}
          </div>
          <span class="cell-action-label">Select</span>
        `;
        cellEl.addEventListener("click", () => openCellModal(cellIdx));
      }

      grid.appendChild(cellEl);
    }
  });

  // Asynchronously populate real TMDB Actor/Director/Composer portraits
  hydrateHeadshotsInContainer(grid);
}

function updateStatusAndScoreboard() {
  const isSoloStyle = state.mode === "daily" || state.mode === "solo";

  if (isSoloStyle) {
    const solvedCount = state.cells.filter((c) => Boolean(c.owner) && !c.revealed).length;
    const revealedCount = state.cells.filter((c) => Boolean(c.revealed)).length;
    const filledPill = document.getElementById("solo-filled-pill");
    const banner = document.getElementById("ttt-status-banner");

    if (filledPill) filledPill.textContent = `${solvedCount} / 9 SOLVED`;

    if (banner) {
      if (revealedCount > 0) {
        banner.textContent = "All answers revealed on the grid.";
      } else if (solvedCount === 9) {
        banner.textContent = "All 9 squares on the grid solved.";
      } else if (state.gameOver) {
        banner.textContent = `Time elapsed (${solvedCount}/9 solved).`;
      } else {
        banner.textContent = "Select any square on the grid to enter a title.";
      }
    }
  } else {
    const cardX = document.getElementById("score-card-x");
    const cardO = document.getElementById("score-card-o");
    const valX = document.getElementById("score-x-val");
    const valO = document.getElementById("score-o-val");

    if (valX) valX.textContent = String(state.scores.X);
    if (valO) valO.textContent = String(state.scores.O);

    if (cardX && cardO) {
      cardX.classList.toggle("active-turn", !state.gameOver && state.turn === "X");
      cardO.classList.toggle("active-turn", !state.gameOver && state.turn === "O");
    }
  }
}

// ============================================================================
// REVEAL ANSWERS CONFIRMATION & AUTO-COMPLETE THE 3x3 GRID WITH POSTERS
// ============================================================================
function openRevealConfirmModal() {
  if (state.mode === "daily") return;
  document.getElementById("reveal-confirm-modal")?.classList.remove("hidden");
}

function closeRevealConfirmModal() {
  document.getElementById("reveal-confirm-modal")?.classList.add("hidden");
}

function revealAllBoardAnswers() {
  closeRevealConfirmModal();
  if (state.mode === "daily") return;

  const catalog = getCatalogForSection(state.section, state.filters.scope);
  const fullAssignment = findNineDistinctAssignment(state.rows, state.cols, catalog, state.cells);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      if (state.cells[idx].owner) continue;

      let chosenMovie = fullAssignment ? fullAssignment[idx] : null;
      if (!chosenMovie) {
        const rowCat = state.rows[r];
        const colCat = state.cols[c];
        const fallback = catalog.find((m) => {
          const key = `${m.title.toLowerCase()}_${m.year}`;
          return !state.usedIds.has(key) && rowCat.matches(m) && colCat.matches(m);
        });
        chosenMovie =
          fallback || catalog.find((m) => rowCat.matches(m) && colCat.matches(m)) || catalog[0];
      }

      if (chosenMovie) {
        const key = `${chosenMovie.title.toLowerCase()}_${chosenMovie.year}`;
        state.usedIds.add(key);
        state.cells[idx] = {
          owner: "REVEALED",
          movie: chosenMovie,
          revealed: true
        };
      }
    }
  }

  state.gameOver = true;
  clearInterval(state.timerInterval);
  renderBoard();
  updateStatusAndScoreboard();
  broadcastOnlineState();
  showFeedbackPopup("All grid answers revealed.", "neutral");
}

// ============================================================================
// DIRECT ANSWER ENTRY, SKELETON LOADER (#21) & "DID YOU MEAN...?" CHECK
// ============================================================================
function openCellModal(cellIdx) {
  if (state.gameOver) {
    showFeedbackPopup("Round complete. Generate a new board to continue.", "neutral");
    return;
  }

  if ((state.mode === "bot" || state.mode === "random") && state.turn === "O") {
    return;
  }

  if (state.cells[cellIdx].owner) {
    return;
  }

  state.activeCellIndex = cellIdx;
  state.pendingSuggestionItem = null;

  const rIdx = Math.floor(cellIdx / 3);
  const cIdx = cellIdx % 3;
  const rowCat = state.rows[rIdx];
  const colCat = state.cols[cIdx];

  const modal = document.getElementById("search-modal");
  const coordEl = document.getElementById("modal-cell-coord");
  const titleEl = document.getElementById("search-modal-title");
  const inputEl = document.getElementById("movie-search-input");
  const dymBox = document.getElementById("did-you-mean-box");
  const skelBox = document.getElementById("verify-skeleton");

  if (coordEl) coordEl.textContent = `SQUARE R${rIdx + 1}·C${cIdx + 1}`;
  if (titleEl) titleEl.textContent = `${rowCat.label} × ${colCat.label}`;
  if (dymBox) dymBox.classList.add("hidden");
  if (skelBox) skelBox.classList.add("hidden");
  if (inputEl) {
    inputEl.value = "";
    inputEl.placeholder =
      state.section === "tv" ? "Enter series title..." : "Enter film title...";
  }

  modal?.classList.remove("hidden");
  setTimeout(() => inputEl?.focus(), 40);
}

function closeCellModal() {
  document.getElementById("search-modal")?.classList.add("hidden");
  document.getElementById("did-you-mean-box")?.classList.add("hidden");
  document.getElementById("verify-skeleton")?.classList.add("hidden");
  state.activeCellIndex = null;
  state.pendingSuggestionItem = null;
}

async function handleAnswerFormSubmit(e) {
  e.preventDefault();
  const inputEl = document.getElementById("movie-search-input");
  const skelBox = document.getElementById("verify-skeleton");
  const dymBox = document.getElementById("did-you-mean-box");
  const rawGuess = (inputEl?.value || "").trim();
  if (!rawGuess) return;

  dymBox?.classList.add("hidden");
  skelBox?.classList.remove("hidden");

  const result = await verifyTypedAnswer(rawGuess, state.filters, state.section);
  skelBox?.classList.add("hidden");

  if (result.status === "exact" && result.item) {
    evaluateConfirmedTitle(result.item);
    return;
  }

  if (result.status === "suggestion" && result.candidateItem) {
    state.pendingSuggestionItem = result.candidateItem;
    const dymTitle = document.getElementById("dym-title-text");
    if (dymTitle) dymTitle.textContent = `${result.suggestionTitle}?`;
    dymBox?.classList.remove("hidden");
    return;
  }

  showFeedbackPopup("Title not recognized. Check spelling.", "wrong");
}

async function evaluateConfirmedTitle(rawItem) {
  const cellIdx = state.activeCellIndex;
  if (cellIdx === null || cellIdx === undefined) return;

  const skelBox = document.getElementById("verify-skeleton");
  skelBox?.classList.remove("hidden");
  const hydrated = await resolveFullTitle(rawItem, state.section);
  skelBox?.classList.add("hidden");

  const uniqueKey = `${hydrated.title.toLowerCase()}_${hydrated.year}`;

  if (state.usedIds.has(uniqueKey)) {
    closeCellModal();
    triggerWrongCellFlash(cellIdx);
    showFeedbackPopup(`"${hydrated.title}" is already used on this grid.`, "wrong");
    return;
  }

  const rIdx = Math.floor(cellIdx / 3);
  const cIdx = cellIdx % 3;
  const rowCat = state.rows[rIdx];
  const colCat = state.cols[cIdx];

  const matchesRow = rowCat.matches(hydrated);
  const matchesCol = colCat.matches(hydrated);

  closeCellModal();

  const isSoloStyle = state.mode === "daily" || state.mode === "solo";

  if (matchesRow && matchesCol) {
    state.usedIds.add(uniqueKey);
    state.cells[cellIdx] = {
      owner: isSoloStyle ? "X" : state.turn,
      movie: hydrated,
      revealed: false
    };

    renderBoard();
    showFeedbackPopup(`CORRECT: ${hydrated.title}`, "correct");

    if (isSoloStyle) {
      const filled = state.cells.filter((c) => Boolean(c.owner)).length;
      if (filled === 9) {
        state.gameOver = true;
        clearInterval(state.timerInterval);
      }
    } else {
      checkDuelWinOrAdvance();
    }

    updateStatusAndScoreboard();
    broadcastOnlineState();
  } else {
    triggerWrongCellFlash(cellIdx);
    showFeedbackPopup("WRONG ANSWER", "wrong");

    if (!isSoloStyle) {
      advanceTurn();
    }
  }
}

function triggerWrongCellFlash(cellIdx) {
  const cellEl = document.querySelector(`.ttt-cell[data-cell-index="${cellIdx}"]`);
  if (!cellEl) return;
  cellEl.classList.remove("wrong-flash");
  void cellEl.offsetWidth;
  cellEl.classList.add("wrong-flash");
}

// ============================================================================
// 3-MINUTE GRID TIMER (03:00 FOR THE ENTIRE GRID) & TACTICAL MINIMAX BOT AI
// ============================================================================
function startThreeMinuteGridTimer() {
  clearInterval(state.timerInterval);
  state.gridSeconds = GRID_DURATION_SECONDS;
  renderTimerClock();

  state.timerInterval = setInterval(() => {
    if (state.gameOver || state.inSetup) {
      clearInterval(state.timerInterval);
      return;
    }
    state.gridSeconds -= 1;
    renderTimerClock();

    if (state.gridSeconds <= 0) {
      state.gameOver = true;
      clearInterval(state.timerInterval);
      updateStatusAndScoreboard();
      showFeedbackPopup("Time expired (03:00).", "wrong");
    }
  }, 1000);
}

function renderTimerClock() {
  const s = Math.max(0, state.gridSeconds);
  const mins = String(Math.floor(s / 60)).padStart(2, "0");
  const secs = String(s % 60).padStart(2, "0");
  const formatted = `${mins}:${secs}`;

  const soloClock = document.getElementById("solo-timer-display");
  const duelClock = document.getElementById("duel-timer-display");
  if (soloClock) soloClock.textContent = formatted;
  if (duelClock) duelClock.textContent = formatted;
}

function checkDuelWinOrAdvance() {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const owner = state.cells[a].owner;
    if (
      owner &&
      owner !== "REVEALED" &&
      owner === state.cells[b].owner &&
      owner === state.cells[c].owner
    ) {
      state.gameOver = true;
      state.winningLine = line;
      state.scores[owner] += 1;
      clearInterval(state.timerInterval);
      showFeedbackPopup(`Player ${owner} wins the round.`, "correct");
      return;
    }
  }

  const allTaken = state.cells.every((c) => Boolean(c.owner));
  if (allTaken) {
    state.gameOver = true;
    clearInterval(state.timerInterval);
    showFeedbackPopup("Grid complete: Draw.", "neutral");
    return;
  }

  advanceTurn();
}

function advanceTurn() {
  state.turn = state.turn === "X" ? "O" : "X";
  updateStatusAndScoreboard();
  broadcastOnlineState();

  if ((state.mode === "bot" || state.mode === "random") && state.turn === "O" && !state.gameOver) {
    setTimeout(executeOpponentMove, 650);
  }
}

function getBoardArrayWinner(boardArr) {
  for (let i = 0; i < WIN_LINES.length; i++) {
    const [a, b, c] = WIN_LINES[i];
    const v = boardArr[a];
    if (v && v === boardArr[b] && v === boardArr[c]) return v;
  }
  return null;
}

function minimaxScore(boardArr, playableSet, isBotTurn, depth) {
  const winner = getBoardArrayWinner(boardArr);
  if (winner === "O") return 100 - depth;
  if (winner === "X") return depth - 100;

  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (!boardArr[i] && playableSet.has(i)) moves.push(i);
  }
  if (moves.length === 0) return 0;

  if (isBotTurn) {
    let best = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      boardArr[m] = "O";
      const val = minimaxScore(boardArr, playableSet, false, depth + 1);
      boardArr[m] = null;
      if (val > best) best = val;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      boardArr[m] = "X";
      const val = minimaxScore(boardArr, playableSet, true, depth + 1);
      boardArr[m] = null;
      if (val < best) best = val;
    }
    return best;
  }
}

function chooseSmartBotSquare(playableIndices) {
  const playableSet = new Set(playableIndices);
  const boardArr = state.cells.map((c) => (c.owner === "X" || c.owner === "O" ? c.owner : null));

  for (const [a, b, c] of WIN_LINES) {
    const line = [a, b, c];
    const oCount = line.filter((idx) => boardArr[idx] === "O").length;
    const openIdx = line.find((idx) => !boardArr[idx] && playableSet.has(idx));
    if (oCount === 2 && openIdx !== undefined) return openIdx;
  }

  for (const [a, b, c] of WIN_LINES) {
    const line = [a, b, c];
    const xCount = line.filter((idx) => boardArr[idx] === "X").length;
    const openIdx = line.find((idx) => !boardArr[idx] && playableSet.has(idx));
    if (xCount === 2 && openIdx !== undefined) return openIdx;
  }

  const positionalBonus = [3, 1, 3, 1, 5, 1, 3, 1, 3];
  let bestMove = playableIndices[0];
  let bestScore = -Infinity;

  for (const idx of playableIndices) {
    boardArr[idx] = "O";
    const score = minimaxScore(boardArr, playableSet, false, 0) * 10 + positionalBonus[idx];
    boardArr[idx] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }

  return bestMove;
}

function executeOpponentMove() {
  if (state.gameOver || (state.mode !== "bot" && state.mode !== "random") || state.turn !== "O") {
    return;
  }

  const catalog = getCatalogForSection(state.section, state.filters.scope);
  const choicesBySquare = new Map();

  for (let idx = 0; idx < 9; idx++) {
    if (state.cells[idx].owner) continue;
    const rIdx = Math.floor(idx / 3);
    const cIdx = idx % 3;
    const rowCat = state.rows[rIdx];
    const colCat = state.cols[cIdx];

    const validChoices = catalog.filter((m) => {
      const key = `${m.title.toLowerCase()}_${m.year}`;
      return !state.usedIds.has(key) && rowCat.matches(m) && colCat.matches(m);
    });

    if (validChoices.length > 0) {
      choicesBySquare.set(idx, validChoices);
    }
  }

  const playableIndices = Array.from(choicesBySquare.keys());
  if (playableIndices.length === 0) {
    advanceTurn();
    return;
  }

  const targetIdx = chooseSmartBotSquare(playableIndices);
  const validChoices = choicesBySquare.get(targetIdx) || [];
  const pick = validChoices[Math.floor(Math.random() * validChoices.length)];

  if (pick) {
    state.usedIds.add(`${pick.title.toLowerCase()}_${pick.year}`);
    state.cells[targetIdx] = { owner: "O", movie: pick, revealed: false };
    const rivalName = state.mode === "random" ? "Online Rival" : "Cinema Bot";
    showFeedbackPopup(`${rivalName}: ${pick.title}`, "neutral");
    checkDuelWinOrAdvance();
    renderBoard();
    updateStatusAndScoreboard();
  } else {
    advanceTurn();
  }
}

// ============================================================================
// DAILY COUNTDOWN & LEGAL MODALS (#26 & #27)
// ============================================================================
function startDailyCountdown() {
  const updateClock = () => {
    const el = document.getElementById("daily-countdown");
    if (!el) return;
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diffSec = Math.max(0, Math.floor((tomorrow - now) / 1000));
    const hrs = String(Math.floor(diffSec / 3600)).padStart(2, "0");
    const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
    const secs = String(diffSec % 60).padStart(2, "0");
    el.textContent = `Next grid in ${hrs}:${mins}:${secs}`;
  };
  updateClock();
  clearInterval(state.dailyCountdownInterval);
  state.dailyCountdownInterval = setInterval(updateClock, 1000);
}

function openLegalModal(kind) {
  const modal = document.getElementById("legal-modal");
  const kicker = document.getElementById("legal-modal-kicker");
  const title = document.getElementById("legal-modal-title");
  const body = document.getElementById("legal-modal-body");
  if (!modal || !title || !body) return;

  if (kind === "tos") {
    if (kicker) kicker.textContent = "TERMS OF SERVICE";
    title.textContent = "Terms of Service";
    body.innerHTML = `
      <p><strong>1. Usage &amp; Fair Play:</strong> Shawshank Deduction provides a daily and infinite 3×3 cinema and television deduction game for personal, non-commercial entertainment.</p>
      <p><strong>2. Catalog &amp; Metadata Attribution:</strong> Film and television metadata are cross-referenced via TMDB and TheTVDB APIs. Shawshank Deduction is an independent trivia index and is not endorsed or certified by TMDB, TheTVDB, or AMPAS.</p>
      <p><strong>3. Multiplayer Conduct:</strong> Private invite links synchronize board state directly between participating browsers.</p>
    `;
  } else {
    if (kicker) kicker.textContent = "PRIVACY POLICY";
    title.textContent = "Privacy Policy";
    body.innerHTML = `
      <p><strong>1. Zero Account Tracking:</strong> Shawshank Deduction does not collect personal names, email addresses, or third-party advertising cookies.</p>
      <p><strong>2. Local Browser Storage:</strong> Game preferences and active session state are stored locally in your browser session.</p>
      <p><strong>3. Third-Party API Requests:</strong> Title verification queries are sent over HTTPS to TMDB and TheTVDB solely to resolve film and series credits.</p>
    `;
  }

  modal.classList.remove("hidden");
}

let popupTimeout = null;
function showFeedbackPopup(message, variant = "neutral") {
  const popup = document.getElementById("feedback-popup");
  if (!popup) return;
  clearTimeout(popupTimeout);
  popup.textContent = message;
  popup.className = `feedback-popup ${variant}`;
  popup.classList.remove("hidden");

  popupTimeout = setTimeout(() => {
    popup.classList.add("hidden");
  }, 1650);
}

// ============================================================================
// MULTIPLAYER INVITE LINK & SYNC
// ============================================================================
function copyFriendInviteLink() {
  if (!state.roomCode) {
    state.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  const url = new URL(window.location.href);
  url.searchParams.set("section", state.section);
  url.searchParams.set("mode", "online");
  url.searchParams.set("room", state.roomCode);
  url.searchParams.set("rows", state.rows.map((r) => r.id).join(","));
  url.searchParams.set("cols", state.cols.map((c) => c.id).join(","));

  const shareUrl = url.toString();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showFeedbackPopup("Invite link copied to clipboard.", "correct");
    });
  } else {
    showFeedbackPopup("Invite link ready.", "neutral");
  }
}

function setupOnlineSync() {
  if (!state.roomCode || typeof BroadcastChannel === "undefined") return;
  if (state.channel) state.channel.close();
  state.channel = new BroadcastChannel(`shawshank_room_${state.roomCode}`);
  state.channel.onmessage = (ev) => {
    const data = ev.data;
    if (!data || data.type !== "SYNC_BOARD") return;
    state.cells = data.cells;
    state.turn = data.turn;
    state.scores = data.scores;
    state.gameOver = data.gameOver;
    state.winningLine = data.winningLine;
    state.usedIds = new Set(data.usedIds || []);
    renderBoard();
    updateStatusAndScoreboard();
  };
}

function broadcastOnlineState() {
  if (state.mode !== "online" || !state.channel) return;
  state.channel.postMessage({
    type: "SYNC_BOARD",
    cells: state.cells,
    turn: state.turn,
    scores: state.scores,
    gameOver: state.gameOver,
    winningLine: state.winningLine,
    usedIds: Array.from(state.usedIds)
  });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function bindEvents() {
  document.getElementById("brand-home-trigger")?.addEventListener("click", openSetupWizard);
  document.getElementById("open-setup-btn")?.addEventListener("click", openSetupWizard);
  document.getElementById("daily-setup-btn")?.addEventListener("click", openSetupWizard);

  document.getElementById("sidebar-toggle-btn")?.addEventListener("click", () => {
    toggleModesSidebar();
  });
  document.getElementById("sidebar-backdrop")?.addEventListener("click", () => {
    toggleModesSidebar(false);
  });
  document.getElementById("sidebar-mode-ttt")?.addEventListener("click", () => {
    toggleModesSidebar(false);
  });

  document.querySelectorAll("[data-wizard-mode]").forEach((card) => {
    card.addEventListener("click", () => {
      const chosenMode = card.dataset.wizardMode;
      if (!chosenMode) return;
      state.mode = chosenMode;

      if (chosenMode === "daily") {
        launchGameStage({ keepScores: false });
      } else {
        showWizardStep("scope");
      }
    });
  });

  document.querySelectorAll("[data-wizard-scope]").forEach((card) => {
    card.addEventListener("click", () => {
      const chosenScope = card.dataset.wizardScope;
      if (!chosenScope) return;
      state.filters.scope = chosenScope;
      showWizardStep("diff");
    });
  });

  document.querySelectorAll("[data-wizard-diff]").forEach((card) => {
    card.addEventListener("click", () => {
      const chosenDiff = card.dataset.wizardDiff;
      if (!chosenDiff) return;
      state.filters.difficulty = chosenDiff;
      launchGameStage({ keepScores: false });
    });
  });

  document.getElementById("back-to-step-mode")?.addEventListener("click", () => {
    showWizardStep("mode");
  });
  document.getElementById("back-to-step-scope")?.addEventListener("click", () => {
    showWizardStep("scope");
  });

  document.querySelectorAll(".section-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextSection = btn.dataset.section;
      if (!nextSection || nextSection === state.section) return;
      state.section = nextSection;
      syncHeaderUI();
      if (!state.inSetup) {
        startNewBoard({ keepScores: false });
      }
    });
  });

  document.querySelectorAll(".mode-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const nextMode = pill.dataset.mode;
      if (!nextMode || nextMode === state.mode) return;
      state.mode = nextMode;
      startNewBoard({ keepScores: false });
    });
  });

  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextDiff = btn.dataset.diff;
      if (!nextDiff || state.mode === "daily") return;
      state.filters.difficulty = nextDiff;
      startNewBoard({ keepScores: true });
      showFeedbackPopup(`${nextDiff.toUpperCase()} GRID INITIALIZED`, "neutral");
    });
  });

  document.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextScope = btn.dataset.scope;
      if (!nextScope || state.mode === "daily") return;
      state.filters.scope = nextScope;
      startNewBoard({ keepScores: true });
    });
  });

  document.getElementById("ttt-new-board-btn")?.addEventListener("click", () => {
    if (state.mode === "daily") return;
    startNewBoard({ keepScores: true });
    showFeedbackPopup("NEW 3×3 BOARD INITIALIZED", "neutral");
  });

  document.getElementById("reveal-board-btn")?.addEventListener("click", openRevealConfirmModal);
  document.getElementById("confirm-reveal-yes-btn")?.addEventListener("click", revealAllBoardAnswers);
  document.getElementById("confirm-reveal-no-btn")?.addEventListener("click", closeRevealConfirmModal);
  document.getElementById("reveal-confirm-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "reveal-confirm-modal") closeRevealConfirmModal();
  });

  document.getElementById("open-tos-btn")?.addEventListener("click", () => openLegalModal("tos"));
  document
    .getElementById("open-privacy-btn")
    ?.addEventListener("click", () => openLegalModal("privacy"));
  document.getElementById("close-legal-modal")?.addEventListener("click", () => {
    document.getElementById("legal-modal")?.classList.add("hidden");
  });

  document.getElementById("copy-invite-link-btn")?.addEventListener("click", copyFriendInviteLink);

  document.getElementById("skip-turn-btn")?.addEventListener("click", () => {
    if (state.gameOver) return;
    advanceTurn();
  });

  document.getElementById("answer-submit-form")?.addEventListener("submit", handleAnswerFormSubmit);
  document.getElementById("cancel-answer-btn")?.addEventListener("click", closeCellModal);

  document.getElementById("dym-accept-btn")?.addEventListener("click", () => {
    if (state.pendingSuggestionItem) {
      evaluateConfirmedTitle(state.pendingSuggestionItem);
    }
  });
  document.getElementById("dym-reject-btn")?.addEventListener("click", () => {
    document.getElementById("did-you-mean-box")?.classList.add("hidden");
    document.getElementById("movie-search-input")?.focus();
  });

  document.getElementById("movie-search-input")?.addEventListener("input", () => {
    document.getElementById("did-you-mean-box")?.classList.add("hidden");
  });

  document.getElementById("search-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "search-modal") closeCellModal();
  });
  document.getElementById("legal-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "legal-modal") {
      document.getElementById("legal-modal")?.classList.add("hidden");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
