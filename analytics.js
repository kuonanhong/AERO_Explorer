/* Usage statistics for kuonanhong.github.io (AERO Explorer, Resilience Crew Lab, MacGyver Academy): Google Analytics 4.
   Runs only on the published site and only when analytics-config.js holds a measurement ID (G-…); never on this computer
   (local preview, recording). Until the visitor answers the notice, Google Analytics runs without cookies (consent mode).
   What is counted: pages, and inside the single-page apps a "virtual page" for each place, film, route, mission or section,
   so that each one gets its own views and engagement time; film progress (25/50/75/100 %); buttons marked data-nav, data-mission,
   data-action, data-embed or data-game. No names, e-mail addresses or other personal details are sent. */
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
  window.aeroPage = function (path, title) { cur = vurl(path); gtag('event', 'page_view', { page_location: cur, page_title: String(title || document.title).slice(0, 100) }); };
  /* an event on the current (or a given) virtual page: tour_25 … tour_100, flight_start, act_<button> */
  window.aeroTrack = function (name, path) { var n = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40); if (!n) return; gtag('event', n, { page_location: path ? vurl(path) : cur }); };
  gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
  addEventListener('hashchange', function () { cur = location.href; gtag('event', 'page_view', { page_location: cur, page_title: document.title }); });
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-nav],[data-mission],[data-action],[data-embed],[data-game]') : null; if (!el) return;
    var d = el.dataset;
    if (d.nav) window.aeroPage('#' + d.nav, el.textContent.trim());
    else if (d.mission) window.aeroPage('#mission/' + d.mission, el.textContent.trim());
    else if (d.game) window.aeroPage('#game/' + d.game, el.textContent.trim());
    else if (d.embed) window.aeroTrack('open_' + d.embed);
    else if (d.action) window.aeroTrack('act_' + d.action);
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
