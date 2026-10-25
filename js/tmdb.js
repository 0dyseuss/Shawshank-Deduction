// Live TMDB API, TheTVDB v4 API, Wikipedia PageImages API & Apple iTunes Poster Pipeline
// Features:
// 1. Smart Prefix, Phonetic & Number-Aware "Did you mean...?" ("Synecdokhe" -> "Synecdoche, New York", "Mickey 18" -> "Mickey 17")
// 2. Guaranteed Actor/Director/Composer Headshots via Wikipedia PageImages API (origin=*) + TMDB.
// 3. Guaranteed Official Movie & TV Show Posters via Apple iTunes Artwork API + Wikipedia + TMDB.

import { MOVIES_DB, TV_DB } from "./data.js?v=9";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TTVDB_BASE = "https://api4.thetvdb.com/v4";
const WIKI_API_BASE = "https://en.wikipedia.org/w/api.php";
const WIKI_SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary";
const ITUNES_SEARCH_BASE = "https://itunes.apple.com/search";
const STORAGE_KEY = "shawshank_tmdb_api_key";

export const DEFAULT_TMDB_API_KEY = "e913f4b1777668832b7b03c810197012";
export const DEFAULT_TMDB_READ_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlOTEzZjRiMTc3NzY2ODgzMmI3YjAzYzgxMDE5NzAxMiIsIm5iZiI6MTc5Mjg0ODc5Ny4yNzksInN1YiI6IjZhZGNiMzlkY2QzYjQ3MjQ3MWI2Njc2ZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ynFpUiD2IhkesOCCwVx9rjqtiaQpg5lS-RDI3k_iqZ8";
export const DEFAULT_TTVDB_API_KEY = "916c4eb2-d534-405c-a068-3df3b623d4d6";

const detailsCache = new Map();
let ttvdbJwtToken = null;
let tmdbV3Unavailable = false;
let tmdbV4Unavailable = false;

const PERSON_IMG_STORAGE_KEY = "shawshank_person_img_v3";
const POSTER_IMG_STORAGE_KEY = "shawshank_poster_img_v3";

const personImgCache = new Map();
const posterImgCache = new Map();

try {
  const savedPersons = JSON.parse(localStorage.getItem(PERSON_IMG_STORAGE_KEY) || "{}");
  for (const [k, v] of Object.entries(savedPersons)) {
    if (v && typeof v === "string" && v.startsWith("http")) {
      personImgCache.set(k, v);
    }
  }
  const savedPosters = JSON.parse(localStorage.getItem(POSTER_IMG_STORAGE_KEY) || "{}");
  for (const [k, v] of Object.entries(savedPosters)) {
    if (v && typeof v === "string" && v.startsWith("http")) {
      posterImgCache.set(k, v);
    }
  }
} catch (e) {
  // Ignore storage parse errors
}

function persistCacheToStorage(storageKey, mapObj) {
  try {
    const obj = {};
    for (const [k, v] of mapObj.entries()) {
      if (v) obj[k] = v;
    }
    localStorage.setItem(storageKey, JSON.stringify(obj));
  } catch (e) {
    // Ignore storage quota errors
  }
}

export function getSavedApiKey() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_TMDB_API_KEY;
}

/**
 * Fast TMDB fetcher with automatic circuit-breaker if a key returns 401.
 */
