// Token Radar: a comps-based implied-value model for pre-token protocols.
//
// The board covers every slug in the sealed snapshot's watchlist (the floor, never the
// ceiling) and adds the strongest pre-token protocols below the floor, by TVL.
//
// Implied value is earned from the snapshot's own figures, never from a name list:
// for each pre-token protocol the model prices it like the launched protocols in the
// same category (their market-cap / TVL ratios), shrunk toward the global launched
// median where a category has few comparables:
//
//   comps(p)    = launched protocols in p's category, TVL >= $5M, ratio in [0.001, 5]
//   catMedian   = median ratio of comps(p) (null when fewer than 3 comps)
//   globalMed   = median ratio of all launched protocols
//   multiple    = catMedian ? (n*catMedian + 6*globalMed) / (n + 6) : globalMed
//   multiple    = clamp(multiple, 0.02, 1.50)
//   growthMult  = 1 + clamp(change_7d, -60, 120) / 100 * 0.5
//   maturity    = 0.6 + min(age_days ?? 365, 1095) / 1095 * 0.4
//   implied     = max(1, round(tvl_usd * multiple * growthMult * maturity))
//
// A protocol records no token (all three of mcap_usd, gecko_id, symbol null); the board
// says so and never claims it has none. Wrapped, staked and bridged products of tokens
// that already trade, exchanges and versioned pools are never ranked as launches.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One launched comparable: a protocol whose token already trades. */
export interface Comp {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** The comparables table for one category. */
export interface CategoryComps {
  median: number | null;
  n: number;
  top: Comp[];
}

/** Everything the model needs to price a row, derived from the snapshot alone. */
export interface CompTable {
  globalMedian: number;
  byCategory: Map<string, CategoryComps>;
}

/** The model's constants. */
export const MODEL = {
  growthWeight: 0.5,
  growthFloor: -60,
  growthCap: 120,
  maturityFloor: 0.6,
  maturityRange: 0.4,
  maturityDays: 1095,
  unknownAgeDays: 365,
  shrinkWeight: 6,
  minCategoryComps: 3,
  multipleFloor: 0.02,
  multipleCap: 1.5,
  minCompTvl: 5_000_000,
  ratioFloor: 0.001,
  ratioCap: 5,
} as const;

export const MODEL_VERSION = 'radar-2-comps';

/** How many pre-token protocols below the watchlist floor the early radar carries. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comp_multiple: number;
    comp_median: number | null;
    comp_count: number;
    global_median: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, as a positional array:
 * [rank, slug, name, catIdx, chainIdxs, tvl_usd, change_7d, age_days,
 *  implied_value_usd, comp_multiple, comp_count, growth_multiplier,
 *  maturity_multiplier, watchlist 0/1]. */
export type RadarRow = [number, string, string, number, number[], number, number | null, number | null, number, number, number, number, number, number];

/** A live-token protocol: [slug, name, catIdx, chainIdxs, tvl_usd, mcap_usd, change_7d]. */
export type LiveRow = [string, string, number, number[], number, number | null, number | null];

/** Everything the dashboard needs, in compact arrays. */
export interface RadarData {
  meta: {
    as_of: string;
    source: string;
    floor_usd: number;
    model_version: string;
    global_median: number;
    watchlist_size: number;
    board_size: number;
    early_size: number;
    live_size: number;
  };
  cats: string[];
  chains: string[];
  comps: Record<string, [number | null, number, [string, number][]]>;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories whose tokens, when they exist, are not comparable launches. */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Exchange names a protocol may not start with (the watchlist rule). */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whole words that mark a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol is one the board may rank as a launch candidate. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The comparables universe: launched protocols whose ratio is a usable multiple. */
export function buildCompTable(snapshot: Snapshot): CompTable {
  const usable: Comp[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd < MODEL.minCompTvl) continue;
    if (p.category !== null && (p.category === 'CEX' || p.category === 'Bridge' || p.category === 'Canonical Bridge' || p.category === 'Cross Chain Bridge' || p.category === 'Token Locker')) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio < MODEL.ratioFloor || ratio > MODEL.ratioCap) continue;
    usable.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio });
  }
  const globalMedian = median(usable.map((c) => c.ratio)) ?? 0.17;
  const byCategory = new Map<string, CategoryComps>();
  const cats = new Map<string, Comp[]>();
  for (const c of usable) {
    const key = c.category ?? '(no category)';
    const list = cats.get(key) ?? [];
    list.push(c);
    cats.set(key, list);
  }
  for (const [cat, list] of cats) {
    const top = [...list].sort((a, b) => b.mcap_usd - a.mcap_usd).slice(0, 3);
    byCategory.set(cat, { median: median(list.map((c) => c.ratio)), n: list.length, top });
  }
  return { globalMedian, byCategory };
}

