// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's
// own inputs and the protocol's farm plan, and the already-launched view. No network: every
// byte it shows is in data.js. Hash routing for deep links: #detail=<slug>, #cat=<name>,
// #chain=<name>, #q=<text>, #wl=1, #tab=live. When there is no document (a test harness
// loading this file in Node), nothing renders, but window.__farmSteps stays available.
(function () {
  'use strict';

  var DATA = typeof window !== 'undefined' ? window.RADAR : null;

  // --- the farm plan, the same generator main.ts runs for board.json -----------------
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function capitalFor(tvl) {
    if (tvl >= 5000000000) return 250;
    if (tvl >= 1000000000) return 150;
    if (tvl >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('bridge') !== -1) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') !== -1 || c.indexOf('yield') !== -1 || c.indexOf('farm') !== -1 || c.indexOf('liquidity') !== -1) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('restak') !== -1 || c.indexOf('staking') !== -1) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1 || c.indexOf('basis') !== -1) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small delta-neutral position.';
    if (c.indexOf('prediction') !== -1) return 'Fund $' + capital + ' and place one market position on ' + name + ', then leave it to settle.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('stable') !== -1) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') !== -1) return 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('insurance') !== -1) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') !== -1) return 'Bridge $' + capital + ' to ' + name + ' and use its native apps once a week, starting with its flagship DEX.';
    if (c.indexOf('payment') !== -1) return 'Route $' + capital + ' of real payments through ' + name + ' on ' + chain + ' over the next month.';
    if (c.indexOf('governance') !== -1) return 'Deposit $' + capital + ' into ' + name + '\'s governance vault on ' + chain + ' and vote on the next proposal.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(p) {
    var chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
    var chain2 = p.chains.length > 1 ? p.chains[1] : null;
    var capital = capitalFor(p.tvl_usd);
    var capital2 = Math.max(25, Math.round(capital / 2));
    var hold = holdDaysFor(p.age_days);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week on ' + p.name + ', such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' }
    ];
    if (chain2 !== null) {
      steps.push({ text: 'Repeat the core position on ' + chain2 + ' with $' + capital2 + ' so the farming covers a second chain the protocol runs on.', cost: '$' + capital2 + ' of capital and about $4 of gas', time: '15 minutes' });
    } else {
      steps.push({ text: 'Add a second position type on ' + p.name + ' - if you supplied, also swap once through its market - so the wallet shows more than one action.', cost: 'about $5 of gas', time: '10 minutes' });
    }
    steps.push(
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open ' + p.name + '\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Keep a farm log of the wallet, the dates and every transaction, and unwind in tranches if a token launches.', cost: 'nothing but the log', time: '5 minutes' }
    );
    return steps.map(stepText);
  }
  if (typeof window !== 'undefined') window.__farmSteps = farmSteps;
  if (!DATA || typeof document === 'undefined') return;

  // --- decoding --------------------------------------------------------------------
  function dec(a) {
    return { rank: a[0], slug: a[1], name: a[2], cat: DATA.cats[a[3]], chains: a[4].map(function (i) { return DATA.chains[i]; }), tvl: a[5], chg: a[6], age: a[7], implied: a[8], mult: a[9], compN: a[10], gMult: a[11], mMult: a[12], wl: a[13] === 1, intercept: a[14], rawMult: a[15] };
  }
  function decLive(a) {
    return { slug: a[0], name: a[1], cat: DATA.cats[a[2]], chains: a[3].map(function (i) { return DATA.chains[i]; }), tvl: a[4], mcap: a[5], chg: a[6] };
  }
  var rows = DATA.rows.map(dec);
  var liveRows = DATA.live.map(decLive);
  var watchlist = {};
  rows.forEach(function (r) { if (r.wl) watchlist[r.slug] = true; });

  // --- formatting ------------------------------------------------------------------
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtFull(n) { return usd0.format(n); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }

  // --- header, method, footer -------------------------------------------------------
  var totalImplied = rows.reduce(function (s, r) { return s + r.implied; }, 0);
  var bt = DATA.meta.backtest;
  var btLine = bt ? ' · LOO backtest on ' + bt.loo_n + ' launched: curve MSLE ' + bt.curve_msle.toFixed(4) +
    ' vs median ' + bt.v1_msle.toFixed(4) + ' · within 2× ' + Math.round(bt.curve_within2x * 100) + '% vs ' + Math.round(bt.v1_within2x * 100) + '%' : '';
  $('chips').innerHTML =
    '<span class="chip">Watchlist <b>' + DATA.meta.watchlist_size + '</b></span>' +
    '<span class="chip">Board <b>' + DATA.meta.board_size + '</b> rows</span>' +
    '<span class="chip">Total implied <b>' + fmtUsd(totalImplied) + '</b></span>' +
    '<span class="chip">Curve slope <b>' + DATA.meta.curve_slope.toFixed(3) + '</b></span>' +
    '<span class="chip">Global comp median <b>' + DATA.meta.global_median.toFixed(3) + '&times;</b></span>';
  $('methodMeta').textContent = 'Snapshot ' + DATA.meta.as_of + ' · watchlist floor $50,000,000 · model ' + DATA.meta.model_version +
    ' · fitted slope ' + DATA.meta.curve_slope.toFixed(4) + ' · global launched mcap/TVL median ' + DATA.meta.global_median.toFixed(3) + '× · ' + DATA.meta.board_size + ' rows (' +
    DATA.meta.watchlist_size + ' watchlist + ' + DATA.meta.early_size + ' early)' + btLine + '.';
  $('asOf').textContent = DATA.meta.as_of;
  $('src').textContent = DATA.meta.source;

  // --- the backtest, as a table + a predicted-vs-actual scatter ----------------------
  (function renderBacktest() {
    var box = $('btWrap');
    if (!box || !bt) return;
    function pct(x) { return (x * 100).toFixed(1) + '%'; }
    var html = '<table class="bttable"><thead><tr><th>Leave-one-out backtest, ' + bt.loo_n +
      ' launched protocols</th><th class="num">v1 category median</th><th class="num">v5 curve</th></tr></thead><tbody>' +
      '<tr><td>Mean squared log error</td><td class="num">' + bt.v1_msle.toFixed(4) + '</td><td class="num"><b>' + bt.curve_msle.toFixed(4) + '</b></td></tr>' +
      '<tr><td>Mean absolute log error</td><td class="num">' + bt.v1_mae_log.toFixed(4) + '</td><td class="num"><b>' + bt.curve_mae_log.toFixed(4) + '</b></td></tr>' +
      '<tr><td>Predicted within 2&times; of true market cap</td><td class="num">' + pct(bt.v1_within2x) + '</td><td class="num"><b>' + pct(bt.curve_within2x) + '</b></td></tr>' +
      '</tbody></table>';
    // Held-out predictions against the truth: one dot per launched protocol, x = its
    // real log market cap, y = what the curve predicted with it held out. The diagonal
    // is exact; dots above it were over-predicted, below it under-predicted. Teal dots
    // landed within 2x, amber ones missed by more.
    if (bt.points && bt.points.length) {
      var pts = bt.points;
      var W = 400, H = 210, PL = 40, PR = 10, PT = 10, PB = 24;
      var all = pts.reduce(function (a, p) { return a.concat([p[0], p[1]]); }, []);
      var lo = Math.min.apply(null, all) - 0.5, hi = Math.max.apply(null, all) + 0.5;
      function X(v) { return PL + (v - lo) / (hi - lo) * (W - PL - PR); }
      function Y(v) { return PT + (hi - v) / (hi - lo) * (H - PT - PB); }
      function f(n, d) { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }
      var within = pts.filter(function (p) { return Math.abs(p[1] - p[0]) <= Math.log(2); }).length;
      var s = '<figure class="bt-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Held-out predictions against true market caps">';
      s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0a1224" rx="8"/>';
      [13.8155, 16.1181, 18.4207, 20.7233, 23.0259].forEach(function (lv, i) {
        if (lv < lo || lv > hi) return;
        var lbl = ['$1M', '$10M', '$100M', '$1B', '$10B'][i];
        s += '<line x1="' + f(X(lv), 1) + '" y1="' + PT + '" x2="' + f(X(lv), 1) + '" y2="' + (H - PB) + '" stroke="#16223c" stroke-width="1"/>';
        s += '<line x1="' + PL + '" y1="' + f(Y(lv), 1) + '" x2="' + (W - PR) + '" y2="' + f(Y(lv), 1) + '" stroke="#16223c" stroke-width="1"/>';
        s += '<text x="' + f(X(lv), 1) + '" y="' + (H - 8) + '" fill="#8fa3bf" font-size="9" font-family="monospace" text-anchor="middle">' + lbl + '</text>';
        s += '<text x="' + (PL - 4) + '" y="' + f(Y(lv) + 3, 1) + '" fill="#8fa3bf" font-size="9" font-family="monospace" text-anchor="end">' + lbl + '</text>';
      });
      s += '<line x1="' + f(X(lo), 1) + '" y1="' + f(Y(lo), 1) + '" x2="' + f(X(hi), 1) + '" y2="' + f(Y(hi), 1) + '" stroke="#f5b942" stroke-width="1.5"/>';
      pts.forEach(function (p) {
        var ok = Math.abs(p[1] - p[0]) <= Math.log(2);
        s += '<circle cx="' + f(X(p[0]), 1) + '" cy="' + f(Y(p[1]), 1) + '" r="2.8" fill="' + (ok ? '#2dd4bf' : '#f87171') + '" fill-opacity="0.9"/>';
      });
      s += '</svg><figcaption>Held-out predictions vs truth, ' + pts.length + ' launched protocols — ' + within +
        ' within 2&times;. Above the line the curve over-predicted, below it under-predicted; the misses sit at both ends, where the snapshot has few comparables.</figcaption></figure>';
      html += s;
    }
    box.innerHTML = html;
  })();

  // --- the fitted curve, drawn ------------------------------------------------------
  // One dot per launched protocol: log TVL against log mcap/TVL. The line is the
  // fitted size curve at the global median intercept: log ratio = intercept +
  // (slope - 1) * log TVL. Pick a category above the chart to draw that category's
  // own line and highlight its protocols instead. Pure SVG, no network, drawn from
  // DATA.curvePts and DATA.curveCats.
  var curveCat = null;
  function renderCurve() {
    var box = $('curveChart');
    if (!box || !DATA.curvePts || !DATA.curvePts.length) return;
    var pts = DATA.curvePts;
    var W = 400, H = 150, PL = 34, PR = 8, PT = 8, PB = 22;
    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs) - 0.3, x1 = Math.max.apply(null, xs) + 0.3;
    var y0 = Math.min.apply(null, ys) - 0.4, y1 = Math.max.apply(null, ys) + 0.4;
    function X(v) { return PL + (v - x0) / (x1 - x0) * (W - PL - PR); }
    function Y(v) { return PT + (y1 - v) / (y1 - y0) * (H - PT - PB); }
    function f(n, d) { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }
    var slope = DATA.meta.curve_slope, inter = DATA.meta.curve_global_intercept;
    var selIdx = -1, selName = null, selN = 0;
    if (curveCat !== null) {
      selName = curveCat;
      selIdx = DATA.cats.indexOf(curveCat);
      for (var ci = 0; ci < DATA.curveCats.length; ci++) {
        if (DATA.curveCats[ci][0] === curveCat) { inter = DATA.curveCats[ci][1]; break; }
      }
      pts.forEach(function (p) { if (p[2] === selIdx) selN++; });
    }
    var lineY0 = inter + (slope - 1) * x0, lineY1 = inter + (slope - 1) * x1;
    var chips = '<div class="catchips"><button type="button" class="catchip' + (curveCat === null ? ' on' : '') + '" data-cat="">All categories</button>' +
      DATA.curveCats.map(function (cc) {
        return '<button type="button" class="catchip' + (curveCat === cc[0] ? ' on' : '') + '" data-cat="' + esc(cc[0]) + '">' + esc(cc[0]) + '</button>';
      }).join('') + '</div>';
    var s = chips + '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of launched protocols: mcap over TVL falls as TVL grows">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0a1224" rx="8"/>';
    // gridlines + y ticks at 0.01x, 0.1x, 1x
    [-4.6052, -2.3026, 0].forEach(function (lv, i) {
      var lbl = ['0.01&times;', '0.1&times;', '1&times;'][i];
      s += '<line x1="' + PL + '" y1="' + f(Y(lv), 1) + '" x2="' + (W - PR) + '" y2="' + f(Y(lv), 1) + '" stroke="#22304d" stroke-width="1"/>';
      s += '<text x="' + (PL - 4) + '" y="' + f(Y(lv) + 3, 1) + '" fill="#8fa3bf" font-size="9" font-family="monospace" text-anchor="end">' + lbl + '</text>';
    });
    // x ticks at $10M, $100M, $1B
    [16.1181, 18.4207, 20.7233].forEach(function (lv, i) {
      var lbl = ['$10M', '$100M', '$1B'][i];
      s += '<line x1="' + f(X(lv), 1) + '" y1="' + PT + '" x2="' + f(X(lv), 1) + '" y2="' + (H - PB) + '" stroke="#16223c" stroke-width="1"/>';
      s += '<text x="' + f(X(lv), 1) + '" y="' + (H - 7) + '" fill="#8fa3bf" font-size="9" font-family="monospace" text-anchor="middle">' + lbl + '</text>';
    });
    s += '<text x="' + (W - PR) + '" y="' + (PT + 9) + '" fill="#8fa3bf" font-size="9" font-family="monospace" text-anchor="end">mcap / TVL</text>';
    s += '<text x="' + PL + '" y="' + (H - 7) + '" fill="#8fa3bf" font-size="9" font-family="monospace">TVL</text>';
    s += '<line x1="' + f(X(x0), 1) + '" y1="' + f(Y(lineY0), 1) + '" x2="' + f(X(x1), 1) + '" y2="' + f(Y(lineY1), 1) + '" stroke="#f5b942" stroke-width="2"/>';
    pts.forEach(function (p) {
      var on = selIdx < 0 || p[2] === selIdx;
      s += '<circle cx="' + f(X(p[0]), 1) + '" cy="' + f(Y(p[1]), 1) + '" r="' + (on ? 2.8 : 2.2) + '" fill="#2dd4bf" fill-opacity="' + (on ? 0.9 : 0.14) + '"/>';
    });
    s += '</svg>';
    s += '<figcaption>' + (selName !== null
      ? 'Showing ' + esc(selName) + ' — ' + selN + ' of the 93 launched protocols; the line is that category\u2019s fitted curve (intercept ' + inter.toFixed(3) + ').'
      : 'Each dot is one of the 93 launched protocols; the line is the fitted curve. Bigger TVL, lower mcap&thinsp;/&thinsp;TVL — slope ' + slope.toFixed(3) + '.') + '</figcaption>';
    box.innerHTML = s;
    var btns = box.querySelectorAll('.catchip');
    for (var bi = 0; bi < btns.length; bi++) {
      btns[bi].addEventListener('click', function (e) {
        var c = e.currentTarget.getAttribute('data-cat');
        curveCat = c === '' ? null : c;
        renderCurve();
      });
    }
  }
  renderCurve();

  // --- state ------------------------------------------------------------------------
  var state = { q: '', cat: 'all', chain: 'all', wl: false, sort: 'rank', tab: 'board', sel: null };
  function readHash() {
    var h = (location.hash || '').slice(1);
    if (!h) return;
    h.split('&').forEach(function (kv) {
      var p = kv.split('=');
      var k = decodeURIComponent(p[0] || ''), v = decodeURIComponent(p[1] || '');
      if (k === 'detail') state.sel = v;
      else if (k === 'cat') state.cat = v;
      else if (k === 'chain') state.chain = v;
      else if (k === 'q') state.q = v;
      else if (k === 'wl') state.wl = v === '1';
      else if (k === 'tab') state.tab = v;
    });
  }
  readHash();

  // --- controls ---------------------------------------------------------------------
  var catSel = $('cat'), chainSel = $('chain');
  var catsInBoard = {};
  rows.forEach(function (r) { catsInBoard[r.cat] = true; });
  catSel.innerHTML = '<option value="all">All categories</option>' + Object.keys(catsInBoard).sort().map(function (c) {
    return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
  var chainsInBoard = {};
  rows.forEach(function (r) { r.chains.forEach(function (c) { chainsInBoard[c] = true; }); });
  chainSel.innerHTML = '<option value="all">All chains</option>' + Object.keys(chainsInBoard).sort().map(function (c) {
    return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
  if (state.cat !== 'all' && !catsInBoard[state.cat]) state.cat = 'all';
  if (state.chain !== 'all' && !chainsInBoard[state.chain]) state.chain = 'all';
  $('q').value = state.q;
  $('wl').checked = state.wl;
  $('sort').value = state.sort;

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.wl && !r.wl) return false;
      if (state.cat !== 'all' && r.cat !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var by = state.sort;
    list.sort(function (a, b) {
      if (by === 'tvl') return b.tvl - a.tvl;
      if (by === 'chg') return (b.chg === null ? -1e9 : b.chg) - (a.chg === null ? -1e9 : a.chg);
      if (by === 'age') return (b.age === null ? -1 : b.age) - (a.age === null ? -1 : a.age);
      return a.rank - b.rank;
    });
    return list;
  }

  function chainPills(chains) {
    var show = chains.slice(0, 2).map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join('');
    if (chains.length > 2) show += '<span class="pill">+' + (chains.length - 2) + '</span>';
    return show || '<span class="pill">—</span>';
  }
  function chgCell(chg) {
    if (chg === null || chg === undefined) return '<td class="num">n/a</td>';
    return '<td class="num ' + (chg >= 0 ? 'up' : 'dn') + '">' + fmtPct(chg) + '</td>';
  }

  // --- detail -----------------------------------------------------------------------
  function renderDetail() {
    var box = $('detail');
    var row = null;
    if (state.sel) for (var i = 0; i < rows.length; i++) if (rows[i].slug === state.sel) { row = rows[i]; break; }
    // Opening a protocol focuses the page on it: the method box folds away until the
    // detail is closed, so the whole farm plan fits on one screen.
    var method = document.querySelector('.method');
    if (method) method.classList.toggle('collapsed', !!row);
    if (!row) { box.innerHTML = ''; return; }
    var catIdx = DATA.cats.indexOf(row.cat);
    var comp = catIdx >= 0 ? DATA.comps[String(catIdx)] : null;
    var base = row.tvl * row.mult;
    var slope = DATA.meta.curve_slope;
    var compLine;
    if (comp && comp[0] !== null && row.compN >= 3) {
      compLine = 'Fitted size curve for ' + esc(row.cat) + ': log mcap = <b>' + row.intercept.toFixed(3) + '</b> + <b>' + slope.toFixed(3) +
        '</b> &times; log TVL. At this TVL the curve gives <b>' + row.rawMult.toFixed(3) +
        '&times;</b>' + (Math.abs(row.rawMult - row.mult) > 0.0005 ? ' (clamped to <b>' + row.mult.toFixed(3) + '&times;</b>)' : '') +
        '; a flat category median would give <b>' + comp[0].toFixed(3) + '&times;</b> from <b>' + row.compN + '</b> launched ' + esc(row.cat) +
        ' protocols. LOO backtest (93 launched): curve MSLE <b>' + bt.curve_msle.toFixed(4) +
        '</b> vs median <b>' + bt.v1_msle.toFixed(4) + '</b>.';
    } else if (comp && row.compN > 0) {
      compLine = 'Fitted size curve for ' + esc(row.cat) + ': log mcap = <b>' + row.intercept.toFixed(3) + '</b> + <b>' + slope.toFixed(3) +
        '</b> &times; log TVL. Only <b>' + row.compN + '</b> launched ' + esc(row.cat) + ' protocol' + (row.compN === 1 ? '' : 's') +
        ' in the snapshot, so its intercept is shrunk toward the global median. LOO backtest (93 launched): curve MSLE <b>' + bt.curve_msle.toFixed(4) + '</b> vs median <b>' + bt.v1_msle.toFixed(4) + '</b>.';
    } else {
      compLine = 'No launched ' + esc(row.cat) + ' protocol in the snapshot, so the mean category intercept is used: log mcap = <b>' +
        row.intercept.toFixed(3) + '</b> + <b>' + slope.toFixed(3) + '</b> &times; log TVL. LOO backtest (93 launched): curve MSLE <b>' + bt.curve_msle.toFixed(4) + '</b> vs median <b>' + bt.v1_msle.toFixed(4) + '</b>.';
    }
    var compTable = '';
    if (comp && comp[2].length) {
      compTable = '<h3>Comparables — launched ' + esc(row.cat) + ' protocols</h3><table class="comps"><thead><tr><th>Protocol</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' +
        comp[2].map(function (t) { return '<tr><td>' + esc(t[0]) + '</td><td class="num">' + t[1].toFixed(3) + '&times;</td></tr>'; }).join('') +
        '</tbody></table>';
    }
    var steps = farmSteps({ name: row.name, category: row.cat, chains: row.chains, tvl_usd: row.tvl, age_days: row.age });
    var stepsHtml = '<ol class="steps">' + steps.map(function (s) {
      var cut = s.lastIndexOf(' Cost: ');
      var body = cut > 0 ? s.slice(0, cut) : s;
      var ct = cut > 0 ? s.slice(cut + 1) : '';
      return '<li>' + esc(body) + '<span class="ct">' + esc(ct) + '</span></li>';
    }).join('') + '</ol>';
    box.innerHTML =
      '<article class="detail"><h2>' + esc(row.name) + ' <span class="pslug">' + esc(row.slug) + '</span>' + (row.wl ? ' <span class="wltag">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="dmeta">' + esc(row.cat || 'No category') + ' · ' + row.chains.map(esc).join(', ') + ' · records no token</p>' +
      '<div class="dgrid">' +
      '<div class="dstat"><div class="k">Implied value</div><div class="v">' + fmtFull(row.implied) + '</div></div>' +
      '<div class="dstat"><div class="k">TVL</div><div class="v">' + fmtUsd(row.tvl) + '</div></div>' +
      '<div class="dstat"><div class="k">7-day change</div><div class="v">' + fmtPct(row.chg) + '</div></div>' +
      '<div class="dstat"><div class="k">Age, no token</div><div class="v">' + fmtAge(row.age) + '</div></div>' +
      '<div class="dstat"><div class="k">Curve multiple</div><div class="v">' + row.mult.toFixed(3) + '&times;</div></div>' +
      '<div class="dstat"><div class="k">Evidence</div><div class="v">' + (row.compN >= 10 ? 'Strong' : row.compN >= 3 ? 'Moderate' : 'Thin') + ' · ' + row.compN + '</div></div>' +
      '</div>' +
      '<h3>How the value was computed</h3>' +
      '<div class="math">' + fmtFull(row.tvl) + ' TVL &times; <b>' + row.mult.toFixed(3) + '&times;</b> curve multiple = ' + fmtFull(Math.round(base)) +
      '<br>&times; <b>' + row.gMult.toFixed(4) + '</b> growth (' + fmtPct(row.chg) + ' over 7 days)' +
      ' &times; <b>' + row.mMult.toFixed(4) + '</b> maturity (' + (row.age === null ? 'listing date unreported, 365 days assumed' : fmtAge(row.age) + ' listed') + ')' +
      '<br>= <b>' + fmtFull(row.implied) + '</b> implied value</div>' +
      '<p style="color:var(--mut);font-size:13.5px;margin:10px 0 0">' + compLine + '</p>' +
      compTable +
      '<h3>Farm plan — 7 steps</h3>' + stepsHtml + '</article>';
  }

  // --- render -----------------------------------------------------------------------
  function render() {
    var list = filtered();
    $('count').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' rows · ' + DATA.meta.watchlist_size + ' watchlist · total implied ' + fmtUsd(totalImplied);
    $('rows').innerHTML = list.map(function (r) {
      var cls = 'r' + r.rank + (state.sel === r.slug ? ' sel' : '');
      return '<tr data-slug="' + esc(r.slug) + '" class="' + cls + '">' +
        '<td><span class="rank">' + r.rank + '</span></td>' +
        '<td><span class="pname">' + esc(r.name) + '</span> <span class="pslug">' + esc(r.slug) + '</span>' + (r.wl ? '<span class="wltag">WATCHLIST</span>' : '') + '</td>' +
        '<td class="cat">' + esc(r.cat || '—') + '</td>' +
        '<td>' + chainPills(r.chains) + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl) + '</td>' +
        chgCell(r.chg) +
        '<td class="num">' + fmtAge(r.age) + '</td>' +
        '<td class="num impl">' + fmtUsd(r.implied) + '</td>' +
        '<td class="num mult">' + r.mult.toFixed(3) + '&times;</td></tr>';
    }).join('');
    $('empty').hidden = list.length !== 0;
    document.querySelectorAll('#board thead th.sortable').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
    renderDetail();
    $('liveRows').innerHTML = liveRows.map(function (p) {
      var ratio = (p.mcap !== null && p.tvl > 0) ? (p.mcap / p.tvl).toFixed(3) + '&times;' : 'n/a';
      return '<tr><td><span class="pname">' + esc(p.name) + '</span> <span class="pslug">' + esc(p.slug) + '</span></td>' +
        '<td class="cat">' + esc(p.cat || '—') + '</td><td>' + chainPills(p.chains) + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl) + '</td><td class="num">' + fmtUsd(p.mcap) + '</td>' +
        '<td class="num">' + ratio + '</td>' + chgCell(p.chg) + '</tr>';
    }).join('');
  }

  function setTab(tab) {
    state.tab = tab;
    $('tabBoard').classList.toggle('on', tab === 'board');
    $('tabLive').classList.toggle('on', tab === 'live');
    $('boardView').hidden = tab !== 'board';
    $('liveView').hidden = tab !== 'live';
  }
  setTab(state.tab === 'live' ? 'live' : 'board');

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    state.sel = state.sel === slug ? null : slug;
    render();
  });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  document.querySelectorAll('#board thead th.sortable').forEach(function (th) {
    th.addEventListener('click', function () {
      state.sort = th.getAttribute('data-sort');
      $('sort').value = state.sort;
      render();
    });
  });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  $('wl').addEventListener('change', function (e) { state.wl = e.target.checked; render(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  $('tabBoard').addEventListener('click', function () { setTab('board'); });
  $('tabLive').addEventListener('click', function () { setTab('live'); });

  document.getElementById('board').setAttribute('aria-busy', 'false');
  render();
})();