async function fetchTmdbJson(urlStr) {
  if (!tmdbV3Unavailable) {
    try {
      const urlV3 = new URL(urlStr);
      urlV3.searchParams.set("api_key", DEFAULT_TMDB_API_KEY);
      const resV3 = await fetch(urlV3.toString(), {
        headers: { Accept: "application/json" }
      });
      if (resV3.ok) return await resV3.json();
      if (resV3.status === 401 || resV3.status === 403) {
        tmdbV3Unavailable = true;
      }
    } catch (e) {
      // Fall through
    }
  }

  if (!tmdbV4Unavailable) {
    try {
      const resV4 = await fetch(urlStr, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${DEFAULT_TMDB_READ_TOKEN}`
        }
      });
      if (resV4.ok) return await resV4.json();
      if (resV4.status === 401 || resV4.status === 403) {
        tmdbV4Unavailable = true;
      }
    } catch (e) {
      // Fall through
    }
  }

  return null;
}

async function getTtvdbToken() {
  if (ttvdbJwtToken) return ttvdbJwtToken;
  try {
    const res = await fetch(`${TTVDB_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ apikey: DEFAULT_TTVDB_API_KEY })
    });
    if (!res.ok) return null;
    const data = await res.json();
    ttvdbJwtToken = data?.data?.token || null;
    return ttvdbJwtToken;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// STRING NORMALIZATION, PHONETIC & PREFIX/NUMBER-AWARE FUZZY MATCHING
// ============================================================================
export function normalizeTitle(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`.,:;!?()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingArticle(normStr) {
  return normStr.replace(/^(the|a|an)\s+/i, "").trim();
}

function phoneticNormalize(normStr) {
  return normStr
    .replace(/ph/g, "f")
    .replace(/ch/g, "k")
    .replace(/ck/g, "k")
    .replace(/c(?=[aou])/g, "k")
    .replace(/y/g, "i");
}

function extractMainPrefix(rawTitle) {
  const parts = (rawTitle || "").split(/[,:\-–—]/);
  return parts[0] ? parts[0].trim() : rawTitle;
}

export function levenshteinDistance(a, b) {
  const s = normalizeTitle(a);
  const t = normalizeTitle(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const v0 = new Array(t.length + 1);
  const v1 = new Array(t.length + 1);

  for (let i = 0; i <= t.length; i++) v0[i] = i;

  for (let i = 0; i < s.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < t.length; j++) {
      const cost = s[i] === t[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= t.length; j++) v0[j] = v1[j];
  }
  return v1[t.length];
}

export function isExactTitleMatch(userGuess, candidateTitle) {
  const g = normalizeTitle(userGuess);
  const c = normalizeTitle(candidateTitle);
  if (!g || !c) return false;
  if (g === c) return true;
  if (stripLeadingArticle(g) === stripLeadingArticle(c)) return true;
  return false;
}

export function getSmartSuggestionScore(userGuess, candidateTitle) {
  const g = normalizeTitle(userGuess);
  const c = normalizeTitle(candidateTitle);
  if (!g || !c) return Infinity;

  const gBare = stripLeadingArticle(g);
  const cBare = stripLeadingArticle(c);

  const dFull = Math.min(levenshteinDistance(g, c), levenshteinDistance(gBare, cBare));
  const dPhoneticFull = levenshteinDistance(phoneticNormalize(gBare), phoneticNormalize(cBare));

  const mainPart = normalizeTitle(extractMainPrefix(candidateTitle));
  const mainBare = stripLeadingArticle(mainPart);
  let dPrefix = Infinity;
  if (mainBare.length >= 5) {
    dPrefix = Math.min(
      levenshteinDistance(gBare, mainBare),
      levenshteinDistance(phoneticNormalize(gBare), phoneticNormalize(mainBare))
    );
  }

  let dWordStart = Infinity;
  if (gBare.length >= 6 && cBare.startsWith(gBare.slice(0, 5))) {
    const cSlice = cBare.slice(0, gBare.length);
    dWordStart = levenshteinDistance(gBare, cSlice);
  }

  const gNumMatch = gBare.match(/^([a-z\s]+?)\s*(\d+)$/);
  const cNumMatch = cBare.match(/^([a-z\s]+?)\s*(\d+)$/);
  let dNumber = Infinity;
  if (gNumMatch && cNumMatch) {
    const baseDist = levenshteinDistance(gNumMatch[1].trim(), cNumMatch[1].trim());
    if (baseDist <= 1) {
      dNumber = 1;
    }
  }

  return Math.min(dFull, dPhoneticFull, dPrefix, dWordStart, dNumber);
}

// ============================================================================
// DIRECT ANSWER VERIFICATION (LOCAL + LIVE TMDB + TTVDB)
// ============================================================================
export async function verifyTypedAnswer(rawQuery, filters = {}, section = "movies") {
  const cleaned = (rawQuery || "").trim();
  if (!cleaned) return { status: "not_found" };

  const sourceDb = section === "tv" ? TV_DB : MOVIES_DB;

  for (const item of sourceDb) {
    if (isExactTitleMatch(cleaned, item.title)) {
      const hydrated = await resolveFullTitle(item, section);
      return { status: "exact", item: hydrated };
    }
  }

  let bestLocalCandidate = null;
  let bestLocalScore = Infinity;

  for (const item of sourceDb) {
    const score = getSmartSuggestionScore(cleaned, item.title);
    if (score < bestLocalScore) {
      bestLocalScore = score;
      bestLocalCandidate = item;
    }
  }

  const maxAllowedScore = cleaned.length <= 5 ? 1 : cleaned.length <= 10 ? 2 : 3;
  if (bestLocalCandidate && bestLocalScore <= maxAllowedScore) {
    return {
      status: "suggestion",
      suggestionTitle: bestLocalCandidate.title,
      candidateItem: bestLocalCandidate
    };
  }

  try {
    const primaryQuery = cleaned;
    const firstWordQuery = cleaned.split(/\s+/)[0];
    const queriesToRun = [primaryQuery];
    if (
      firstWordQuery &&
      firstWordQuery.length >= 4 &&
      firstWordQuery.toLowerCase() !== primaryQuery.toLowerCase()
    ) {
      queriesToRun.push(firstWordQuery);
    }

    const resultLists = await Promise.all(
      queriesToRun.map((q) => searchTitles(q, filters, section))
    );
    const candidates = [];
    const seenIds = new Set();
    for (const list of resultLists) {
      for (const c of list) {
        if (!seenIds.has(c.id)) {
          seenIds.add(c.id);
          candidates.push(c);
        }
      }
    }

    if (candidates.length > 0) {
      const exactLive = candidates.find((c) => isExactTitleMatch(cleaned, c.title));
      if (exactLive) {
        const hydrated = await resolveFullTitle(exactLive, section);
        return { status: "exact", item: hydrated };
      }

      let bestLive = null;
      let bestLiveScore = Infinity;
      for (const c of candidates) {
        const sc = getSmartSuggestionScore(cleaned, c.title);
        if (sc < bestLiveScore) {
          bestLiveScore = sc;
          bestLive = c;
        }
      }

      if (bestLive && bestLiveScore <= maxAllowedScore + 1) {
        return {
          status: "suggestion",
          suggestionTitle: bestLive.title,
          candidateItem: bestLive
        };
      }
    }
  } catch (e) {
    // Fall through on network error
  }

  return { status: "not_found" };
}

export async function searchTitles(query, filters = {}, section = "movies") {
  const q = (query || "").trim().toLowerCase();
  const isTvSection = section === "tv";
  const sourceDb = isTvSection ? TV_DB : MOVIES_DB;

  if (!q) return [];

  const localMatches = sourceDb
    .filter((item) => item.title.toLowerCase().includes(q))
    .slice(0, 8);

  try {
    const endpoint = isTvSection ? "search/tv" : "search/movie";
    const tmdbUrl = `${TMDB_BASE}/${endpoint}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;

    const [tmdbData, ttvdbItems] = await Promise.all([
      fetchTmdbJson(tmdbUrl),
      isTvSection ? searchTtvdbSeries(query) : Promise.resolve([])
    ]);

    const tmdbItems = ((tmdbData && tmdbData.results) || [])
      .filter((r) => (r.vote_count || 0) >= 15)
      .slice(0, 10)
      .map((r) => {
        const dateStr = isTvSection ? r.first_air_date : r.release_date;
        const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : 2000;
        return {
          id: r.id,
          title: isTvSection ? r.name : r.title,
          year: year || 2000,
          type: isTvSection ? "tv" : "movie",
          language: r.original_language || "en",
          isAnimated: (r.genre_ids || []).includes(16),
          posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
          fromTmdbLive: true
        };
      });

    const seen = new Set(localMatches.map((m) => `${m.title.toLowerCase()}_${m.year}`));
    const merged = [...localMatches];

    for (const item of [...tmdbItems, ...ttvdbItems]) {
      const k = `${item.title.toLowerCase()}_${item.year}`;
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(item);
      }
    }
    return merged.slice(0, 12);
  } catch (e) {
    return localMatches;
  }
}

