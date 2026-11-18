// Token Radar v2 — dashboard logic. Reads window.RADAR (written by main.ts
// from the same board) and renders the dial, the sortable board, the detail
// drawer, the live-token tab and the methodology. No network, no framework.
(function () {
  var R = window.RADAR;
  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(d) {
    if (d === null || d === undefined) return '—';
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
  }
  function d7Class(d) {
    if (d === null || d === undefined) return 'flat';
    return d > 1 ? 'up' : d < -1 ? 'down' : 'flat';
  }
  function isHot(r) { return (r.change_7d || 0) > 3 && r.chains >= 3; }

  // ---- masthead ----
  var top = rows[0];
  document.getElementById('mastStats').innerHTML =
    '<div class="stat"><b>' + rows.length + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + R.watchlistSize + '/' + R.watchlistSize + '</b><span>watchlist covered</span></div>' +
    '<div class="stat"><b>' + money(top.implied_value_usd) + '</b><span>top: ' + esc(top.name) + '</span></div>' +
    '<div class="stat"><b>' + R.check.launched + ' launched</b><span>since ' + esc(R.asOf) + '</span></div>';

  // ---- radar dial: top 8, radius is value, colour is the 7-day move ----
  (function dial() {
    var svg = document.getElementById('dial');
    var cx = 180, cy = 180, maxR = 128;
    var maxV = rows[0].implied_value_usd;
    var s = '';
    [0.33, 0.66, 1].forEach(function (f) {
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + Math.round(maxR * f) + '" fill="none" stroke="#22304d" stroke-width="1"/>';
    });
    for (var a = 0; a < 8; a++) {
      var ang = (a / 8) * Math.PI * 2 - Math.PI / 2;
      s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.cos(ang) * maxR).toFixed(1) + '" y2="' + (cy + Math.sin(ang) * maxR).toFixed(1) + '" stroke="#1a2740" stroke-width="1"/>';
    }
    rows.slice(0, 8).forEach(function (r, i) {
      var ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
      var rad = Math.max(18, maxR * Math.pow(r.implied_value_usd / maxV, 0.5));
      var x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      var col = r.change_7d === null ? '#fbbf24' : r.change_7d > 1 ? '#4ade80' : r.change_7d < -1 ? '#f87171' : '#fbbf24';
      var label = r.name.length > 16 ? r.name.slice(0, 15) + '…' : r.name;
      var lx = Math.max(55, Math.min(305, x));
      var ly = y + 24;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7" fill="' + col + '" stroke="#0b1220" stroke-width="2"/>' +
        '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="#e8eef7" font-size="12" text-anchor="middle">' + esc(label) + '</text>' +
        '<text x="' + lx.toFixed(1) + '" y="' + (ly + 15).toFixed(1) + '" fill="#93a3bd" font-size="11" text-anchor="middle">' + money(r.implied_value_usd) + '</text>';
    });
    svg.innerHTML = s;
  })();

  // ---- category filter ----
  var cats = [];
  rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  var catSel = document.getElementById('cat');
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });

  // ---- board table ----
  var sortKey = 'rank', sortDir = 1;
  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    category: function (a, b) { return (a.category || '').localeCompare(b.category || ''); },
    tvl: function (a, b) { return a.tvl_usd - b.tvl_usd; },
    d7: function (a, b) { return (a.change_7d || 0) - (b.change_7d || 0); },
    chains: function (a, b) { return a.chains - b.chains; },
    age: function (a, b) { return (a.age_days || 0) - (b.age_days || 0); },
    value: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
  };
  var selected = null;

  function renderBoard() {
    var q = document.getElementById('q').value.trim().toLowerCase();
    var cat = catSel.value;
    var wl = document.getElementById('wlOnly').checked;
    var hot = document.getElementById('hotOnly').checked;
    var list = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (wl && !r.watchlist) return false;
      if (hot && !isHot(r)) return false;
      return true;
    });
    list.sort(function (a, b) { return SORTS[sortKey](a, b) * sortDir; });
    var html = '';
    list.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td>' + esc(r.name) +
          (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
          (isHot(r) ? '<span class="badge hot">ACCELERATING</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + d7Class(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + r.chains + '</td>' +
        '<td class="num">' + (r.age_days === null ? '—' : r.age_days + 'd') + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
    });
    document.getElementById('boardBody').innerHTML = html;
    document.getElementById('rowCount').textContent =
      list.length + ' of ' + rows.length + ' protocols shown — click a row for its waterfall and farm plan.';
  }

  document.querySelectorAll('#boardTable th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' || k === 'category' ? 1 : -1; }
      renderBoard();
    });
  });
  ['q', 'cat', 'wlOnly', 'hotOnly'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', renderBoard);
  });
  document.getElementById('boardBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) openDrawer(tr.getAttribute('data-slug'));
  });

  // ---- detail drawer: facts, value waterfall, farm plan ----
  function openDrawer(slug) {
    var r = bySlug[slug];
    if (!r) return;
    selected = slug;
    renderBoard();
    var base = r.factors[0].factor;
    var running = base;
    var wf = '<div class="waterfall">';
    r.factors.slice(1).forEach(function (f) {
      running = running * f.factor;
      var w = Math.max(4, Math.min(100, ((f.factor - 0.5) / 1.1) * 100));
      wf += '<div class="wf-row"><span>' + esc(f.label) + '</span>' +
        '<span class="bar"><i class="' + (f.factor < 1 ? 'low' : '') + '" style="width:' + w.toFixed(0) + '%"></i></span>' +
        '<span class="val">×' + f.factor.toFixed(3) + '</span></div>';
    });
    wf += '<div class="wf-row total"><span>Implied value</span><span></span><span class="val">' + money(r.implied_value_usd) + '</span></div></div>';
    var facts =
      '<div class="facts">' +
      '<div><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b class="' + d7Class(r.change_7d) + '">' + pct(r.change_7d) + '</b><span>TVL, 7 days</span></div>' +
      '<div><b>' + r.chains + ' chains</b><span>' + esc(r.category || 'No category') + '</span></div>' +
      '<div><b>' + (r.age_days === null ? 'unknown' : r.age_days + ' days') + '</b><span>tracked, no token</span></div>' +
      '</div>';
    var steps = '<ol class="farm">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    var notes = r.factors.slice(1).map(function (f) { return esc(f.label) + ': ' + esc(f.detail); }).join(' · ');
    document.getElementById('drawerBody').innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="lede">Rank ' + r.rank + ' of ' + rows.length + (r.watchlist ? ' · on the watchlist' : ' · below the $50M floor — an early find') + ' · ' + esc(r.slug) + '</p>' +
      facts + '<h2>How the value adds up</h2>' + wf +
      '<p class="lede">' + notes + '</p>' +
      '<h2>Farm plan — six steps</h2>' + steps;
    document.getElementById('drawer').classList.remove('hidden');
  }
  document.getElementById('drawerClose').addEventListener('click', function () {
    document.getElementById('drawer').classList.add('hidden');
    selected = null;
    renderBoard();
  });

  // ---- live tab ----
  document.getElementById('liveBody').innerHTML = R.live.map(function (p) {
    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td></tr>';
  }).join('');

  // ---- tabs ----
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      ['board', 'live', 'method'].forEach(function (name) {
        document.getElementById('tab-' + name).classList.toggle('hidden', name !== tab.getAttribute('data-tab'));
      });
    });
  });

  // ---- footer: the cross-check, stated plainly ----
  document.getElementById('foot').innerHTML =
    'Snapshot: DefiLlama, <b>' + esc(R.asOf) + '</b> · ' + rows.length + ' protocols ranked, ' + R.watchlistSize +
    ' on the watchlist · Cross-check (live DefiLlama read at build time, ' + esc(R.check.checkedAt || 'not run') + '): <b>' +
    R.check.launched + ' of ' + R.check.checked + ' watchlist protocols launched a token since ' + esc(R.asOf) +
    '</b> — every protocol on this board still records no token. ' +
    'Implied values are this entry’s own claim from the snapshot’s figures; a token may never be issued.';

  renderBoard();
})();
