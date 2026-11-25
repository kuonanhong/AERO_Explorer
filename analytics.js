/* Usage statistics for kuonanhong.github.io (AERO Explorer, Resilience Crew Lab, MacGyver Academy): Google Analytics 4.
   Runs only on the published site and only when analytics-config.js holds a measurement ID (G-…); never on this computer
   (local preview, recording). Until the visitor answers the notice, Google Analytics runs without cookies (consent mode).
   What is counted: pages, and inside the single-page apps a "virtual page" for each place, film, route, mission or section,
   so that each one gets its own views and engagement time; film progress (25/50/75/100 %); buttons marked data-nav, data-mission,
   data-action, data-embed or data-game (a data-action button counts once per page, however often it is pressed); on the other sites,
   the game started (a virtual page 'game/<name>') and the main buttons, by the HOOKS below. No names, e-mail addresses or other personal details are sent. */
(function () {
  var ID = String(window.AERO_GA_ID || '').trim(), host = location.hostname, noop = function () { };
  window.aeroPage = window.aeroTrack = noop;
  if (!/^G-[A-Z0-9]{4,}$/.test(ID) || host !== 'kuonanhong.github.io' || navigator.webdriver) return;
  var KEY = 'aero-consent', choice = null; try { choice = localStorage.getItem(KEY); } catch (e) { }
  window.dataLayer = window.dataLayer || []; function gtag() { dataLayer.push(arguments); } window.gtag = gtag;
  gtag('consent', 'default', { analytics_storage: choice === 'yes' ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('js', new Date());
  var site = (location.pathname.split('/')[1] || '').replace(/[^\w-]/g, '') || 'home', base = location.origin + '/' + site + '/';
  gtag('config', ID, { send_page_view: false, anonymize_ip: true });
  var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID); document.head.appendChild(s);
  var cur = location.href;
  function clean(v) { return String(v || '').replace(/[^\w\-.~%/]/g, '_').slice(0, 90); }
  /* a virtual page under <site>/v/: 'tour/<place>/<film>', 'place/<id>', 'route/<id>/<view>', 'mission/<id>', '<section>' (a path, so that reports list each one) */
  function vurl(path) { return base + 'v/' + clean(String(path || '').replace(/^#/, '')); }
  var seen = {};   // act_<name> already sent on this page
  window.aeroPage = function (path, title) { cur = vurl(path); seen = {}; gtag('event', 'page_view', { page_location: cur, page_title: String(title || document.title).slice(0, 100) }); };
  /* an event on the current (or a given) virtual page: tour_25 … tour_100, flight_start, act_<button> */
  window.aeroTrack = function (name, path) { var n = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40); if (!n) return; gtag('event', n, { page_location: path ? vurl(path) : cur }); };
  gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
  addEventListener('hashchange', function () { cur = location.href; seen = {}; gtag('event', 'page_view', { page_location: cur, page_title: document.title }); });
  function act(name) { var k = clean(name); if (!k || seen[k]) return; seen[k] = 1; window.aeroTrack('act_' + k); }
  function val(id) { var e = document.getElementById(id); return e && e.value ? String(e.value) : ''; }
  function opt(id) { var e = document.getElementById(id), o = e && e.options && e.options[e.selectedIndex]; return o ? o.text.trim() : ''; }
  /* games and main buttons of the other sites, without changing their pages: [site, selector, what] — what returns ['game', name, title] (a virtual
     page game/<name>: one per game started, with its own engagement time; once: not again while that game is the current page) or ['act', name] */
  var HOOKS = [
    [/^3x3Basketball$/, '#start,#playAgain', function () { var s = ''; try { s = window.SASportsUI.getContext().sport; } catch (e) { } s = s || val('sport') || 'unknown'; return ['game', s, opt('sport') || s]; }],
    [/^(taichi|SmartAction)$/, '#startBtn,#combatStartBtn,#partnerStartBtn', function () { return ['game', (val('mode') || 'practice') + '/' + (val('course') || 'default'), [opt('course'), opt('mode')].filter(Boolean).join(' · '), 'once']; }],
    [/^(taichi|SmartAction)$/, '#modelBtn', function () { return ['act', 'ai_coach']; }], [/^(taichi|SmartAction)$/, '#bodyCameraBtn', function () { return ['act', 'body_camera']; }],
    [/^(taichi|SmartAction)$/, '#walkBtn', function () { return ['act', 'walk']; }],
    [/^HoloArtisan_PortraitMuseum$/, '#sendMessage,#suggestPrompt', function () { return ['act', 'ask']; }], [/^HoloArtisan_PortraitMuseum$/, '#prevArtwork,#nextArtwork', function () { return ['act', 'change_artwork']; }],
    [/^HoloArtisan_PortraitMuseum$/, '#loadModel', function () { return ['act', 'load_model']; }], [/^HoloArtisan_PortraitMuseum$/, '#openCollection', function () { return ['act', 'collection']; }],
    [/^Frame_to_Video$/, '#demoBtn', function () { return ['act', 'demo']; }], [/^Frame_to_Video$/, '#addBtn', function () { return ['act', 'add_photos']; }],
    [/^Frame_to_Video$/, '#playBtn', function () { return ['act', 'preview']; }], [/^Frame_to_Video$/, '#exportBtn', function () { return ['act', 'export']; }],
    [/^Frame_to_Video$/, '#storyBtn', function () { return ['act', 'story']; }], [/^Frame_to_Video$/, '#voiceBtn,#recordBtn', function () { return ['act', 'voice']; }],
    [/^HoloArtisan_Classroom$/, '#tabClassroom,#tabMedical,#tabTwin', function (el) { return ['game', el.id.replace(/^tab/, '').toLowerCase(), el.textContent.trim(), 'once']; }],
    [/^HoloArtisan_Classroom$/, '#startM', function () { return ['act', 'start']; }], [/^HoloArtisan_Classroom$/, '#demoBtn', function () { return ['act', 'demo']; }],
    [/^HoloArtisan_Classroom$/, '#btnAI', function () { return ['act', 'ai']; }]
  ].filter(function (h) { return h[0].test(site); });
  function hook(el) {
    for (var i = 0; i < HOOKS.length; i++) { var b = el.closest ? el.closest(HOOKS[i][1]) : null; if (!b) continue; var r = HOOKS[i][2](b) || [];
      if (r[0] === 'game') { var u = vurl('#game/' + r[1]); if (!(r[3] === 'once' && cur === u)) window.aeroPage('#game/' + r[1], r[2] || r[1]); }
      else if (r[0] === 'act') act(r[1]);
      return; }
  }
  function ended() {   // 3x3: a match played to the end
    var end = document.getElementById('endOverlay'); if (end && window.MutationObserver) new MutationObserver(function () { if (!end.hidden) window.aeroTrack('game_complete'); }).observe(end, { attributes: true, attributeFilter: ['hidden'] });
  }
  if (site === '3x3Basketball') { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', ended); else ended(); }
  if (HOOKS.length) document.addEventListener('submit', function (e) { if (e.target && e.target.id === 'conversationForm') act('ask'); }, true);
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-nav],[data-mission],[data-action],[data-embed],[data-game]') : null;
    if (!el) { if (HOOKS.length && e.target && e.target.closest) hook(e.target); return; }
    var d = el.dataset;
    if (d.nav) window.aeroPage('#' + d.nav, el.textContent.trim());
    else if (d.mission) window.aeroPage('#mission/' + d.mission, el.textContent.trim());
    else if (d.game) window.aeroPage('#game/' + d.game, el.textContent.trim());
    else if (d.embed) window.aeroTrack('open_' + d.embed);
    else if (d.action) act(d.action);
  }, true);
  if (choice !== null) return;
  /* the notice, in the viewer's language */
  var L = (document.documentElement.lang || navigator.language || 'en').toLowerCase(), zhs = /zh-(cn|hans|sg)/.test(L), T = {
    zt: ['本站使用 Google Analytics 匿名統計瀏覽與遊戲使用情形，用來改善內容；不收集姓名或聯絡方式。', '同意', '不同意'],
    zs: ['本站使用 Google Analytics 匿名统计浏览与游戏使用情况，用来改进内容；不收集姓名或联系方式。', '同意', '不同意'],
    ja: ['このサイトは内容改善のため Google アナリティクスで閲覧とゲームの利用状況を匿名で集計します。氏名や連絡先は収集しません。', '同意する', '同意しない'],
    ko: ['이 사이트는 콘텐츠 개선을 위해 Google 애널리틱스로 열람과 게임 이용 현황을 익명으로 집계합니다. 이름이나 연락처는 수집하지 않습니다.', '동의', '동의 안 함'],
    en: ['This site uses Google Analytics to count visits and game use anonymously, to improve the content. No names or contact details are collected.', 'Accept', 'Decline'] };
  var t = L.indexOf('zh') === 0 ? (zhs ? T.zs : T.zt) : L.indexOf('ja') === 0 ? T.ja : L.indexOf('ko') === 0 ? T.ko : T.en;
  function show() {
    var b = document.createElement('div'); b.setAttribute('role', 'dialog'); b.setAttribute('aria-live', 'polite');
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:640px;margin:0 auto;padding:12px 14px;border-radius:12px;background:rgba(20,24,30,.94);color:#f2f2f2;font:13px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    var p = document.createElement('span'); p.style.flex = '1 1 260px'; p.textContent = t[0]; b.appendChild(p);
    [[t[1], 'yes'], [t[2], 'no']].forEach(function (x) { var k = document.createElement('button'); k.type = 'button'; k.textContent = x[0];
      k.style.cssText = 'border:0;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer;' + (x[1] === 'yes' ? 'background:#4fb37a;color:#fff' : 'background:#3a414b;color:#ddd');
      k.onclick = function () { try { localStorage.setItem(KEY, x[1]); } catch (e) { } gtag('consent', 'update', { analytics_storage: x[1] === 'yes' ? 'granted' : 'denied' }); b.remove(); }; b.appendChild(k); });
    document.body.appendChild(b);
  }
  if (document.body) show(); else addEventListener('DOMContentLoaded', show);
})();