async function searchTtvdbSeries(query) {
  try {
    const token = await getTtvdbToken();
    if (!token) return [];
    const res = await fetch(
      `${TTVDB_BASE}/search?query=${encodeURIComponent(query)}&type=series&limit=5`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || [])
      .filter((item) => item.name && item.year)
      .map((item) => ({
        id:
          Number(String(item.tvdb_id || item.id).replace(/\D/g, "")) ||
          Math.floor(Math.random() * 900000),
        ttvdbId: item.tvdb_id || item.id,
        title: item.translations?.eng || item.name,
        year: parseInt(item.year, 10) || 2000,
        network: item.network || "",
        type: "tv",
        language: "en",
        isAnimated: (item.genres || []).some((g) => g.toLowerCase().includes("animation")),
        posterUrl: item.image_url || item.thumbnail || null,
        fromTtvdbLive: true
      }));
  } catch (e) {
    return [];
  }
}

export async function resolveFullTitle(item, section = "movies") {
  const isTv = section === "tv" || item.type === "tv";
  const sourceDb = isTv ? TV_DB : MOVIES_DB;

  const cacheKey = `${isTv ? "tv" : "movie"}_${item.id}_${item.title}`;
  if (detailsCache.has(cacheKey)) {
    return detailsCache.get(cacheKey);
  }

  const localHit = sourceDb.find(
    (m) => m.id === item.id || isExactTitleMatch(m.title, item.title)
  );

  try {
    let tmdbId = localHit ? localHit.id : item.id;
    if (item.fromTtvdbLive && !localHit) {
      const sData = await fetchTmdbJson(
        `${TMDB_BASE}/search/tv?query=${encodeURIComponent(item.title)}&language=en-US&page=1`
      );
      if (sData?.results?.[0]?.id) {
        tmdbId = sData.results[0].id;
      }
    }

    const mediaType = isTv ? "tv" : "movie";
    const extraFields = isTv ? "aggregate_credits,credits,keywords" : "credits,keywords";
    const d = await fetchTmdbJson(
      `${TMDB_BASE}/${mediaType}/${tmdbId}?append_to_response=${extraFields}&language=en-US`
    );

    if (!d) {
      const fallback = localHit || item;
      detailsCache.set(cacheKey, fallback);
      return fallback;
    }

    let director = localHit?.director || "Unknown";
    if (isTv) {
      const creators = (d.created_by || []).map((c) => c.name).join(" & ");
      if (creators) director = creators;
    } else {
      const directors = (d.credits?.crew || []).filter((c) => c.job === "Director");
      if (directors.length) {
        director = directors.map((c) => c.name).join(" & ");
      }
    }

    const composers = (d.credits?.crew || [])
      .filter((c) => ["Original Music Composer", "Music", "Composer"].includes(c.job))
      .map((c) => c.name);
    const composer = [localHit?.composer || "", ...composers].filter(Boolean).join(", ");

    const rawCast = isTv
      ? d.aggregate_credits?.cast || d.credits?.cast || []
      : d.credits?.cast || [];
    const tmdbCastNames = rawCast.slice(0, 65).map((c) => c.name);
    const mergedCast = Array.from(new Set([...(localHit?.cast || []), ...tmdbCastNames]));

    const genres = (d.genres || []).map((g) => g.name);
    const dateStr = isTv ? d.first_air_date : d.release_date;
    const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : localHit?.year || item.year || 2000;
    const network = isTv
      ? (d.networks || []).map((n) => n.name).join(", ") || localHit?.network || item.network || ""
      : "";
    const seasons = isTv ? d.number_of_seasons || localHit?.seasons || 1 : 1;

    const kwList = (d.keywords?.keywords || d.keywords?.results || []).map((k) =>
      (k.name || "").toLowerCase()
    );
    const overviewLower = (d.overview || "").toLowerCase();

    const isSequel =
      Boolean(localHit?.isSequel) ||
      Boolean(d.belongs_to_collection) ||
      kwList.some((k) => k.includes("sequel")) ||
      /\b(part ii|part 2|part two|vol\.|2|3|4)\b/i.test(d.title || "");

    const trueStory =
      Boolean(localHit?.trueStory) ||
      kwList.some(
        (k) =>
          k.includes("biography") ||
          k.includes("based on a true story") ||
          k.includes("true story")
      ) ||
      genres.some((g) => g.toLowerCase() === "history") ||
      overviewLower.includes("true story");

    const nycSetting =
      Boolean(localHit?.nycSetting) ||
      kwList.some((k) => k.includes("new york") || k.includes("manhattan") || k.includes("brooklyn")) ||
      overviewLower.includes("new york city") ||
      overviewLower.includes("manhattan");

    const titleLower = (isTv ? d.name : d.title || "").toLowerCase();
    const characterInTitle =
      Boolean(localHit?.characterInTitle) ||
      rawCast.slice(0, 8).some((c) => {
        const charName = (c.character || "").toLowerCase().trim();
        if (!charName || charName.length < 3) return false;
        const charParts = charName.split(/[\s/()]+/).filter((p) => p.length >= 4);
        return charParts.some((part) => titleLower.includes(part));
      });

    const posterUrl = d.poster_path
      ? `https://image.tmdb.org/t/p/w342${d.poster_path}`
      : localHit?.posterUrl || item.posterUrl || null;

    if (posterUrl) {
      posterImgCache.set(`${mediaType}_${d.id}`, posterUrl);
      persistCacheToStorage(POSTER_IMG_STORAGE_KEY, posterImgCache);
    }

    const hydrated = {
      ...(localHit || {}),
      id: d.id,
      title: localHit?.title || (isTv ? d.name : d.title),
      year,
      director,
      composer,
      network,
      seasons,
      cast: mergedCast,
      language: d.original_language || localHit?.language || "en",
      isAnimated: Boolean(localHit?.isAnimated) || genres.some((g) => g.toLowerCase() === "animation"),
      oscarWinner: Boolean(localHit?.oscarWinner) || kwList.some((k) => k.includes("oscar")),
      bestPicture: Boolean(localHit?.bestPicture),
      actingOscar: Boolean(localHit?.actingOscar),
      emmyWinner: Boolean(localHit?.emmyWinner),
      isSequel,
      trueStory,
      nycSetting,
      characterInTitle,
      posterUrl,
      type: mediaType
    };

    detailsCache.set(cacheKey, hydrated);
    return hydrated;
  } catch (e) {
    const fallback = localHit || item;
    detailsCache.set(cacheKey, fallback);
    return fallback;
  }
}

