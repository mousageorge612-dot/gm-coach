/* GM Coach — client app */
(function () {
  'use strict';
  var G = window.GM, $ = G.$, $$ = G.$$, esc = G.esc;
  var WA = '963987461750';
  var S = new G.Session('gmc_client');
  var D = null;            // data: {me, training, nutrition, ex:{id:row}, checkins:{day:data}, logs:[...]}
  var tab = 'train', dayIdx = null, openLog = {};

  function cacheKey() { return 'gmc_cache_' + (S.a && S.a.uid); }
  function saveCache() { try { localStorage.setItem(cacheKey(), JSON.stringify(D)); } catch (e) {} }
  function loadCache() { try { return JSON.parse(localStorage.getItem(cacheKey())); } catch (e) { return null; } }

  /* ---------- boot ---------- */
  function boot() {
    try { var t = localStorage.getItem('gmc_tab'); if (t) tab = t; } catch (e) {}
    if (!S.a) return renderLogin();
    D = loadCache();
    if (D) render(); else $('#app').innerHTML = '<div class="spinner"></div>';
    refresh();
    pushSub(false);
  }

  function refresh() {
    var uid = S.a.uid, since = G.addDays(G.today(), -60);
    return Promise.all([
      S.rest('coach_clients', 'select=*&user_id=eq.' + uid),
      S.rest('coach_programs', 'select=kind,title,data,version,updated_at&client_id=eq.' + uid),
      S.rest('coach_checkins', 'select=day,data&client_id=eq.' + uid + '&day=gte.' + since + '&order=day.desc'),
      S.rest('coach_logs', 'select=day,exercise_id,sets&client_id=eq.' + uid + '&order=day.desc&limit=400')
    ]).then(function (r) {
      var me = r[0] && r[0][0];
      if (!me) { $('#app').innerHTML = '<div class="login"><img class="logo" src="assets/img/logo.png" alt="GM"><p class="empty">حسابك مو مفعّل بالتطبيق لسا. تواصل مع الكوتش جورج.</p><button class="btn" id="lo">تسجيل خروج</button></div>'; $('#lo').onclick = logout; return; }
      var n = { me: me, training: null, nutrition: null, ex: {}, checkins: {}, logs: r[3] || [] };
      (r[1] || []).forEach(function (p) { n[p.kind] = p; });
      (r[2] || []).forEach(function (c) { n.checkins[c.day] = c.data || {}; });
      var ids = [];
      if (n.training && n.training.data && n.training.data.days) n.training.data.days.forEach(function (d) { (d.items || []).forEach(function (it) { if (it.ex && ids.indexOf(it.ex) < 0) ids.push(it.ex); }); });
      var q = ids.length ? S.rest('coach_exercises', 'select=*&id=in.(' + ids.join(',') + ')') : Promise.resolve([]);
      return q.then(function (ex) { (ex || []).forEach(function (e) { n.ex[e.id] = e; }); D = n; saveCache(); render(); });
    }).catch(function (e) {
      if (!S.a) return renderLogin();
      if (!D) $('#app').innerHTML = '<div class="login"><p class="empty">' + esc(G.errText(e)) + '</p><button class="btn gold" id="rt">حاول مرة تانية</button></div>', $('#rt').onclick = refresh;
      else G.toast('أنت بدون إنترنت، عم نعرض آخر نسخة محفوظة');
    });
  }

  function renderLogin() {
    $('#app').innerHTML = '<form class="login" id="lf"><img class="logo" src="assets/img/logo.png" alt="GM"><h1 class="h1">أهلاً فيك</h1><div class="sub">GM COACH</div>' +
      '<label class="field"><span>اسم المستخدم</span><input class="input" name="u" autocomplete="username" autocapitalize="none" dir="ltr" required></label>' +
      '<label class="field"><span>كلمة المرور</span><input class="input" name="p" type="password" autocomplete="current-password" dir="ltr" required></label>' +
      '<button class="btn gold block" type="submit">دخول</button><p class="muted" style="text-align:center;font-size:13px;margin-top:14px">بيانات الدخول بيبعتلك ياها الكوتش جورج على واتساب</p></form>';
    $('#lf').onsubmit = function (e) {
      e.preventDefault(); var f = e.target, b = f.querySelector('button'); b.disabled = true;
      S.login(f.u.value, f.p.value).then(function () { boot(); }).catch(function (er) { b.disabled = false; G.toast(G.errText(er)); });
    };
  }
  function logout() { S.clear(); D = null; renderLogin(); }

  /* ---------- shell ---------- */
  var ICONS = {
    train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
    food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M3 3v8a2 2 0 0 0 2 2M17 3c-2 0-3 3-3 6s1 4 3 4v8"/></svg>',
    prog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 20h18M6 16l4-5 3 3 5-7"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>'
  };
  function render() {
    if (!D) return;
    var html = '<div class="wrap"><div class="top"><div class="brand"><img src="assets/img/logo.png" alt="GM"><div><b>' + esc(firstName()) + '</b><small>GM COACH</small></div></div>' + expiryPill() + '</div>';
    if (expired()) html += expiredView();
    else if (tab === 'train') html += trainView();
    else if (tab === 'food') html += foodView();
    else if (tab === 'prog') html += progView();
    else html += meView();
    html += '</div><nav class="tabs">' + [['train', 'تمريني'], ['food', 'أكلي'], ['prog', 'تقدّمي'], ['me', 'حسابي']].map(function (t) {
      return '<button data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + ICONS[t[0]] + t[1] + '</button>';
    }).join('') + '</nav>';
    $('#app').innerHTML = html;
    $$('[data-tab]').forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-tab'); try { localStorage.setItem('gmc_tab', tab); } catch (e) {} render(); window.scrollTo(0, 0); }; });
    bind();
  }
  function firstName() { return String(D.me.name || '').split(' ')[0]; }
  function daysLeft() { return D.me.end_date ? G.diffDays(G.today(), D.me.end_date) : null; }
  function expired() { var d = daysLeft(); return d !== null && d < 0; }
  function expiryPill() {
    var d = daysLeft(); if (d === null) return '';
    if (d < 0) return '<span class="pill r">منتهي</span>';
    return '<span class="pill ' + (d <= 5 ? 'r' : d <= 10 ? 'y' : 'g') + '">باقي ' + d + ' يوم</span>';
  }
  function waLink(text) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text); }
  function expiredView() {
    return '<div class="card" style="text-align:center"><h2 class="h2">انتهى اشتراكك</h2><p class="muted">جدّد اشتراكك لترجع تشوف خطتك وتكمّل تقدّمك.</p>' +
      '<a class="btn gold block" target="_blank" rel="noopener" href="' + waLink('مرحبا كوتش جورج، بدي جدّد اشتراكي (' + D.me.name + ')') + '">جدّد على واتساب</a></div>';
  }

  /* ---------- training ---------- */
  function days() { return (D.training && D.training.data && D.training.data.days) || []; }
  function todayIdx() {
    var wd = new Date().getDay(), ds = days();
    for (var i = 0; i < ds.length; i++) if ((ds[i].weekdays || []).indexOf(wd) >= 0) return i;
    return -1;
  }
  function trainView() {
    var ds = days();
    if (!ds.length) return '<div class="empty">خطتك التدريبية رح تنزل هون قريباً.</div>';
    var ti = todayIdx(); if (dayIdx === null) dayIdx = ti >= 0 ? ti : 0;
    var h = '<div class="chips">' + ds.map(function (d, i) {
      var wd = (d.weekdays || []).map(function (w) { return G.WD[w]; }).join(' / ');
      return '<button class="chip' + (i === dayIdx ? ' on' : '') + '" data-day="' + i + '">' + esc(d.title || ('اليوم ' + (i + 1))) + (wd ? '<small>' + esc(wd) + (i === ti ? ' • اليوم' : '') + '</small>' : '') + '</button>';
    }).join('') + '</div>';
    if (ti < 0 && dayIdx === 0 && !trainView._seen) h += '<div class="card" style="text-align:center"><b>اليوم يوم راحة</b><p class="muted" style="margin:4px 0 0">ارتاح، اشرب مي، ونام منيح. فيك تشوف أيام التمرين من فوق.</p></div>';
    var d = ds[dayIdx];
    h += '<div class="dayhead">' + (d.title_en ? '<div class="en">' + esc(d.title_en) + '</div>' : '') + '<div class="h1">' + esc(d.title || '') + '</div>' +
      (d.notes ? '<div class="muted" style="margin-top:4px;font-size:13.5px">' + esc(d.notes) + '</div>' : '') + '</div>';
    var dayLogs = logsOn(G.today());
    (d.items || []).forEach(function (it, i) { h += exCard(it, i, dayLogs); });
    if (d.cardio) h += '<div class="card"><b class="gold">كارديو</b><div>' + esc(d.cardio) + '</div></div>';
    if (D.training.data.notes) h += '<div class="card"><b class="gold">ملاحظات الكوتش</b><div style="white-space:pre-line">' + esc(D.training.data.notes) + '</div></div>';
    return h;
  }
  function logsOn(day) { var o = {}; D.logs.forEach(function (l) { if (l.day === day) o[l.exercise_id] = l.sets || []; }); return o; }
  function lastLog(exId) { var t = G.today(); for (var i = 0; i < D.logs.length; i++) if (D.logs[i].exercise_id === exId && D.logs[i].day !== t) return D.logs[i]; return null; }
  function exImg(e) { var f = D.me.gender === 'female'; return G.media(f ? (e.image_female || e.image_male) : (e.image_male || e.image_female)); }
  function exVid(e) { var f = D.me.gender === 'female'; return f ? (e.video_female || e.video_male) : (e.video_male || e.video_female); }
  function exCard(it, i, dayLogs) {
    var e = D.ex[it.ex] || { name_ar: it.name || 'تمرين', id: it.ex };
    var img = exImg(e), vid = exVid(e), logged = (dayLogs[e.id] || []).some(function (s) { return s && (s.w || s.r); });
    var h = '<div class="ex' + (logged ? ' done' : '') + '" data-ex="' + e.id + '">' +
      '<div class="pic">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(e.name_ar) + '">' : '<span class="no">بدون صورة</span>') + '<span class="num">' + (i + 1) + '</span></div>' +
      '<div class="body"><div class="nm">' + esc(e.name_ar) + '</div>' + (e.name_en ? '<div class="nmen">' + esc(e.name_en) + '</div>' : '') +
      '<div class="specs"><div class="spec"><b>' + esc(it.sets || '-') + '</b><span>جولات</span></div><div class="spec"><b>' + esc(it.reps || '-') + '</b><span>عدّات</span></div><div class="spec"><b>' + esc(it.rest || '-') + '</b><span>راحة</span></div></div>' +
      (it.note ? '<div class="note">' + esc(it.note) + '</div>' : '') + (e.tips ? '<div class="muted" style="font-size:13px;margin-bottom:10px;white-space:pre-line">' + esc(e.tips) + '</div>' : '') +
      '<div class="acts">' + (vid ? '<a class="btn gold" target="_blank" rel="noopener" href="' + esc(vid) + '">▶ الشرح</a>' : '') +
      '<button class="btn" data-log="' + e.id + '">' + (logged ? '✓ مسجّل' : 'سجّل أوزانك') + '</button>' +
      (restSecs(it.rest) ? '<button class="btn tm" data-rest="' + restSecs(it.rest) + '" aria-label="مؤقت الراحة">⏱</button>' : '') + '</div>';
    if (openLog[e.id]) h += setsForm(e.id, parseInt(it.sets, 10) || 3, dayLogs[e.id] || []);
    return h + '</div></div>';
  }
  function setsForm(id, n, cur) {
    var last = lastLog(id), h = '<div class="sets" data-sets="' + id + '"><div class="set"><span></span><span class="lbl">الوزن (كغ)</span><span class="lbl">العدّات</span></div>';
    n = Math.max(n, cur.length);
    for (var s = 0; s < n; s++) {
      var v = cur[s] || {};
      h += '<div class="set"><span class="lbl">' + (s + 1) + '</span><input class="input" inputmode="decimal" data-w="' + s + '" value="' + esc(v.w || '') + '"><input class="input" inputmode="numeric" data-r="' + s + '" value="' + esc(v.r || '') + '"></div>';
    }
    h += '</div>';
    if (last) h += '<div class="last">آخر مرة (' + esc(last.day) + '): ' + (last.sets || []).map(function (s) { return (s.w || '-') + '×' + (s.r || '-'); }).join('  ·  ') + '</div>';
    return h;
  }
  function restSecs(r) {
    r = String(r || ''); var m;
    if ((m = r.match(/(\d+)\s*:\s*(\d+)/))) return +m[1] * 60 + +m[2];
    if ((m = r.match(/(\d+(?:\.\d+)?)\s*(د|دق|min|m)/i))) return Math.round(+m[1] * 60);
    if ((m = r.match(/(\d+)/))) return +m[1] > 10 ? +m[1] : +m[1] * 60;
    return 0;
  }
  var tmr = null, actx = null, beeps = [];
  /* Sounds are scheduled on the audio clock when the timer starts, so they still play if the screen locks. */
  function audio() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
    return actx;
  }
  function tone(at, freq, dur, vol) {
    var c = actx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.start(at); o.stop(at + dur + 0.05); beeps.push(o);
  }
  function cancelBeeps() { beeps.forEach(function (o) { try { o.stop(); } catch (e) {} }); beeps = []; }
  function scheduleBeeps(s) {
    cancelBeeps(); if (!soundOn() || !audio()) return;
    var t0 = actx.currentTime;
    [3, 2, 1].forEach(function (k) { if (s > k) tone(t0 + s - k, 660, 0.12, 0.25); });
    [0, 0.35, 0.7].forEach(function (d) { tone(t0 + s + d, 988, 0.28, 0.6); });
  }
  function soundOn() { return localStorage.getItem('gmc_sound') !== '0'; }
  function notifyDone() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    navigator.serviceWorker && navigator.serviceWorker.ready.then(function (r) {
      r.showNotification('خلصت الراحة 💪', { body: 'يلا عالجولة الجاية', icon: 'assets/img/icon-192.png', badge: 'assets/img/icon-192.png', tag: 'gmc-rest', renotify: true, vibrate: [300, 150, 300] });
    }).catch(function () {});
  }
  function b64u(k) { var p = '='.repeat((4 - k.length % 4) % 4), r = atob((k + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function pushSub(test) {
    if (!('PushManager' in window) || !('Notification' in window) || !navigator.serviceWorker || Notification.permission !== 'granted' || !S.a) return Promise.resolve(false);
    return Promise.all([navigator.serviceWorker.ready, S.api('/functions/v1/coach-push')]).then(function (r) {
      var reg = r[0], key = r[1] && r[1].publicKey; if (!key) return false;
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub && sub.options && sub.options.applicationServerKey && btoa(String.fromCharCode.apply(null, new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) return sub.unsubscribe().then(function () { return null; });
        return sub;
      }).then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) }); })
        .then(function (sub) {
          var j = sub.toJSON();
          return S.upsert('coach_push_subs', { endpoint: j.endpoint, client_id: S.a.uid, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }, 'endpoint');
        }).then(function () { return test ? S.api('/functions/v1/coach-push', { method: 'POST', body: { kind: 'test' } }) : null; }).then(function () { return true; });
    }).catch(function () { return false; });
  }
  function startTimer(s) {
    clearInterval(tmr); var end = Date.now() + s * 1000, box = $('#timer'), done = false;
    scheduleBeeps(s);
    function tick() {
      var left = Math.max(0, Math.round((end - Date.now()) / 1000));
      $('#timer-s').textContent = Math.floor(left / 60) + ':' + G.pad(left % 60);
      if (!left && !done) { done = true; clearInterval(tmr); if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); notifyDone(); setTimeout(function () { box.hidden = true; }, 2500); }
    }
    box.hidden = false; tick(); tmr = setInterval(tick, 500);
    $('#timer-x').onclick = function () { clearInterval(tmr); cancelBeeps(); box.hidden = true; };
  }
  function saveSets(id) {
    var box = $('[data-sets="' + id + '"]'); if (!box) return;
    var sets = [];
    $$('[data-w]', box).forEach(function (inp) { var s = +inp.getAttribute('data-w'); sets[s] = sets[s] || {}; sets[s].w = inp.value.trim(); });
    $$('[data-r]', box).forEach(function (inp) { var s = +inp.getAttribute('data-r'); sets[s] = sets[s] || {}; sets[s].r = inp.value.trim(); });
    var t = G.today(), row = { client_id: S.a.uid, day: t, exercise_id: +id, sets: sets, updated_at: new Date().toISOString() };
    D.logs = D.logs.filter(function (l) { return !(l.day === t && l.exercise_id === +id); }); D.logs.unshift({ day: t, exercise_id: +id, sets: sets }); saveCache();
    S.upsert('coach_logs', row, 'client_id,day,exercise_id').catch(function () { G.toast('ما انحفظ، تأكد من الإنترنت'); });
    var card = $('.ex[data-ex="' + id + '"]'), on = sets.some(function (s) { return s && (s.w || s.r); });
    if (card) { card.classList.toggle('done', on); var b = $('[data-log="' + id + '"]', card); if (b) b.textContent = on ? '✓ مسجّل' : 'سجّل أوزانك'; }
    markTrained();
  }
  function markTrained() {
    var t = G.today(), c = D.checkins[t] || {};
    if (c.train) return;
    c.train = 'yes'; D.checkins[t] = c; saveCheckin(t, true);
  }

  /* ---------- nutrition ---------- */
  function foodView() {
    var n = D.nutrition && D.nutrition.data;
    if (!n || !(n.meals || []).length) return '<div class="empty">خطتك الغذائية رح تنزل هون قريباً.</div>';
    var c = D.checkins[G.today()] || {}, done = c.meals || {};
    var h = '<div class="dayhead"><div class="en">NUTRITION PLAN</div><div class="h1">' + esc(D.nutrition.title || 'خطتي الغذائية') + '</div></div>';
    if (n.kcal || n.p) h += '<div class="card"><div class="macros"><div><b>' + esc(n.kcal || '-') + '</b><span>سعرة</span></div><div><b>' + esc(n.p || '-') + '</b><span>بروتين غ</span></div><div><b>' + esc(n.c || '-') + '</b><span>كارب غ</span></div><div><b>' + esc(n.f || '-') + '</b><span>دهون غ</span></div></div>' +
      (n.water ? '<div class="muted" style="text-align:center;margin-top:8px">المي: ' + esc(n.water) + '</div>' : '') + '</div>';
    n.meals.forEach(function (m, i) {
      var on = !!done[i];
      h += '<div class="meal' + (on ? ' done' : '') + '"><div class="mh"><div class="row" style="flex:1;justify-content:flex-start;gap:10px">' + (m.time ? '<span class="time">' + esc(m.time) + '</span>' : '') + '<span class="t">' + esc(m.title || ('وجبة ' + (i + 1))) + '</span>' + (m.kcal ? '<span class="muted" style="font-size:12.5px">' + esc(m.kcal) + ' سعرة</span>' : '') + '</div>' +
        '<button class="check' + (on ? ' on' : '') + '" data-meal="' + i + '" aria-label="أكلتها">' + (on ? '✓' : '') + '</button></div>' +
        lines(m.items) + (m.alts ? '<div class="alt"><b class="gold">بدائل:</b> <span style="white-space:pre-line">' + esc(m.alts) + '</span></div>' : '') + '</div>';
    });
    if (n.rules) h += '<div class="card"><b class="gold">قواعد مهمة</b><div style="white-space:pre-line;margin-top:4px">' + esc(n.rules) + '</div></div>';
    return h;
  }
  function lines(t) { var a = String(t || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); return a.length ? '<ul>' + a.map(function (s) { return '<li>' + esc(s.replace(/^[-•]\s*/, '')) + '</li>'; }).join('') + '</ul>' : ''; }

  /* ---------- progress / daily check-in ---------- */
  var CHK = [
    ['train', 'تمرّنت اليوم؟', [['yes', 'نعم'], ['rest', 'يوم راحة'], ['no', 'لا']]],
    ['cardio', 'كارديو؟', [['yes', 'نعم'], ['no', 'لا']]],
    ['food', 'التزامك بالأكل', [['100', '100%'], ['75', '75%'], ['50', '50%'], ['25', 'أقل']]],
    ['sleep', 'النوم', [['8', '+8 س'], ['7', '7 س'], ['6', '6 س'], ['5', '-5 س']]],
    ['water', 'المي', [['3', '+3 ل'], ['2', '2 ل'], ['1', '-1 ل']]],
    ['energy', 'طاقتك', [['high', 'عالية'], ['mid', 'متوسطة'], ['low', 'منخفضة']]]
  ];
  function progView() {
    var t = G.today(), c = D.checkins[t] || {};
    var h = '<div class="dayhead"><div class="en">DAILY CHECK-IN</div><div class="h1">تشيك اليوم</div><div class="muted" style="font-size:13px">' + G.WD[new Date().getDay()] + ' ' + t + '</div></div><div class="card">';
    CHK.forEach(function (q) {
      h += '<div style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:6px">' + q[1] + '</div><div class="chips" style="margin:0;flex-wrap:wrap">' +
        q[2].map(function (o) { return '<button class="chip' + (String(c[q[0]]) === o[0] ? ' on' : '') + '" data-ck="' + q[0] + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    });
    h += '<div class="grid2"><label class="field"><span>الوزن (كغ) اختياري</span><input class="input" id="ck-w" inputmode="decimal" value="' + esc(c.weight || '') + '"></label>' +
      '<label class="field"><span>الخصر (سم) اختياري</span><input class="input" id="ck-waist" inputmode="decimal" value="' + esc(c.waist || '') + '"></label></div>' +
      '<label class="field"><span>ملاحظة للكوتش</span><textarea class="input" id="ck-note" rows="2">' + esc(c.note || '') + '</textarea></label>' +
      '<button class="btn gold block" id="ck-save">حفظ</button></div>';
    // last 14 days dots + weight chart
    var dots = '', ws = [];
    for (var i = 13; i >= 0; i--) { var d = G.addDays(t, -i), x = D.checkins[d]; dots += '<i title="' + d + '" style="width:18px;height:18px;border-radius:5px;display:block;background:' + (x ? score(x) >= 75 ? 'var(--green)' : score(x) >= 50 ? 'var(--gold)' : 'var(--red)' : '#222') + '"></i>'; }
    Object.keys(D.checkins).sort().forEach(function (d) { var w = parseFloat(D.checkins[d].weight); if (w) ws.push([d, w]); });
    h += '<div class="card"><b>آخر 14 يوم</b><div style="display:flex;gap:4px;direction:ltr;justify-content:space-between;margin-top:8px">' + dots + '</div></div>';
    if (ws.length) h += '<div class="card"><b>وزنك</b> <span class="muted">' + ws[ws.length - 1][1] + ' كغ' + (ws.length > 1 ? ' (' + fmtDiff(ws[ws.length - 1][1] - ws[0][1]) + ')' : '') + '</span>' + spark(ws) + '</div>';
    return h;
  }
  function fmtDiff(v) { v = Math.round(v * 10) / 10; return (v > 0 ? '+' : '') + v + ' كغ'; }
  function score(c) {
    var s = 0, n = 0;
    if (c.train) { n++; s += c.train === 'no' ? 0 : 1; }
    if (c.food) { n++; s += (+c.food) / 100; }
    if (c.sleep) { n++; s += +c.sleep >= 7 ? 1 : +c.sleep >= 6 ? .5 : 0; }
    if (c.water) { n++; s += +c.water >= 2 ? 1 : .4; }
    return n ? Math.round(s / n * 100) : 0;
  }
  function spark(ws) {
    if (ws.length < 2) return '';
    var W = 300, H = 90, min = Math.min.apply(null, ws.map(function (x) { return x[1]; })), max = Math.max.apply(null, ws.map(function (x) { return x[1]; }));
    if (max === min) { max += 1; min -= 1; }
    var pts = ws.map(function (x, i) { return [10 + i * (W - 20) / (ws.length - 1), 10 + (max - x[1]) * (H - 20) / (max - min)]; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:90px;margin-top:8px;direction:ltr"><polyline fill="none" stroke="#ffb800" stroke-width="2.5" points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>' +
      pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="#ffb800"/>'; }).join('') + '</svg>';
  }
  function saveCheckin(day, quiet) {
    var row = { client_id: S.a.uid, day: day, data: D.checkins[day] || {}, updated_at: new Date().toISOString() };
    saveCache();
    return S.upsert('coach_checkins', row, 'client_id,day').then(function () { if (!quiet) G.toast('انحفظ ✓'); })
      .catch(function () { if (!quiet) G.toast('ما انحفظ، تأكد من الإنترنت'); });
  }

  /* ---------- account ---------- */
  var PKG = { m1: 'شهري', m3: '3 أشهر', m6: '6 أشهر', apex: 'برايفت APEX (6 أسابيع)', apex_duo: 'برايفت APEX ثنائي' };
  function meView() {
    var m = D.me, d = daysLeft();
    return '<div class="card"><div class="h2">' + esc(m.name) + '</div><div class="muted" dir="ltr" style="text-align:right">@' + esc(m.username) + '</div>' +
      '<div style="margin-top:10px;display:grid;gap:6px">' + (m.package ? '<div>الباقة: <b>' + esc(PKG[m.package] || m.package) + '</b></div>' : '') +
      (m.start_date ? '<div>البداية: <b>' + esc(m.start_date) + '</b></div>' : '') + (m.end_date ? '<div>الانتهاء: <b>' + esc(m.end_date) + '</b>' + (d !== null && d >= 0 ? ' <span class="muted">(باقي ' + d + ' يوم)</span>' : '') + '</div>' : '') + '</div></div>' +
      '<a class="btn gold block" style="margin-bottom:10px" target="_blank" rel="noopener" href="' + waLink('مرحبا كوتش جورج، أنا ' + m.name) + '">راسل الكوتش على واتساب</a>' +
      '<div class="card"><div class="h2" style="font-size:16px">مؤقت الراحة</div>' +
      '<div class="row"><span>صوت لما تخلص الراحة</span><button class="btn sm' + (soundOn() ? ' gold' : '') + '" id="snd" style="flex:0 0 auto">' + (soundOn() ? 'شغّال' : 'مطفى') + '</button></div>' +
      ('Notification' in window ? '<div class="row" style="margin-top:8px"><span>الإشعارات: خلص الراحة + تذكير التمرين 7 الصبح والتقرير 11 بالليل</span><button class="btn sm' + (Notification.permission === 'granted' ? ' gold' : '') + '" id="ntf" style="flex:0 0 auto">' + (Notification.permission === 'granted' ? 'مفعّل' : Notification.permission === 'denied' ? 'ممنوع' : 'فعّل') + '</button></div>' : '') +
      '</div>' +
      '<button class="btn block" style="margin-bottom:10px" id="pw">تغيير كلمة المرور</button>' +
      '<button class="btn block" style="margin-bottom:10px" id="rf">تحديث الخطة</button>' +
      '<button class="btn block danger" id="lo">تسجيل خروج</button>' +
      '<p class="muted" style="text-align:center;font-size:12.5px;margin-top:18px">لتثبيت التطبيق: من المتصفح اختار «إضافة إلى الشاشة الرئيسية».</p>';
  }

  /* ---------- events ---------- */
  function bind() {
    $$('[data-day]').forEach(function (b) { b.onclick = function () { dayIdx = +b.getAttribute('data-day'); trainView._seen = true; render(); }; });
    $$('[data-log]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-log'); openLog[id] = !openLog[id]; render(); var c = $('.ex[data-ex="' + id + '"]'); if (c && openLog[id]) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; });
    $$('[data-sets]').forEach(function (box) { var id = box.getAttribute('data-sets'); $$('input', box).forEach(function (i) { i.onchange = function () { saveSets(id); }; }); });
    $$('[data-rest]').forEach(function (b) { b.onclick = function () { startTimer(+b.getAttribute('data-rest')); }; });
    $$('[data-meal]').forEach(function (b) {
      b.onclick = function () {
        var t = G.today(), c = D.checkins[t] = D.checkins[t] || {}, i = b.getAttribute('data-meal'); c.meals = c.meals || {};
        c.meals[i] = !c.meals[i]; var n = (D.nutrition.data.meals || []).length, k = 0; for (var j = 0; j < n; j++) if (c.meals[j]) k++;
        c.food = String(n ? Math.round(k / n * 4) * 25 : 0); saveCheckin(t, true); render();
      };
    });
    $$('[data-ck]').forEach(function (b) { b.onclick = function () { var t = G.today(), c = D.checkins[t] = D.checkins[t] || {}; c[b.getAttribute('data-ck')] = b.getAttribute('data-v'); $$('[data-ck="' + b.getAttribute('data-ck') + '"]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    var sv = $('#ck-save'); if (sv) sv.onclick = function () { var t = G.today(), c = D.checkins[t] = D.checkins[t] || {}; c.weight = $('#ck-w').value.trim(); c.waist = $('#ck-waist').value.trim(); c.note = $('#ck-note').value.trim(); saveCheckin(t).then(render); };
    var lo = $('#lo'); if (lo) lo.onclick = logout;
    var snd = $('#snd'); if (snd) snd.onclick = function () {
      try { localStorage.setItem('gmc_sound', soundOn() ? '0' : '1'); } catch (e) {}
      if (soundOn() && audio()) { cancelBeeps(); tone(actx.currentTime + 0.05, 988, 0.28, 0.6); }
      render();
    };
    var ntf = $('#ntf'); if (ntf) ntf.onclick = function () {
      if (Notification.permission === 'denied') return G.toast('الإشعارات ممنوعة من إعدادات المتصفح، فعّلها من هناك');
      Notification.requestPermission().then(function (p) { G.toast(p === 'granted' ? 'تفعّلت الإشعارات ✓' : 'ما تفعّلت'); render(); if (p === 'granted') pushSub(true); });
    };
    var rf = $('#rf'); if (rf) rf.onclick = function () { refresh().then(function () { G.toast('تم التحديث'); }); };
    var pw = $('#pw'); if (pw) pw.onclick = function () {
      G.sheet('<div class="h2">كلمة مرور جديدة</div><input class="input" id="np" type="password" dir="ltr" autocomplete="new-password" placeholder="6 أحرف أو أكثر"><button class="btn gold block" style="margin-top:10px" id="npb">حفظ</button>', function (b) {
        $('#npb', b).onclick = function () {
          var v = $('#np', b).value; if (v.length < 6) return G.toast('6 أحرف أو أكثر');
          S.api('/auth/v1/user', { method: 'PUT', body: { password: v } }).then(function () { G.closeSheet(); G.toast('تغيّرت كلمة المرور ✓'); }).catch(function (e) { G.toast(G.errText(e)); });
        };
      });
    };
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.a && D) refresh(); });
  boot();
})();
