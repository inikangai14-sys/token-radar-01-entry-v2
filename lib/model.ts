// Token Radar v2 — the value model, written fresh for this entry.
//
// The question: if a protocol with no token issued one tomorrow, what would
// it be worth, given only its DefiLlama record? The answer is a product of
// five factors, each read off the snapshot's own figures, never off a list
// of names. v2's change of heart versus a size-led board: size is damped
// hard (a 0.30 power), so a protocol's TVL sets its order of magnitude and
// the other four factors decide the order inside it. A mid-size protocol
// that is growing fast, live on many chains and old enough to be overdue
// can outrank a giant that is flat and single-chain.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface Factor {
  label: string;
  factor: number;
  detail: string;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  tvl_usd: number;
  change_7d: number | null;
  chains: number;
  age_days: number | null;
  watchlist: boolean;
  factors: Factor[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

export interface Radar {
  asOf: string;
  floorUsd: number;
  boardSize: number;
  watchlistSize: number;
  rows: BoardRow[];
  live: LiveRow[];
  check: { launched: number; checked: number; checkedAt: string | null };
}

export interface RadarResult {
  board: BoardRow[];
  radar: Radar;
  early_size: number;
  live_size: number;
}

/** A protocol records a token when DefiLlama carries either of its two token fields. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * A launch candidate is a protocol with no token that is not a wrapped,
 * staked or bridged product of one that trades. This mirrors the house
 * watchlist rule, minus parentProtocol, which the snapshot does not carry.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (hasToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((e) => lower.startsWith(e.toLowerCase()))) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  return true;
}

/** Whole days from the protocol's first tracking day to the snapshot date. */
export function ageDays(p: SnapshotProtocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [ly, lm, ld] = p.listed_at.split('-').map(Number);
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(ly, lm - 1, ld);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

const CATEGORY_UP = new Set([
  'Dexs',
  'Lending',
  'Yield',
  'Yield Aggregator',
  'Restaking',
  'RWA',
  'Stablecoin Wrapper',
]);

const CATEGORY_DOWN = new Set(['Insurance', 'CeDeFi', 'Chain', 'Staking Pool']);

/** The base every implied value is built from: $120M for a $100M-TVL protocol at neutral factors. */
export const BASE_USD = 120_000_000;

/**
 * Score one protocol. Size is a 0.30 power of TVL over $100M, so the largest
 * protocol outscores the smallest candidate about 3x on size alone, and
 * momentum (±60%), maturity (±30%), breadth (+30%) and readiness (+10%)
 * can reorder the board. Every factor is shown with its number so the
 * dashboard's waterfall adds up in front of the reader.
 */
export function scoreProtocol(p: SnapshotProtocol, asOf: string): { value: number; factors: Factor[] } {
  const size = Math.pow(p.tvl_usd / 100_000_000, 0.3);
  const d7 = p.change_7d === null ? 0 : Math.max(-40, Math.min(60, p.change_7d));
  const momentum = 1 + d7 / 100;
  const age = ageDays(p, asOf);
  let maturity: number;
  let maturityNote: string;
  if (age === null) {
    maturity = 0.9;
    maturityNote = 'first tracked day unknown, neutral 0.90';
  } else {
    maturity = 0.75 + 0.25 * Math.min(age / 730, 1);
    maturityNote = `${age} days tracked`;
    if (age < 120) {
      maturity *= 0.9;
      maturityNote += ', under 120 days so ×0.90';
    }
  }
  const breadth = 1 + 0.025 * Math.min(Math.max(p.chains.length - 1, 0), 12);
  const categoryFactor =
    p.category !== null && CATEGORY_UP.has(p.category)
      ? 1.08
      : p.category !== null && CATEGORY_DOWN.has(p.category)
        ? 0.94
        : 1.0;
  const ready = (p.change_7d ?? 0) > 3 && p.chains.length >= 3;
  const readiness = ready ? 1.1 : 1.0;

  const value = Math.round(BASE_USD * size * momentum * maturity * breadth * categoryFactor * readiness);
  const factors: Factor[] = [
    { label: 'Base', factor: BASE_USD, detail: '$120M for a $100M-TVL protocol at neutral factors' },
    {
      label: 'Size',
      factor: round3(size),
      detail: `TVL $${formatUsd(p.tvl_usd)} as (TVL / $100M)^0.30`,
    },
    {
      label: 'Momentum',
      factor: round3(momentum),
      detail:
        p.change_7d === null
          ? '7-day change unreported, treated as 0%'
          : `TVL ${p.change_7d >= 0 ? '+' : ''}${p.change_7d}% over 7 days, clamped to -40..+60`,
    },
    { label: 'Maturity', factor: round3(maturity), detail: maturityNote },
    {
      label: 'Breadth',
      factor: round3(breadth),
      detail: `${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}: +2.5% each past the first, to +30%`,
    },
    {
      label: 'Category',
      factor: categoryFactor,
      detail:
        p.category === null
          ? 'no category recorded, neutral'
          : categoryFactor > 1
            ? `${p.category}: token launches are common here, ×1.08`
            : categoryFactor < 1
              ? `${p.category}: token launches are rare here, ×0.94`
              : `${p.category}: neutral`,
    },
    {
      label: 'Readiness',
      factor: readiness,
      detail: ready ? 'growing over +3% in 7 days on 3+ chains, ×1.10' : 'no acceleration signal, ×1.00',
    },
  ];
  return { value, factors };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** Parse and lightly validate the sealed snapshot. Throws on malformed input. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (typeof raw.as_of !== 'string' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: expected as_of, protocols[] and watchlist[]');
  }
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error('snapshot: a protocol is missing slug, name or tvl_usd');
    }
  }
  return raw;
}