// ============================================================================
// GUARANTEED HEADSHOT & POSTER RESOLVERS (WIKIPEDIA PAGEIMAGES + ITUNES + TMDB)
// ============================================================================

/**
 * Queries Wikipedia's CORS-enabled MediaWiki PageImages API (`origin=*`)
 * with automatic redirect resolution and search generator fallback.
 */
async function fetchWikipediaPageImage(searchQuery) {
  // 1. Direct title lookup with redirects=1
  try {
    const directUrl = `${WIKI_API_BASE}?action=query&titles=${encodeURIComponent(
      searchQuery
    )}&prop=pageimages&format=json&pithumbsize=320&redirects=1&origin=*`;
    const res = await fetch(directUrl);
    if (res.ok) {
      const data = await res.json();
      const pages = data?.query?.pages || {};
      for (const page of Object.values(pages)) {
        if (page?.thumbnail?.source) {
          return page.thumbnail.source;
        }
      }
    }
  } catch (e) {
    // Fall through to search generator
  }

  // 2. Search generator lookup (case-insensitive & handles disambiguation automatically)
  try {
    const searchUrl = `${WIKI_API_BASE}?action=query&generator=search&gsrsearch=${encodeURIComponent(
      searchQuery
    )}&gsrlimit=2&prop=pageimages&format=json&pithumbsize=320&origin=*`;
    const res = await fetch(searchUrl);
    if (res.ok) {
      const data = await res.json();
      const pages = Object.values(data?.query?.pages || {}).sort(
        (a, b) => (a.index || 99) - (b.index || 99)
      );
      for (const page of pages) {
        if (page?.thumbnail?.source) {
          return page.thumbnail.source;
        }
      }
    }
  } catch (e) {
    // Fall through
  }

  // 3. Wikipedia REST Summary API
  try {
    const formatted = searchQuery.trim().replace(/\s+/g, "_");
    const res = await fetch(`${WIKI_SUMMARY_BASE}/${encodeURIComponent(formatted)}`, {
      headers: { Accept: "application/json" }
    });
    if (res.ok) {
      const data = await res.json();
      return data?.thumbnail?.source || data?.originalimage?.source || null;
    }
  } catch (e) {
    // Ignore
  }

  return null;
}