/** The comp multiple for a protocol's category, shrunk toward the global median. */
export function compMultiple(category: string | null, table: CompTable): { multiple: number; median: number | null; count: number } {
  const key = category ?? '(no category)';
  const entry = table.byCategory.get(key);
  if (entry !== undefined && entry.n >= MODEL.minCategoryComps && entry.median !== null) {
    const multiple = clamp((entry.n * entry.median + MODEL.shrinkWeight * table.globalMedian) / (entry.n + MODEL.shrinkWeight), MODEL.multipleFloor, MODEL.multipleCap);
    return { multiple, median: entry.median, count: entry.n };
  }
  return { multiple: clamp(table.globalMedian, MODEL.multipleFloor, MODEL.multipleCap), median: null, count: entry?.n ?? 0 };
}

/** The multipliers and implied value one protocol gets under the comps model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  table: CompTable,
): { implied: number; multiple: number; median: number | null; count: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, median: catMedian, count } = compMultiple(protocol.category, table);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, MODEL.growthFloor, MODEL.growthCap);
  const growthMult = 1 + (growthPct / 100) * MODEL.growthWeight;
  const ageForModel = age ?? MODEL.unknownAgeDays;
  const maturityMult = MODEL.maturityFloor + (Math.min(Math.max(ageForModel, 0), MODEL.maturityDays) / MODEL.maturityDays) * MODEL.maturityRange;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, median: catMedian, count, growthPct, growthMult, maturityMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, table: CompTable): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, table) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      comp_multiple: round4(s.v.multiple),
      comp_median: s.v.median === null ? null : round4(s.v.median),
      comp_count: s.v.count,
      global_median: round4(table.globalMedian),
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('liquidity')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and open one small delta-neutral position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then leave it to settle.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${name} and use its native apps once a week, starting with its flagship DEX.`;
  if (c.includes('payment')) return `Route $${capital} of real payments through ${name} on ${chain} over the next month.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s governance vault on ${chain} and vote on the next proposal.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a list
 * of names. The dashboard regenerates these same steps from the same inputs, so the page
 * and board.json always agree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const chain2 = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const capital2 = Math.max(25, Math.round(capital / 2));
  const hold = holdDaysFor(age);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week on ${p.name}, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
  ];
  if (chain2 !== null) {
    steps.push({
      text: `Repeat the core position on ${chain2} with $${capital2} so the farming covers a second chain the protocol runs on.`,
      cost: `$${capital2} of capital and about $4 of gas`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Add a second position type on ${p.name} - if you supplied, also swap once through its market - so the wallet shows more than one action.`,
      cost: 'about $5 of gas',
      time: '10 minutes',
    });
  }
  steps.push(
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Keep a farm log of the wallet, the dates and every transaction, and unwind in tranches if a token launches.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS);
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, table: CompTable): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, table);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;

  const catIndex = new Map<string, number>();
  const chainIndex = new Map<string, number>();
  const cats: string[] = [];
  const chains: string[] = [];
  const catId = (c: string | null): number => {
    const key = c ?? '(no category)';
    let id = catIndex.get(key);
    if (id === undefined) {
      id = cats.length;
      catIndex.set(key, id);
      cats.push(key);
    }
    return id;
  };
  const chainIds = (list: string[]): number[] =>
    list.map((c) => {
      let id = chainIndex.get(c);
      if (id === undefined) {
        id = chains.length;
        chainIndex.set(c, id);
        chains.push(c);
      }
      return id;
    });

  const comps: Record<string, [number | null, number, [string, number][]]> = {};
  for (const [cat, entry] of table.byCategory) {
    const id = catId(cat);
    comps[String(id)] = [
      entry.median === null ? null : round4(entry.median),
      entry.n,
      entry.top.map((t): [string, number] => [t.name, Math.round(t.ratio * 1000) / 1000]),
    ];
  }

  const radar: RadarData = {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model_version: MODEL_VERSION,
      global_median: round4(table.globalMedian),
      watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      early_size: early,
      live_size: live.length,
    },
    cats,
    chains,
    comps,
    rows: board.map((r): RadarRow => [
      r.rank,
      r.slug,
      r.name,
      catId(r.category),
      chainIds(r.chains),
      r.tvl_usd,
      r.change_7d === null ? null : Math.round(r.change_7d * 100) / 100,
      r.age_days,
      r.implied_value_usd,
      Math.round(r.model.comp_multiple * 1000) / 1000,
      r.model.comp_count,
      Math.round(r.model.growth_multiplier * 1000) / 1000,
      Math.round(r.model.maturity_multiplier * 1000) / 1000,
      snapshot.watchlist.includes(r.slug) ? 1 : 0,
    ]),
    live: live.map((p): LiveRow => [
      p.slug,
      p.name,
      catId(p.category),
      chainIds(p.chains),
      p.tvl_usd,
      p.mcap_usd,
      p.change_7d === null ? null : Math.round(p.change_7d * 100) / 100,
    ]),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