const STEP_TEMPLATES: Record<string, string[]> = {
  Lending: [
    'Supply {asset} as collateral on {name} ({chain}) and borrow a stablecoin against it; a $500 deposit with a 60% loan-to-value keeps the health factor above 1.5 and costs about $3–$8 in gas.',
    'Keep the loan open and repay the interest weekly for 6–8 weeks; the borrow rate runs roughly 3–8% a year, so $500 borrowed costs about $0.30–$0.80 a week.',
  ],
  Dexs: [
    'Swap $50–$200 through {name} on {chain} once a week for 6 weeks, using a different pair each time; each swap costs about $0.50–$3 in gas plus the pool fee.',
    'Add $100–$300 of liquidity to one {name} pool and hold the position for at least a month; expect roughly 5–20% a year in fees, and impermanent loss if the pair moves hard.',
  ],
  Yield: [
    'Deposit $100–$500 of {asset} into a {name} vault on {chain} and leave it compounding for 4–8 weeks; vault fees run about 0–2% a year and one deposit costs $1–$5 in gas.',
    'Claim or restake the vault yield weekly so the position shows repeated activity; each claim is one transaction of about $1–$4.',
  ],
  Restaking: [
    'Restake $100–$500 of {asset} through {name} on {chain}; the restaking lock is typically 7–14 days to exit, so only use funds you can leave alone for a month.',
    'Delegate the restaked position to two or more operators and leave it for 6–8 weeks; operator fees run about 0–10% of the staking yield.',
  ],
  RWA: [
    'Buy $100–$500 of {name} yield-bearing assets on {chain} and hold them for 4–8 weeks; the position accrues real-world yield of roughly 4–9% a year and one purchase costs $1–$5.',
    'Reinvest the yield into the same position monthly so the balance grows every month; each reinvestment is one transaction of about $1–$4.',
  ],
};

const GENERIC_STEPS: string[] = [
  'Bridge {amount} of {asset} to {chain} with the chain’s official bridge or a reputable aggregator; allow 10–30 minutes and about $2–$10 in gas and bridge fees.',
  'Open {name} on {chain} and connect the same wallet you will farm with; using one wallet for the whole plan keeps the activity in one place.',
  'Use the protocol at least once a week for 6–8 weeks, with $50–$200 per visit, so the history reads as a real user and not a single-day airdrop hunter.',
  'Track your position, any points or quests, and the protocol’s announcements on its own dashboard each week; screenshot each milestone in case eligibility is later disputed.',
  'Plan the exit before any token event: unwind in tranches over several days instead of all at once, because exits spike gas and slippage when everyone leaves together.',
  'Remember a token may never come: only farm with funds you can afford to leave in the protocol, and never pay anyone who promises to guarantee an airdrop.',
];