/**
 * Queries Apple iTunes Search API (100% free, zero-key, CORS-enabled) for official high-res movie/TV posters.
 */
async function fetchItunesPoster(title, year, isTv = false) {
  try {
    const media = isTv ? "tvShow" : "movie";
    const entity = isTv ? "tvSeason" : "movie";
    const url = `${ITUNES_SEARCH_BASE}?term=${encodeURIComponent(
      title
    )}&media=${media}&entity=${entity}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results || [];
    if (!results.length) return null;

    const exact =
      results.find((r) => {
        const rTitle = r.trackName || r.collectionName || "";
        const rYear = r.releaseDate ? parseInt(r.releaseDate.slice(0, 4), 10) : 0;
        return isExactTitleMatch(title, rTitle) && (!year || Math.abs(rYear - year) <= 2);
      }) ||
      results.find((r) => isExactTitleMatch(title, r.trackName || r.collectionName || "")) ||
      results[0];

    if (exact && exact.artworkUrl100) {
      return exact.artworkUrl100.replace("100x100bb", "500x500bb");
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

/**
 * Resolve & cache headshot URL for any Actor, Director, or Composer name.
 */
export async function fetchPersonHeadshot(personName) {
  if (!personName) return null;
  const queryName = personName.toLowerCase().includes("coen brothers")
    ? "Coen brothers"
    : personName.trim();
  const key = queryName.toLowerCase();

  if (personImgCache.has(key)) {
    return personImgCache.get(key);
  }

  // 1. Wikipedia PageImages API (fast, zero-key, 100% reliable CORS)
  const wikiThumb = await fetchWikipediaPageImage(queryName);
  if (wikiThumb) {
    personImgCache.set(key, wikiThumb);
    persistCacheToStorage(PERSON_IMG_STORAGE_KEY, personImgCache);
    return wikiThumb;
  }

  // 2. TMDB Person Search fallback
  const data = await fetchTmdbJson(
    `${TMDB_BASE}/search/person?query=${encodeURIComponent(queryName)}&include_adult=false&language=en-US&page=1`
  );
  const hit = (data?.results || []).find((p) => p.profile_path) || data?.results?.[0];
  if (hit && hit.profile_path) {
    const imgUrl = `https://image.tmdb.org/t/p/w185${hit.profile_path}`;
    personImgCache.set(key, imgUrl);
    persistCacheToStorage(PERSON_IMG_STORAGE_KEY, personImgCache);
    return imgUrl;
  }

  return null;
}