/** Fill the {placeholders} of a step template with this protocol's own figures. */
function fillStep(template: string, p: SnapshotProtocol): string {
  const chain = p.chains[0] ?? 'Ethereum';
  const asset = p.chains.includes('Ethereum') ? 'ETH' : p.chains.includes('Solana') ? 'SOL' : 'USDC';
  const amount = p.tvl_usd >= 500_000_000 ? '$100–$300' : p.tvl_usd >= 50_000_000 ? '$50–$200' : '$25–$100';
  return template
    .replaceAll('{name}', p.name)
    .replaceAll('{chain}', chain)
    .replaceAll('{asset}', asset)
    .replaceAll('{amount}', amount)
    .replaceAll('{category}', p.category ?? 'DeFi');
}

/**
 * Six concrete farm steps for one protocol: the category's two moves first,
 * then the generic bridge, wallet, cadence and exit steps. Every step names
 * a cost or a time, and every step is 20 to 600 characters.
 */
export function farmSteps(p: SnapshotProtocol): string[] {
  const key = p.category === 'Yield Aggregator' ? 'Yield' : (p.category ?? '');
  const specific = STEP_TEMPLATES[key] ?? [];
  const steps = [...specific, ...GENERIC_STEPS].slice(0, 6).map((t) => fillStep(t, p));
  return steps.map((s) => (s.length > 600 ? s.slice(0, 597) + '...' : s));
}

/**
 * Rank every launch candidate in the snapshot. The board holds all 40
 * watchlist protocols plus every pre-token protocol below the floor that
 * passes the same candidate rule — the early ones the radar exists to find.
 * Protocols that already have a token are set aside as the live list.
 */
export function buildRadar(snapshot: Snapshot, check?: { launched: number; checked: number; checkedAt: string | null }): RadarResult {
  const watch = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isLaunchCandidate);
  const scored = candidates.map((p) => {
    const { value, factors } = scoreProtocol(p, snapshot.as_of);
    return { p, value, factors };
  });
  scored.sort((a, b) => b.value - a.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  // Values must fall as rank rises; nudge by a dollar only where rounding ties them.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.value >= scored[i - 1]!.value) scored[i]!.value = scored[i - 1]!.value - 1;
  }

  const board: BoardRow[] = scored.map(({ p, value, factors }, i) => ({
    slug: p.slug,
    name: p.name,
    rank: i + 1,
    implied_value_usd: value,
    farm_steps: farmSteps(p),
    category: p.category,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    chains: p.chains.length,
    age_days: ageDays(p, snapshot.as_of),
    watchlist: watch.has(p.slug),
    factors,
  }));

  const live: LiveRow[] = snapshot.protocols
    .filter(hasToken)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd ?? 0 }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd || b.tvl_usd - a.tvl_usd)
    .slice(0, 30);

  const radar: Radar = {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    boardSize: board.length,
    watchlistSize: snapshot.watchlist.length,
    rows: board,
    live,
    check: check ?? { launched: 0, checked: 0, checkedAt: null },
  };
  return { board, radar, early_size: board.length - snapshot.watchlist.length, live_size: live.length };
}

/** The gate's own shape checks, run before anything is written. Returns a reason or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, the gate needs at least 100`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!slugs.has(row.slug)) return `row ${i + 1} names ${row.slug}, which the snapshot does not list`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `row ${i + 1} carries rank ${row.rank}, ranks must run 1 to ${board.length}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, the gate needs 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${row.slug} has a farm step of ${trimmed.length} characters, the gate needs 20 to 600`;
      }
    }
  }
  if (board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return 'every implied value is the same, the board ranks nothing';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: the whole radar as one deterministic assignment. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