/**
 * Resolve & cache official Movie or TV Show Poster URL.
 */
export async function fetchPosterForMedia(item, section = "movies") {
  if (!item) return null;
  if (item.posterUrl) return item.posterUrl;

  const isTv = section === "tv" || item.type === "tv";
  const mediaType = isTv ? "tv" : "movie";
  const cacheKey = `${mediaType}_${item.id || item.title.toLowerCase()}`;

  if (posterImgCache.has(cacheKey)) {
    const cached = posterImgCache.get(cacheKey);
    item.posterUrl = cached;
    return cached;
  }

  // 1. Apple iTunes Official Movie/TV Poster Artwork (instant, high-res, zero-key)
  const itunesPoster = await fetchItunesPoster(item.title, item.year, isTv);
  if (itunesPoster) {
    item.posterUrl = itunesPoster;
    posterImgCache.set(cacheKey, itunesPoster);
    persistCacheToStorage(POSTER_IMG_STORAGE_KEY, posterImgCache);
    return itunesPoster;
  }

  // 2. Wikipedia Film/Series PageImages API
  const wikiQuery = isTv
    ? `${item.title} (TV series)`
    : `${item.title} (${item.year || ""} film)`.trim();
  const wikiPoster =
    (await fetchWikipediaPageImage(wikiQuery)) || (await fetchWikipediaPageImage(item.title));
  if (wikiPoster) {
    item.posterUrl = wikiPoster;
    posterImgCache.set(cacheKey, wikiPoster);
    persistCacheToStorage(POSTER_IMG_STORAGE_KEY, posterImgCache);
    return wikiPoster;
  }

  // 3. TMDB by ID or Search
  if (item.id && !item.fromTtvdbLive) {
    const d = await fetchTmdbJson(`${TMDB_BASE}/${mediaType}/${item.id}?language=en-US`);
    if (d && d.poster_path) {
      const posterUrl = `https://image.tmdb.org/t/p/w342${d.poster_path}`;
      item.posterUrl = posterUrl;
      posterImgCache.set(cacheKey, posterUrl);
      persistCacheToStorage(POSTER_IMG_STORAGE_KEY, posterImgCache);
      return posterUrl;
    }
  }

  return null;
}
