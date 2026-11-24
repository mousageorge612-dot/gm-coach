/* GM Coach BETA — client app (test copy, separate from the live app).
   New vs live: Today screen, personal records, streak + never-miss-twice, weekly summary + weekly check-in,
   weekly average weight, off-plan food log (AI estimate or quick list), exercise swap, Android APK notifications bridge. */
(function () {
  'use strict';
  var G = window.GM, $ = G.$, $$ = G.$$, esc = G.esc;
  var WA = '963987461750', IMG = '../assets/img/';
  var S = new G.Session('gmc_beta');
  var D = null;            // {me, training, nutrition, ex:{id:row}, checkins:{day:data}, logs:[...]}
  var tab = 'today', dayIdx = null, openLog = {};
  var NATIVE = window.GMNative || null;   // Android APK bridge (beta APK only)

  function cacheKey() { return 'gmb_cache_' + (S.a && S.a.uid); }
  function saveCache() { try { localStorage.setItem(cacheKey(), JSON.stringify(D)); } catch (e) {} }
  function loadCache() { try { return JSON.parse(localStorage.getItem(cacheKey())); } catch (e) { return null; } }

  /* ---------- boot ---------- */
  function boot() {
    try { var t = localStorage.getItem('gmb_tab'); if (t) tab = t; } catch (e) {}
    if (!S.a) return renderLogin();
    D = loadCache();
    if (D) render(); else $('#app').innerHTML = '<div class="spinner"></div>';
    refresh();
    if (!NATIVE) pushSub(false);
    S.upsert('coach_beta_users', { client_id: S.a.uid, last_seen: new Date().toISOString(), native: !!NATIVE }, 'client_id').catch(function () {});
  }

  function refresh() {
    var uid = S.a.uid, since = G.addDays(G.today(), -70);
    return Promise.all([
      S.rest('coach_clients', 'select=*&user_id=eq.' + uid),
      S.rest('coach_programs', 'select=kind,title,data,version,updated_at&client_id=eq.' + uid),
      S.rest('coach_checkins', 'select=day,data&client_id=eq.' + uid + '&day=gte.' + since + '&order=day.desc'),
      S.rest('coach_logs', 'select=day,exercise_id,sets&client_id=eq.' + uid + '&order=day.desc&limit=600')
    ]).then(function (r) {
      var me = r[0] && r[0][0];
      if (!me) { $('#app').innerHTML = '<div class="login"><img class="logo" src="' + IMG + 'logo.png" alt="GM"><p class="empty">حسابك مو مفعّل بالتطبيق لسا. تواصل مع الكوتش جورج.</p><button class="btn" id="lo">تسجيل خروج</button></div>'; $('#lo').onclick = logout; return; }
      var n = { me: me, training: null, nutrition: null, ex: {}, checkins: {}, logs: r[3] || [] };
      (r[1] || []).forEach(function (p) { n[p.kind] = p; });
      (r[2] || []).forEach(function (c) { n.checkins[c.day] = c.data || {}; });
      // keep today's unsaved local edits (autosave may still be pending)
      if (D && D.checkins && D.checkins[G.today()] && wTimer) n.checkins[G.today()] = D.checkins[G.today()];
      var ids = [], tc = n.checkins[G.today()] || {};
      if (n.training && n.training.data && n.training.data.days) n.training.data.days.forEach(function (d) { (d.items || []).forEach(function (it) { if (it.ex && ids.indexOf(it.ex) < 0) ids.push(it.ex); }); });
      Object.keys(tc.swaps || {}).forEach(function (k) { var v = tc.swaps[k]; if (v && ids.indexOf(v) < 0) ids.push(v); });
      n.logs.forEach(function (l) { if (ids.indexOf(l.exercise_id) < 0) ids.push(l.exercise_id); });
      var q = ids.length ? S.rest('coach_exercises', 'select=*&id=in.(' + ids.join(',') + ')') : Promise.resolve([]);
      return q.then(function (ex) { (ex || []).forEach(function (e) { n.ex[e.id] = e; }); D = n; saveCache(); render(); });
    }).catch(function (e) {
      if (!S.a) return renderLogin();
      if (!D) $('#app').innerHTML = '<div class="login"><p class="empty">' + esc(G.errText(e)) + '</p><button class="btn gold" id="rt">حاول مرة تانية</button></div>', $('#rt').onclick = refresh;
      else G.toast('أنت بدون إنترنت، عم نعرض آخر نسخة محفوظة');
    });
  }

  function renderLogin() {
    $('#app').innerHTML = '<form class="login" id="lf"><img class="logo" src="' + IMG + 'logo.png" alt="GM"><h1 class="h1">أهلاً فيك</h1><div class="sub">GM COACH <span class="betatag">BETA</span></div>' +
      '<label class="field"><span>اسم المستخدم</span><input class="input" name="u" autocomplete="username" autocapitalize="none" dir="ltr" required></label>' +
      '<label class="field"><span>كلمة المرور</span><input class="input" name="p" type="password" autocomplete="current-password" dir="ltr" required></label>' +
      '<button class="btn gold block" type="submit">دخول</button><p class="muted" style="text-align:center;font-size:13px;margin-top:14px">هي نسخة تجريبية. بيانات الدخول نفسها يلي بالتطبيق الأساسي.</p></form>';
    $('#lf').onsubmit = function (e) {
      e.preventDefault(); var f = e.target, b = f.querySelector('button'); b.disabled = true;
      var u = f.u.value.trim().toLowerCase(), p = f.p.value;
      S.login(u, p).then(function () { nativeLogin(u, p); boot(); }).catch(function (er) { b.disabled = false; G.toast(G.errText(er)); });
    };
  }
  function logout() { S.clear(); D = null; if (NATIVE && NATIVE.logout) try { NATIVE.logout(); } catch (e) {} renderLogin(); }

  /* Android APK: the native side keeps its OWN session (separate refresh token) and checks every ~15 min for new notifications. */
  function nativeLogin(u, p) { if (NATIVE && NATIVE.login) try { NATIVE.login(u, p); } catch (e) {} }
  function nativeOn() { try { return !!(NATIVE && NATIVE.hasSession && NATIVE.hasSession()); } catch (e) { return false; } }

  /* ---------- shell ---------- */
  var ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
    food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M3 3v8a2 2 0 0 0 2 2M17 3c-2 0-3 3-3 6s1 4 3 4v8"/></svg>',
    prog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 20h18M6 16l4-5 3 3 5-7"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>'
  };
  function render() {
    if (!D) return;
    var html = '<div class="wrap"><div class="top"><div class="brand"><img src="' + IMG + 'logo.png" alt="GM"><div><b>' + esc(firstName()) + '</b><small>GM COACH <span class="betatag">BETA</span></small></div></div>' + expiryPill() + '</div>';
    if (expired()) html += expiredView();
    else if (tab === 'today') html += todayView();
    else if (tab === 'train') html += trainView();
    else if (tab === 'food') html += foodView();
    else if (tab === 'prog') html += progView();
    else html += meView();
    html += '</div><nav class="tabs">' + [['today', 'اليوم'], ['train', 'تمريني'], ['food', 'أكلي'], ['prog', 'تقدّمي'], ['me', 'حسابي']].map(function (t) {
      return '<button data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + ICONS[t[0]] + t[1] + '</button>';
    }).join('') + '</nav>';
    $('#app').innerHTML = html;
    $$('[data-tab]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-tab')); }; });
    bind();
  }
  function go(t) { tab = t; try { localStorage.setItem('gmb_tab', tab); } catch (e) {} render(); window.scrollTo(0, 0); }
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
  function todayC() { var t = G.today(); return (D.checkins[t] = D.checkins[t] || {}); }

  /* ---------- streak / logged days ---------- */
  function logged(day) {
    var c = D.checkins[day]; if (!c) return false;
    return !!(c.train || c.food || c.sleep || c.energy || parseFloat(c.water) || c.weight || (c.meals && Object.keys(c.meals).some(function (k) { return c.meals[k]; })));
  }
  function streak() {
    var t = G.today(), d = logged(t) ? t : G.addDays(t, -1), n = 0;
    while (n < 400 && logged(d)) { n++; d = G.addDays(d, -1); }
    return n;
  }
  function missedTwiceRisk() { var t = G.today(), y = G.addDays(t, -1); return !logged(t) && !logged(y) && (D.checkins[y] || {}).postpone == null && Object.keys(D.checkins).length > 0; }

  /* ---------- TODAY ---------- */
  function greet() { var h = new Date().getHours(); return h < 12 ? 'صباح الخير' : h < 18 ? 'نهارك سعيد' : 'مسا الخير'; }
  function todayView() {
    var t = G.today(), c = D.checkins[t] || {}, st = streak();
    var h = '<div class="dayhead"><div class="en">TODAY</div><div class="h1">' + greet() + ' ' + esc(firstName()) + '</div>' +
      '<div class="row" style="justify-content:flex-start;gap:8px;margin-top:6px;flex-wrap:wrap">' +
      '<span class="pill y">🔥 ' + st + ' ' + (st === 1 ? 'يوم' : 'يوم متتالي') + '</span>' +
      '<span class="pill">' + G.WD[new Date().getDay()] + ' <span dir="ltr">' + t + '</span></span></div></div>';
    if (missedTwiceRisk()) h += '<div class="card warnc"><b>فوّتت مبارح، لا تفوّت اليوم كمان 💪</b><div class="muted" style="font-size:13px;margin-top:2px">يوم واحد غلطة، يومين بيصيروا عادة. سجّل أي شي اليوم، حتى لو بسيط.</div></div>';

    // workout
    var ds = days(), ti = ds.length ? todayIdx() : -1;
    if (ds.length) {
      var mi = movedIn(), si = schedIdx();
      if (c.postpone != null && ds[+c.postpone]) {
        h += '<div class="card"><div class="muted" style="font-size:12.5px">تمرين اليوم</div><b style="font-size:17px">أجّلت ' + esc(ds[+c.postpone].title || 'التمرين') + ' لبكرا ⏭</b>' +
          '<div class="muted" style="font-size:13px;margin-top:2px">ولا يهمك، بكرا بيطلعلك أول شي. ارتاح منيح واشرب مي.</div>' +
          '<button class="btn block" style="margin-top:10px" id="pp-undo">↩ لا، رح اتمرّن اليوم</button></div>';
      } else if (ti >= 0) {
        var d = ds[ti], items = d.items || [], lg = logsOn(t), done = 0;
        items.forEach(function (it, i) { var e = effEx(it, ti, i); if ((lg[e.id] || []).some(function (s) { return s && (s.w || s.r || s.t); })) done++; });
        var pct = items.length ? Math.round(done / items.length * 100) : 0;
        h += '<div class="card"><div class="row"><div><div class="muted" style="font-size:12.5px">تمرين اليوم' + (ti === mi && !c.useOrig ? ' • مأجّل من مبارح' : '') + '</div><b style="font-size:17px">' + esc(d.title || '') + '</b></div>' +
          '<span class="pill ' + (pct === 100 ? 'g' : 'y') + '" style="flex:0 0 auto">' + done + ' / ' + items.length + '</span></div>' + bar(pct) +
          (mi >= 0 && si >= 0 && si !== mi && !done ? '<div class="muted" style="font-size:13px;margin-top:8px">' + (c.useOrig ? 'رجعت لتمرين اليوم الأصلي بدل يلي أجّلته مبارح.' : 'كان عندك اليوم ' + esc(ds[si].title || '') + '.') +
            ' <button class="lnk" id="pp-orig">' + (c.useOrig ? 'رجّعني للمأجّل' : 'بدّي اعمل الأصلي') + '</button></div>' : '') +
          '<button class="btn gold block" style="margin-top:10px" data-go="train" data-di="' + ti + '">' + (pct === 100 ? 'خلصت تمرين اليوم ✓ شوفه' : done ? 'كمّل التمرين' : 'ابدأ التمرين') + '</button>' +
          (!done ? '<button class="swapb" id="pp-do" data-pi="' + ti + '">⏭ ما بقدر اليوم؟ أجّل التمرين لبكرا</button>' : '') + '</div>';
      } else {
        var r = rotation(), ni = r ? nextIdx() : -1;
        h += '<div class="card"><b>اليوم يوم راحة 😌</b><div class="muted" style="font-size:13.5px;margin-top:2px">' + (ni >= 0 && ds[ni] ? 'تمرينك الجاي: ' + esc(ds[ni].title || '') + '. ' : '') + 'امشي شوي، اشرب مي، ونام منيح.</div></div>';
      }
    }
    // next meal
    var n = D.nutrition && D.nutrition.data;
    if (n && (n.meals || []).length) {
      var mdone = c.meals || {}, nx = -1;
      for (var i = 0; i < n.meals.length; i++) if (!mdone[i]) { nx = i; break; }
      if (nx >= 0) {
        var m = n.meals[nx];
        h += '<div class="meal"><div class="muted" style="font-size:12.5px;margin-bottom:4px">وجبتك الجاية (' + (nx + 1) + ' من ' + n.meals.length + ')</div><div class="mh"><div class="row" style="flex:1;justify-content:flex-start;gap:10px">' + (m.time ? '<span class="time">' + esc(m.time) + '</span>' : '') + '<span class="t">' + esc(m.title || ('وجبة ' + (nx + 1))) + '</span></div>' +
          '<button class="check" data-meal="' + nx + '" aria-label="أكلتها"></button></div>' + lines(m.items) + '</div>';
      } else h += '<div class="card"><b class="green">أكلت كل وجبات اليوم ✓</b></div>';
    }
    h += kcalCard(c, true);
    // water
    h += '<div class="card" style="padding:10px 12px">' + waterBox(c) + '</div>';
    // check-in status
    var ans = CHK.filter(function (q) { return c[q[0]]; }).length;
    h += '<div class="card"><div class="row"><div><b>تشيك اليوم</b><div class="muted" style="font-size:13px">' + (ans === CHK.length ? 'مكتمل ✓ شكراً' : 'جاوبت ' + ans + ' من ' + CHK.length + ' أسئلة') + '</div></div>' +
      '<button class="btn sm ' + (ans === CHK.length ? '' : 'gold') + '" style="flex:0 0 auto" data-go="prog">' + (ans === CHK.length ? 'عدّل' : 'كمّل') + '</button></div></div>';
    // weekly
    h += weekCard(new Date().getDay() === 0);
    return h;
  }
  function bar(p) { return '<div class="bar"><i style="width:' + p + '%"></i></div>'; }

  /* ---------- kcal / off-plan ---------- */
  function num(x) { var m = String(x || '').match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : 0; }
  function offList(c) { return (c && c.offplan) || []; }
  function offMid(o) { return Math.round(((+o.min || 0) + (+o.max || 0)) / 2); }
  function kcalCard(c, compact) {
    var n = D.nutrition && D.nutrition.data, ol = offList(c);
    var plan = n ? num(n.kcal) : 0, eaten = 0;
    if (n) (n.meals || []).forEach(function (m, i) { if (c.meals && c.meals[i]) eaten += num(m.kcal); });
    var off = 0, offMin = 0, offMax = 0; ol.forEach(function (o) { off += offMid(o); offMin += +o.min || 0; offMax += +o.max || 0; });
    var h = '<div class="card"><div class="row"><div><b>أكلت شي برّا النظام؟</b><div class="muted" style="font-size:12.5px">صوّر أو اكتب، والتطبيق بيعطيك تقدير للسعرات.</div></div><button class="btn sm gold" style="flex:0 0 auto" id="op-add">+ سجّل</button></div>';
    if (ol.length) {
      h += '<div class="offl">' + ol.map(function (o, i) {
        return '<div class="offi"><div><b>' + esc(o.desc) + '</b><div class="muted" style="font-size:12px">' + o.min + '–' + o.max + ' سعرة' + (o.p ? ' · بروتين ' + Math.round(o.p) + 'غ' : '') + '</div></div><button class="btn sm ghost" data-opdel="' + i + '" aria-label="حذف">✕</button></div>';
      }).join('') + '</div><div class="muted" style="font-size:13px;margin-top:6px">مجموع برّا النظام اليوم: تقريباً <b class="gold">' + offMin + '–' + offMax + '</b> سعرة</div>';
      if (plan) {
        var tot = eaten + off, left = plan - tot;
        h += '<div style="margin-top:8px">' + bar(Math.min(100, Math.round(tot / plan * 100))) + '<div class="muted" style="font-size:12.5px;margin-top:4px">تقريباً ' + tot + ' من ' + plan + ' سعرة (وجبات الخطة يلي علّمتها + برّا النظام). ' +
          (left >= 0 ? 'باقيلك حوالي ' + left + '.' : 'زدت حوالي ' + (-left) + '، خلي الوجبة الجاية خفيفة (بروتين وخضرة) وكمّل عادي 💪') + '</div></div>';
      }
    } else if (!compact) h += '<div class="muted" style="font-size:12.5px;margin-top:6px">عادي إذا صار، المهم تكون صريح. هيك الكوتش بيعرف شو عم يصير وبيعدّل معك.</div>';
    return h + '</div>';
  }
  function offplanSheet() {
    var mode = 'ai', photo = null, size = 'mid', res = null, qty = 1;
    function draw() {
      var h = '<div class="h2">أكلت شي برّا النظام؟</div><p class="muted" style="font-size:13px;margin:0 0 10px">عادي، المهم تكون صريح. هالرقم تقدير مش رقم دقيق.</p>' +
        '<div class="chips"><button class="chip' + (mode === 'ai' ? ' on' : '') + '" data-m="ai">📷 صوّر أو اكتب</button><button class="chip' + (mode === 'list' ? ' on' : '') + '" data-m="list">📋 اختار من القائمة</button></div>';
      if (res) {
        h += '<div class="card"><b>' + esc(res.desc) + '</b>' + (res.items && res.items.length > 1 ? '<ul style="margin:6px 0 0;padding-inline-start:18px">' + res.items.map(function (x) { return '<li>' + esc(x.name) + (x.kcal ? ' <span class="muted">~' + Math.round(x.kcal) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="macros" style="margin-top:10px"><div><b>' + res.min + '–' + res.max + '</b><span>سعرة</span></div><div><b>' + Math.round(res.p || 0) + '</b><span>بروتين غ</span></div><div><b>' + Math.round(res.c || 0) + '</b><span>كارب غ</span></div><div><b>' + Math.round(res.f || 0) + '</b><span>دهون غ</span></div></div>' +
          (res.note ? '<div class="muted" style="font-size:13px;margin-top:8px">' + esc(res.note) + '</div>' : '') + '</div>' +
          '<div class="row"><button class="btn" id="op-back">رجوع</button><button class="btn gold" id="op-save">سجّلها</button></div>';
      } else if (mode === 'ai') {
        h += '<label class="field"><span>شو أكلت؟ (اكتب، أو صوّر، أو الاتنين بيعطوا أدق نتيجة)</span><textarea class="input" id="op-t" rows="2" placeholder="مثال: سندويشة شاورما فراريج وسط وعلبة بيبسي"></textarea></label>' +
          '<div class="row" style="margin-bottom:10px"><button class="btn" id="op-ph">' + (photo ? '✓ في صورة (غيّرها)' : '📷 صوّر الوجبة') + '</button></div>' +
          (photo ? '<img id="op-prev" style="max-height:180px;border-radius:12px;margin:0 auto 10px">' : '') +
          '<input type="file" accept="image/*" capture="environment" id="op-file" hidden>' +
          '<div style="font-weight:700;margin-bottom:6px">الكمية</div><div class="chips">' + [['small', 'صغيرة'], ['mid', 'عادية'], ['big', 'كبيرة']].map(function (x) { return '<button class="chip' + (size === x[0] ? ' on' : '') + '" data-sz="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
          '<button class="btn gold block" id="op-go">احسب التقدير</button>';
      } else {
        h += '<input class="input" id="op-q" placeholder="دوّر… (شاورما، كنافة، فلافل)" style="margin-bottom:8px">' +
          '<div style="font-weight:700;margin:4px 0 6px">الكمية</div><div class="chips">' + [[0.5, 'نص'], [1, 'وحدة'], [1.5, 'وحدة ونص'], [2, 'اتنين'], [3, 'تلاتة']].map(function (x) { return '<button class="chip' + (qty === x[0] ? ' on' : '') + '" data-qt="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
          '<div class="flist" id="op-list"></div>';
      }
      G.sheet(h, bindS);
    }
    function listHtml(q) {
      q = String(q || '').trim();
      return (window.GM_FOODS || []).filter(function (f) { return !q || f[0].indexOf(q) >= 0; }).map(function (f, i) {
        return '<button class="fi" data-f="' + (window.GM_FOODS.indexOf(f)) + '"><span>' + esc(f[0]) + '</span><small class="muted">' + Math.round(f[1] * qty) + '–' + Math.round(f[2] * qty) + '</small></button>';
      }).join('') || '<div class="muted" style="padding:10px">ما لقينا. جرّب «صوّر أو اكتب».</div>';
    }
    function bindS(b) {
      $$('[data-m]', b).forEach(function (x) { x.onclick = function () { mode = x.getAttribute('data-m'); res = null; draw(); }; });
      $$('[data-sz]', b).forEach(function (x) { x.onclick = function () { var tv = $('#op-t', b); keepT = tv ? tv.value : keepT; size = x.getAttribute('data-sz'); draw(); }; });
      $$('[data-qt]', b).forEach(function (x) { x.onclick = function () { qty = +x.getAttribute('data-qt'); var qv = $('#op-q', b).value; draw(); var qi = $('#op-q'); qi.value = qv; $('#op-list').innerHTML = listHtml(qv); bindList(); }; });
      var tv = $('#op-t', b); if (tv) tv.value = keepT || '';
      var pv = $('#op-prev', b); if (pv && photo) pv.src = URL.createObjectURL(photo);
      var fi = $('#op-file', b), ph = $('#op-ph', b);
      if (ph) ph.onclick = function () { keepT = $('#op-t', b).value; fi.value = ''; fi.click(); };
      if (fi) fi.onchange = function () { var f = fi.files && fi.files[0]; if (!f) return; G.shrink(f, 1024).then(function (bl) { photo = bl; draw(); }).catch(function () { G.toast('ما قدرنا نقرا الصورة'); }); };
      var gob = $('#op-go', b); if (gob) gob.onclick = function () {
        var text = $('#op-t', b).value.trim(); keepT = text;
        if (!text && !photo) return G.toast('اكتب شو أكلت أو صوّرها');
        gob.disabled = true; gob.textContent = 'عم نحسب…';
        (photo ? b64(photo) : Promise.resolve(null)).then(function (img) {
          return S.fn('coach-food', { text: text, size: size, image: img ? { media_type: photo.type || 'image/webp', data: img } : null });
        }).then(function (j) {
          if (!j || j.error) throw new Error((j && j.error) || 'x');
          res = { desc: j.title || text || 'وجبة', items: j.items || [], min: Math.round(j.kcal_min), max: Math.round(j.kcal_max), p: j.protein, c: j.carbs, f: j.fat, note: j.note, src: photo ? 'ai-photo' : 'ai-text' };
          draw();
        }).catch(function (e) {
          gob.disabled = false; gob.textContent = 'احسب التقدير';
          var m = String((e && e.message) || '');
          G.toast(/not_configured/.test(m) ? 'الحساب بالذكاء الاصطناعي لسا مو مفعّل. اختار من القائمة هلق.' : /limit/.test(m) ? 'وصلت للحد اليومي للتقديرات، اختار من القائمة' : /not_food/.test(m) ? 'ما بيّن أكل بالصورة، جرّب تكتب شو أكلت' : 'ما زبط الحساب، تأكد من الإنترنت أو اختار من القائمة');
        });
      };
      var oq = $('#op-q', b); if (oq) { $('#op-list', b).innerHTML = listHtml(''); oq.oninput = function () { $('#op-list').innerHTML = listHtml(oq.value); bindList(); }; bindList(); }
      var bk = $('#op-back', b); if (bk) bk.onclick = function () { res = null; draw(); };
      var sv = $('#op-save', b); if (sv) sv.onclick = function () {
        var c = todayC(); c.offplan = offList(c).concat([{ desc: res.desc, min: res.min, max: res.max, p: res.p || 0, c: res.c || 0, f: res.f || 0, src: res.src, at: new Date().toISOString().slice(11, 16) }]);
        saveCheckin(G.today(), true); G.closeSheet(); G.toast('انسجلت ✓ كمّل عادي بالوجبة الجاية'); render();
      };
    }
    function bindList() {
      $$('[data-f]').forEach(function (x) { x.onclick = function () {
        var f = window.GM_FOODS[+x.getAttribute('data-f')];
        res = { desc: (qty !== 1 ? qty + ' × ' : '') + f[0], items: [], min: Math.round(f[1] * qty), max: Math.round(f[2] * qty), p: f[3] * qty, c: f[4] * qty, f: f[5] * qty, src: 'list', note: 'تقدير تقريبي لحصة عادية.' };
        draw();
      }; });
    }
    var keepT = '';
    draw();
  }
  function b64(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(blob); }); }

  /* ---------- weekly summary + weekly check-in ---------- */
  function trainingDaysIn(from, to) {
    var r = rotation(), ds = days(), wds = [];
    if (r) wds = r.weekdays; else ds.forEach(function (d) { (d.weekdays || []).forEach(function (w) { if (wds.indexOf(w) < 0) wds.push(w); }); });
    var n = 0; for (var d = from; d <= to; d = G.addDays(d, 1)) if (wds.indexOf(G.parseD(d).getDay()) >= 0) n++;
    return n;
  }
  function avgW(from, to) { var s = 0, k = 0; for (var d = from; d <= to; d = G.addDays(d, 1)) { var w = parseFloat((D.checkins[d] || {}).weight); if (w) { s += w; k++; } } return k ? s / k : 0; }
  function weekStats() {
    var t = G.today(), from = G.addDays(t, -6), tr = 0, food = [], water = 0, logs = 0, prs = 0, off = 0;
    var logDays = {}; D.logs.forEach(function (l) { if (l.day >= from) logDays[l.day] = 1; });
    for (var d = from; d <= t; d = G.addDays(d, 1)) {
      var c = D.checkins[d] || {};
      if (c.train === 'yes' || logDays[d]) tr++;
      if (c.food) food.push(+c.food);
      if ((parseFloat(c.water) || 0) >= waterTarget()) water++;
      if (logged(d)) logs++;
      prs += (c.prs || []).length; off += offList(c).length;
    }
    var w1 = avgW(from, t), w0 = avgW(G.addDays(t, -13), G.addDays(t, -7));
    return { trained: tr, planned: trainingDaysIn(from, t), food: food.length ? Math.round(food.reduce(function (a, b) { return a + b; }, 0) / food.length) : null,
      water: water, logged: logs, prs: prs, off: off, w1: w1, w0: w0, streak: streak() };
  }
  function weekCard(sunday) {
    var w = weekStats();
    var h = '<div class="card"><div class="row"><b>أسبوعك (آخر 7 أيام)</b>' + (sunday ? '<span class="pill y" style="flex:0 0 auto">يوم التشيك الأسبوعي</span>' : '') + '</div><div class="wk">' +
      '<div><b>' + w.trained + (w.planned ? '/' + w.planned : '') + '</b><span>تمارين</span></div>' +
      '<div><b>' + (w.food === null ? '-' : w.food + '%') + '</b><span>التزام أكل</span></div>' +
      '<div><b>' + w.water + '/7</b><span>أيام مي كاملة</span></div>' +
      '<div><b>' + (w.w1 && w.w0 ? fmtDiff(w.w1 - w.w0).replace(' كغ', '') : '-') + '</b><span>تغيّر المتوسط كغ</span></div></div>' +
      (w.prs ? '<div class="muted" style="font-size:13px;margin-top:8px">🏆 ' + w.prs + ' رقم قياسي جديد هالأسبوع</div>' : '') +
      '<button class="btn block' + (sunday ? ' gold' : '') + '" style="margin-top:10px" id="wk-open">التشيك الأسبوعي (دقيقة وحدة)</button></div>';
    return h;
  }
  var WQ = [
    ['hunger', 'الجوع هالأسبوع', [['low', 'قليل'], ['ok', 'طبيعي'], ['high', 'كتير']]],
    ['energy', 'طاقتك بالتمرين', [['high', 'عالية'], ['mid', 'متوسطة'], ['low', 'منخفضة']]],
    ['sleep', 'نومك', [['good', 'منيح'], ['ok', 'مقبول'], ['bad', 'سيء']]],
    ['stress', 'الضغط والتعب', [['low', 'قليل'], ['mid', 'متوسط'], ['high', 'عالي']]]
  ];
  function weeklySheet() {
    var t = G.today(), c = todayC(), wq = c.weekly = c.weekly || {}, w = weekStats();
    var h = '<div class="h2">التشيك الأسبوعي</div><p class="muted" style="font-size:13px;margin:0 0 10px">جاوب بسرعة، وبعدها ابعت الملخص للكوتش على واتساب.</p>';
    WQ.forEach(function (q) {
      h += '<div style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:6px">' + q[1] + '</div><div class="chips" style="margin:0;flex-wrap:wrap">' +
        q[2].map(function (o) { return '<button class="chip' + (wq[q[0]] === o[0] ? ' on' : '') + '" data-wq="' + q[0] + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    });
    h += '<div class="grid2"><label class="field"><span>وزنك اليوم (كغ)</span><input class="input" id="wq-w" inputmode="decimal" value="' + esc(c.weight || '') + '"></label><label class="field"><span>الخصر (سم)</span><input class="input" id="wq-waist" inputmode="decimal" value="' + esc(c.waist || '') + '"></label></div>' +
      '<label class="field"><span>شو أحسن شي صار هالأسبوع؟</span><input class="input" id="wq-win" value="' + esc(wq.win || '') + '"></label>' +
      '<label class="field"><span>شو أصعب شي؟</span><input class="input" id="wq-hard" value="' + esc(wq.hard || '') + '"></label>' +
      '<label class="field"><span>سؤال للكوتش (اختياري)</span><input class="input" id="wq-q" value="' + esc(wq.q || '') + '"></label>' +
      '<button class="btn gold block" id="wq-send">احفظ وابعت للكوتش على واتساب</button>';
    G.sheet(h, function (b) {
      $$('[data-wq]', b).forEach(function (x) { x.onclick = function () { wq[x.getAttribute('data-wq')] = x.getAttribute('data-v'); $$('[data-wq="' + x.getAttribute('data-wq') + '"]', b).forEach(function (y) { y.classList.toggle('on', y === x); }); autoSave(); }; });
      $('#wq-send', b).onclick = function () {
        wq.win = $('#wq-win', b).value.trim(); wq.hard = $('#wq-hard', b).value.trim(); wq.q = $('#wq-q', b).value.trim();
        var wv = $('#wq-w', b).value.trim(), wa = $('#wq-waist', b).value.trim(); if (wv) c.weight = wv; if (wa) c.waist = wa;
        wq.at = t; saveCheckin(t, true);
        var L = function (q) { var o = q[2].filter(function (x) { return x[0] === wq[q[0]]; })[0]; return o ? q[1] + ': ' + o[1] : ''; };
        var w2 = weekStats();
        var msg = ['📋 التشيك الأسبوعي — ' + D.me.name, 'التمارين: ' + w2.trained + (w2.planned ? ' من ' + w2.planned : ''), w2.food !== null ? 'التزام الأكل: ' + w2.food + '%' : '', 'أيام المي الكاملة: ' + w2.water + '/7',
          w2.w1 ? 'متوسط الوزن: ' + (Math.round(w2.w1 * 10) / 10) + ' كغ' + (w2.w0 ? ' (' + fmtDiff(w2.w1 - w2.w0) + ')' : '') : '', c.waist ? 'الخصر: ' + c.waist + ' سم' : '',
          w2.off ? 'أكل برّا النظام: ' + w2.off + ' مرة' : '', w2.prs ? 'أرقام قياسية: ' + w2.prs : ''].concat(WQ.map(L))
          .concat([wq.win ? 'أحسن شي: ' + wq.win : '', wq.hard ? 'أصعب شي: ' + wq.hard : '', wq.q ? 'سؤال: ' + wq.q : '']).filter(Boolean).join('\n');
        G.closeSheet(); render();
        window.open(waLink(msg), '_blank');
      };
    });
    void w;
  }

  /* ---------- training ---------- */
  function days() { return (D.training && D.training.data && D.training.data.days) || []; }
  function rotation() { var r = D.training && D.training.data && D.training.data.rotation; return r && r.start && (r.weekdays || []).length ? r : null; }
  function sessionsBefore(r, day) {
    var n = 0, d = r.start;
    for (var k = 0; k < 4000 && d < day; k++) { if (r.weekdays.indexOf(G.parseD(d).getDay()) >= 0) n++; d = G.addDays(d, 1); }
    return n;
  }
  function nextIdx() { var r = rotation(), t = G.today(); if (!r || t < r.start) return r ? 0 : -1; return sessionsBefore(r, G.addDays(t, 1)) % days().length; }
  /* postpone: checkins[day].postpone = index of the workout moved to the next day.
     Tomorrow that workout becomes "today's" workout; useOrig switches back to the scheduled one. */
  function movedIn() { var y = D.checkins[G.addDays(G.today(), -1)], ds = days(); return y && y.postpone != null && ds[+y.postpone] ? +y.postpone : -1; }
  function todayIdx() {
    var mi = movedIn(), c = D.checkins[G.today()] || {};
    if (mi >= 0 && !c.useOrig) return mi;
    return schedIdx();
  }
  function schedIdx() {
    var wd = new Date().getDay(), ds = days(), r = rotation();
    if (r) { var t = G.today(); return (t >= r.start && r.weekdays.indexOf(wd) >= 0) ? sessionsBefore(r, t) % ds.length : -1; }
    for (var i = 0; i < ds.length; i++) if ((ds[i].weekdays || []).indexOf(wd) >= 0) return i;
    return -1;
  }
  /* exercise swap: today only, stored in today's check-in as swaps["day-item"] = exercise id */
  function effEx(it, di, i) {
    var c = D.checkins[G.today()] || {}, sw = c.swaps && c.swaps[di + '-' + i];
    if (sw && D.ex[sw]) return D.ex[sw];
    return D.ex[it.ex] || { name_ar: it.name || 'تمرين', id: it.ex };
  }
  function trainView() {
    var ds = days();
    if (!ds.length) return '<div class="empty">خطتك التدريبية رح تنزل هون قريباً.</div>';
    var ti = todayIdx(), rot = rotation(), ni = rot && ti < 0 ? nextIdx() : -1;
    if (dayIdx === null) dayIdx = ti >= 0 ? ti : (ni >= 0 ? ni : 0);
    var h = '<div class="chips">' + ds.map(function (d, i) {
      var wd = rot ? (i === ti ? 'تمرين اليوم' : i === ni ? 'التمرين الجاي' : 'تمرين ' + (i + 1)) : (d.weekdays || []).map(function (w) { return G.WD[w]; }).join(' / ');
      return '<button class="chip' + (i === dayIdx ? ' on' : '') + '" data-day="' + i + '">' + esc(d.title || ('اليوم ' + (i + 1))) + (wd ? '<small>' + esc(wd) + (i === ti && !rot ? ' • اليوم' : '') + '</small>' : '') + '</button>';
    }).join('') + '</div>';
    var d = ds[dayIdx];
    h += '<div class="dayhead">' + (d.title_en ? '<div class="en">' + esc(d.title_en) + '</div>' : '') + '<div class="h1">' + esc(d.title || '') + '</div>' +
      (d.notes ? '<div class="muted" style="margin-top:4px;font-size:13.5px">' + esc(d.notes) + '</div>' : '') + '</div>';
    var dayLogs = logsOn(G.today()), prs = (D.checkins[G.today()] || {}).prs || [];
    (d.items || []).forEach(function (it, i) { h += exCard(it, i, dayLogs, prs); });
    if (d.cardio) h += '<div class="card"><b class="gold">كارديو</b><div>' + esc(d.cardio) + '</div></div>';
    if (D.training.data.notes) h += '<div class="card"><b class="gold">ملاحظات الكوتش</b><div style="white-space:pre-line">' + esc(D.training.data.notes) + '</div></div>';
    return h;
  }
  function logsOn(day) { var o = {}; D.logs.forEach(function (l) { if (l.day === day) o[l.exercise_id] = l.sets || []; }); return o; }
  function lastLog(exId) { var t = G.today(); for (var i = 0; i < D.logs.length; i++) if (D.logs[i].exercise_id === exId && D.logs[i].day !== t) return D.logs[i]; return null; }
  function exImg(e) { var f = D.me.gender === 'female'; return G.media(f ? (e.image_female || e.image_male) : (e.image_male || e.image_female)); }
  function exVid(e) { var f = D.me.gender === 'female'; return f ? (e.video_female || e.video_male) : (e.video_male || e.video_female); }
  function exCard(it, i, dayLogs, prs) {
    var e = effEx(it, dayIdx, i), swapped = e.id !== it.ex;
    var img = exImg(e), vid = exVid(e), logged_ = (dayLogs[e.id] || []).some(function (s) { return s && (s.w || s.r || s.t); });
    var best = bestBefore(e.id, isTimed(it)), pr = prs.indexOf(e.id) >= 0;
    var h = '<div class="ex' + (logged_ ? ' done' : '') + '" data-ex="' + e.id + '">' +
      '<div class="pic">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(e.name_ar) + '">' : '<span class="no">بدون صورة</span>') + '<span class="num">' + (i + 1) + '</span>' + (pr ? '<span class="prb">🏆 رقم قياسي</span>' : '') + '</div>' +
      '<div class="body"><div class="nm">' + esc(e.name_ar) + '</div>' + (e.name_en ? '<div class="nmen">' + esc(e.name_en) + '</div>' : '') +
      (swapped ? '<div class="note">بديل لليوم عن: ' + esc((D.ex[it.ex] || {}).name_ar || '') + '</div>' : '') +
      '<div class="specs"><div class="spec"><b>' + esc(it.sets || '-') + '</b><span>جولات</span></div><div class="spec"><b>' + esc(it.reps || '-') + '</b><span>عدّات</span></div><div class="spec"><b>' + esc(it.rest || '-') + '</b><span>راحة</span></div></div>' +
      (it.note ? '<div class="note">' + esc(it.note) + '</div>' : '') + (e.tips ? '<div class="muted" style="font-size:13px;margin-bottom:10px;white-space:pre-line">' + esc(e.tips) + '</div>' : '') +
      '<div class="acts">' + (vid ? '<a class="btn gold" target="_blank" rel="noopener" href="' + esc(vid) + '">▶ الشرح</a>' : '') +
      '<button class="btn" data-log="' + e.id + '">' + (logged_ ? '✓ مسجّل' : isTimed(it) ? 'سجّل المدة' : 'سجّل أوزانك') + '</button>' +
      (restSecs(it.rest) ? '<button class="btn tm" data-rest="' + restSecs(it.rest) + '" aria-label="مؤقت الراحة">⏱</button>' : '') + '</div>' +
      (histOf(e.id).length ? '<button class="swapb" data-hist="' + e.id + '">📈 أوزانك السابقة بهالتمرين</button>' : '') +
      '<button class="swapb" data-swap="' + dayIdx + '-' + i + '">↔ الجهاز مشغول؟ بدّل التمرين لليوم</button>';
    if (openLog[e.id]) h += setsForm(e.id, parseInt(it.sets, 10) || 3, dayLogs[e.id] || [], isTimed(it), best);
    return h + '</div></div>';
  }
  function N(x) { return parseFloat(String(x == null ? '' : x).replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x660; }).replace(/[\u06F0-\u06F9]/g, function (d) { return d.charCodeAt(0) - 0x6F0; }).replace(/[٫,]/, '.')) || 0; }
  function isTimed(it) { return /\d\s*ث|ثاني|ثوان|دقيق|sec|min/i.test(String(it.reps || '')); }
  function fmtSet(s) { return s.t ? s.t + ' ث' : (s.w || '-') + '×' + (s.r || '-'); }
  /* personal record: best estimated 1RM (Epley w*(1+r/30)); for weightless sets, most reps; for timed, longest hold */
  function setScore(s, timed) {
    if (!s) return 0; var w = N(s.w), r = N(s.r), t = N(s.t);
    if (timed) return t;
    if (w > 0 && r > 0) return w * (1 + r / 30);
    return r > 0 ? r / 1000 : 0; // bodyweight reps rank below any loaded set
  }
  function bestOf(sets, timed) { var b = 0, bs = null; (sets || []).forEach(function (s) { var v = setScore(s, timed); if (v > b) { b = v; bs = s; } }); return { v: b, s: bs }; }
  function bestBefore(exId, timed) { var t = G.today(), b = { v: 0, s: null, day: null }; D.logs.forEach(function (l) { if (l.exercise_id === exId && l.day < t) { var x = bestOf(l.sets, timed); if (x.v > b.v) { b = x; b.day = l.day; } } }); return b; }
  /* weight history per exercise: every logged session (oldest first) with its top set */
  function histOf(exId) {
    var rows = D.logs.filter(function (l) { return l.exercise_id === exId && (l.sets || []).some(function (x) { return x && (x.w || x.r || x.t); }); });
    var timed = rows.some(function (l) { return (l.sets || []).some(function (x) { return x && x.t; }); });
    return rows.map(function (l) { var b = bestOf(l.sets, timed); return { day: l.day, sets: (l.sets || []).filter(function (x) { return x && (x.w || x.r || x.t); }), top: b.s, v: b.v, timed: timed }; })
      .sort(function (a, b) { return a.day < b.day ? -1 : 1; });
  }
  function sd(st) { return st && st.t ? 'rtl' : 'ltr'; }
  function topVal(h) { return h.timed ? N(h.top && h.top.t) : N(h.top && h.top.w); }
  function histSheet(exId) {
    var e = D.ex[exId] || {}, hs = histOf(exId); if (!hs.length) return;
    var first = hs[0], last = hs[hs.length - 1], best = hs.reduce(function (a, b) { return b.v > a.v ? b : a; }, hs[0]);
    var unit = first.timed ? 'ث' : 'كغ', d = topVal(last) - topVal(first);
    var trend = hs.length < 2 ? 'أول مرة سجّلت هالتمرين. كمّل وبتشوف تطوّرك هون.' :
      d > 0 ? 'طلعت ' + (Math.round(d * 10) / 10) + ' ' + unit + ' من أول مرة 💪' : d < 0 ? 'نزلت ' + (Math.round(-d * 10) / 10) + ' ' + unit + ' عن أول مرة. عادي، ركّز عالتكنيك وارجع ارفع تدريجياً.' : 'نفس الوزن من أول مرة. جرّب تزيد شوي أو تزيد عدّة.';
    var h = '<div class="h2">' + esc(e.name_ar || 'التمرين') + '</div>' + (e.name_en ? '<div class="nmen" style="margin-top:-6px;margin-bottom:8px">' + esc(e.name_en) + '</div>' : '') +
      '<div class="wk" style="grid-template-columns:repeat(3,1fr)"><div><b dir="' + sd(first.top) + '">' + fmtSet(first.top) + '</b><span>أول مرة</span></div><div><b dir="' + sd(last.top) + '">' + fmtSet(last.top) + '</b><span>آخر مرة</span></div><div><b dir="' + sd(best.top) + '">' + fmtSet(best.top) + '</b><span>🏆 أفضل رقم</span></div></div>' +
      '<div class="muted" style="font-size:13.5px;margin:8px 0 2px">' + trend + '</div>' +
      spark(hs.map(function (x) { return [x.day, Math.round(x.v * 10) / 10]; })) +
      (hs.length > 1 ? '<div class="muted" style="font-size:11.5px">الخط = أقوى جولة بكل مرة (الوزن والعدّات مع بعض).</div>' : '') +
      '<div class="hl">' + hs.slice().reverse().map(function (x) {
        return '<div class="hi"><div class="row"><b dir="ltr">' + esc(x.day) + '</b>' + (x === best && hs.length > 1 ? '<span class="pill y" style="flex:0 0 auto">🏆 أفضل</span>' : '') + '</div>' +
          '<div class="hs">' + x.sets.map(function (st) { return '<span dir="' + sd(st) + '"' + (st === x.top ? ' class="top"' : '') + '>' + fmtSet(st) + '</span>'; }).join('') + '</div></div>';
      }).join('') + '</div>';
    G.sheet(h, function () {});
  }
  function liftsCard() {
    var ids = []; D.logs.forEach(function (l) { if (ids.indexOf(l.exercise_id) < 0 && D.ex[l.exercise_id]) ids.push(l.exercise_id); });
    var rows = ids.map(function (id) { return { id: id, hs: histOf(id) }; }).filter(function (r) { return r.hs.length; })
      .sort(function (a, b) { return a.hs[a.hs.length - 1].day < b.hs[b.hs.length - 1].day ? 1 : -1; });
    if (!rows.length) return '';
    return '<div class="card"><b>تطوّر أوزانك 🏋️</b><div class="muted" style="font-size:13px;margin:2px 0 8px">من أول مرة لآخر مرة بكل تمرين. اكبس على التمرين لتشوف كل أوزانك السابقة.</div>' +
      rows.map(function (r) {
        var f = r.hs[0], l = r.hs[r.hs.length - 1], d = topVal(l) - topVal(f), cls = d > 0 ? 'green' : d < 0 ? 'red' : '';
        return '<button class="li" data-hist="' + r.id + '"><span class="ln">' + esc(D.ex[r.id].name_ar) + '<small>' + r.hs.length + ' ' + (r.hs.length === 1 ? 'مرة' : 'مرات') + '</small></span>' +
          '<span class="lv"><span><bdi dir="' + sd(f.top) + '">' + fmtSet(f.top) + '</bdi> ← <bdi dir="' + sd(l.top) + '">' + fmtSet(l.top) + '</bdi></span>' + (r.hs.length > 1 && d ? '<b class="' + cls + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.round(Math.abs(d) * 10) / 10 + ' ' + (f.timed ? 'ث' : 'كغ') + '</b>' : '') + '</span></button>';
      }).join('') + '</div>';
  }
  function setsForm(id, n, cur, timed, best) {
    var last = lastLog(id), h = '<div class="sets" data-sets="' + id + '" data-timed="' + (timed ? 1 : 0) + '"><div class="set"><span></span>' + (timed ? '<span class="lbl" style="grid-column:span 2">المدة (ثانية)</span>' : '<span class="lbl">الوزن (كغ)</span><span class="lbl">العدّات</span>') + '</div>';
    n = Math.max(n, cur.length);
    for (var s = 0; s < n; s++) {
      var v = cur[s] || {};
      if (timed) { h += '<div class="set"><span class="lbl">' + (s + 1) + '</span><input class="input" style="grid-column:span 2" inputmode="numeric" placeholder="كم ثانية ثبتت" data-t="' + s + '" value="' + esc(v.t || '') + '"></div>'; continue; }
      h += '<div class="set"><span class="lbl">' + (s + 1) + '</span><input class="input" inputmode="decimal" data-w="' + s + '" value="' + esc(v.w || '') + '"><input class="input" inputmode="numeric" data-r="' + s + '" value="' + esc(v.r || '') + '"></div>';
    }
    h += '</div>';
    if (last) h += '<div class="last">آخر مرة (' + esc(last.day) + '): ' + (last.sets || []).filter(Boolean).map(fmtSet).join('  ·  ') + '</div>';
    if (best && best.s) h += '<div class="last">🏆 أفضل رقم إلك: ' + fmtSet(best.s) + ' <span dir="ltr">(' + esc(best.day) + ')</span>. اكسره اليوم!</div>';
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
    if (NATIVE && NATIVE.notify && document.visibilityState !== 'visible') { try { NATIVE.notify('خلصت الراحة 💪', 'يلا عالجولة الجاية'); } catch (e) {} return; }
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    navigator.serviceWorker && navigator.serviceWorker.ready.then(function (r) {
      r.showNotification('خلصت الراحة 💪', { body: 'يلا عالجولة الجاية', icon: IMG + 'icon-192.png', badge: IMG + 'icon-192.png', tag: 'gmc-rest', renotify: true, vibrate: [300, 150, 300] });
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
          return S.upsert('coach_push_subs', { endpoint: j.endpoint, client_id: S.a.uid, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: ('BETA|' + navigator.userAgent).slice(0, 200) }, 'endpoint');
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
    var sets = [], timed = box.getAttribute('data-timed') === '1';
    $$('[data-w]', box).forEach(function (inp) { var s = +inp.getAttribute('data-w'); sets[s] = sets[s] || {}; sets[s].w = inp.value.trim(); });
    $$('[data-t]', box).forEach(function (inp) { var s = +inp.getAttribute('data-t'); sets[s] = sets[s] || {}; sets[s].t = inp.value.trim(); });
    $$('[data-r]', box).forEach(function (inp) { var s = +inp.getAttribute('data-r'); sets[s] = sets[s] || {}; sets[s].r = inp.value.trim(); });
    var t = G.today(), row = { client_id: S.a.uid, day: t, exercise_id: +id, sets: sets, updated_at: new Date().toISOString() };
    var prev = bestBefore(+id, timed);
    D.logs = D.logs.filter(function (l) { return !(l.day === t && l.exercise_id === +id); }); D.logs.unshift({ day: t, exercise_id: +id, sets: sets }); saveCache();
    S.upsert('coach_logs', row, 'client_id,day,exercise_id').catch(function () { G.toast('ما انحفظ، تأكد من الإنترنت'); });
    var card = $('.ex[data-ex="' + id + '"]'), on = sets.some(function (s) { return s && (s.w || s.r || s.t); });
    if (card) { card.classList.toggle('done', on); var b = $('[data-log="' + id + '"]', card); if (b) b.textContent = on ? '✓ مسجّل' : $('[data-t]', box) ? 'سجّل المدة' : 'سجّل أوزانك'; }
    // personal record (only when there IS an earlier record to beat)
    var now = bestOf(sets, timed), c = todayC(); c.prs = c.prs || [];
    if (prev.v > 0 && now.v > prev.v * 1.001 && c.prs.indexOf(+id) < 0) {
      c.prs.push(+id); celebrate('🏆 رقم قياسي جديد!', fmtSet(now.s) + ' (كان ' + fmtSet(prev.s) + ')');
      if (card && !$('.prb', card)) { var p = $('.pic', card); if (p) p.insertAdjacentHTML('beforeend', '<span class="prb">🏆 رقم قياسي</span>'); }
    } else if (c.prs.indexOf(+id) >= 0 && !(now.v > prev.v * 1.001)) c.prs = c.prs.filter(function (x) { return x !== +id; });
    markTrained();
  }
  function celebrate(title, sub) {
    var el = document.createElement('div'); el.className = 'celebrate'; el.onclick = function () { el.remove(); }; el.innerHTML = '<b>' + esc(title) + '</b><span>' + esc(sub) + '</span>';
    document.body.appendChild(el); if (navigator.vibrate) try { navigator.vibrate([80, 60, 80, 60, 200]); } catch (e) {}
    if (soundOn() && audio()) { var t0 = actx.currentTime; [523, 659, 784, 1047].forEach(function (f, i) { tone(t0 + i * 0.12, f, 0.2, 0.4); }); }
    setTimeout(function () { el.classList.add('out'); }, 2600); setTimeout(function () { el.remove(); }, 3200);
  }
  function markTrained() {
    var t = G.today(), c = todayC();
    if (c.train) { saveCheckin(t, true); return; }
    c.train = 'yes'; saveCheckin(t, true);
  }
  function postponeSheet(di) {
    var d = days()[di] || {}, tm = G.parseD(G.addDays(G.today(), 1)).getDay();
    G.sheet('<div class="h2">أجّل ' + esc(d.title || 'التمرين') + ' لبكرا؟</div>' +
      '<p class="muted" style="font-size:13.5px;margin:0 0 10px">بكرا (' + G.WD[tm] + ') بيطلعلك هالتمرين أول شي. إذا كان عندك بكرا تمرين تاني، فيك تختار الأصلي من شاشة اليوم.<br>التأجيل مرة بالأسبوع طبيعي، المهم ما يصير عادة 💪</p>' +
      '<button class="btn gold block" id="pp-ok">أجّل لبكرا</button><button class="btn block" style="margin-top:8px" id="pp-no">لا، رح اتمرّن</button>', function (b) {
      $('#pp-ok', b).onclick = function () { var c = todayC(); c.postpone = di; delete c.useOrig; saveCheckin(G.today(), true); G.closeSheet(); G.toast('تأجّل لبكرا ✓'); render(); };
      $('#pp-no', b).onclick = G.closeSheet;
    });
  }
  function swapSheet(key) {
    var p = key.split('-'), di = +p[0], i = +p[1], it = days()[di].items[i], orig = D.ex[it.ex] || {}, c = todayC(), cur = c.swaps && c.swaps[key];
    G.sheet('<div class="h2">بديل لـ ' + esc(orig.name_ar || 'التمرين') + '</div><p class="muted" style="font-size:13px;margin:0 0 10px">نفس العضلة. البديل لليوم بس، وبكرا بترجع الخطة متل ما هي.</p>' +
      (cur ? '<button class="btn block" id="sw-reset" style="margin-bottom:10px">↩ رجّع التمرين الأصلي</button>' : '') + '<div id="sw-list"><div class="spinner"></div></div>', function (b) {
      var rs = $('#sw-reset', b); if (rs) rs.onclick = function () { delete c.swaps[key]; saveCheckin(G.today(), true); G.closeSheet(); render(); };
      if (!orig.muscle) { $('#sw-list', b).innerHTML = '<div class="muted">ما في معلومات عن عضلة هالتمرين.</div>'; return; }
      S.rest('coach_exercises', 'select=*&muscle=eq.' + encodeURIComponent(orig.muscle) + '&id=neq.' + orig.id + '&order=name_ar&limit=40').then(function (rows) {
        var f = D.me.gender === 'female';
        rows = (rows || []).filter(function (e) { return f ? (e.image_female || e.image_male) : (e.image_male || e.image_female); });
        $('#sw-list', b).innerHTML = rows.length ? rows.map(function (e) {
          return '<button class="swi" data-to="' + e.id + '"><img loading="lazy" src="' + esc(exImg(e)) + '" alt=""><span><b>' + esc(e.name_ar) + '</b><small>' + esc(e.equipment || '') + '</small></span></button>';
        }).join('') : '<div class="muted">ما لقينا بدائل لهالعضلة.</div>';
        $$('[data-to]', b).forEach(function (x) { x.onclick = function () {
          var e = rows.filter(function (r) { return String(r.id) === x.getAttribute('data-to'); })[0]; D.ex[e.id] = e;
          c.swaps = c.swaps || {}; c.swaps[key] = e.id; saveCheckin(G.today(), true); G.closeSheet(); render(); G.toast('تبدّل لليوم ✓');
        }; });
      }).catch(function () { $('#sw-list', b).innerHTML = '<div class="muted">ما قدرنا نجيب البدائل، تأكد من الإنترنت.</div>'; });
    });
  }

  /* ---------- nutrition ---------- */
  function foodView() {
    var n = D.nutrition && D.nutrition.data;
    if (!n || !(n.meals || []).length) return '<div class="empty">خطتك الغذائية رح تنزل هون قريباً.</div>' + kcalCard(D.checkins[G.today()] || {}, false);
    var c = D.checkins[G.today()] || {}, done = c.meals || {};
    var h = '<div class="dayhead"><div class="en">NUTRITION PLAN</div><div class="h1">' + esc(D.nutrition.title || 'خطتي الغذائية') + '</div></div>';
    if (n.kcal || n.p) h += '<div class="card"><div class="macros"><div><b>' + esc(n.kcal || '-') + '</b><span>سعرة</span></div><div><b>' + esc(n.p || '-') + '</b><span>بروتين غ</span></div><div><b>' + esc(n.c || '-') + '</b><span>كارب غ</span></div><div><b>' + esc(n.f || '-') + '</b><span>دهون غ</span></div></div>' +
      (n.water ? '<div class="muted" style="text-align:center;margin-top:8px">المي: ' + esc(n.water) + '</div>' : '') + '</div>';
    h += kcalCard(c, false);
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
    ['energy', 'طاقتك', [['high', 'عالية'], ['mid', 'متوسطة'], ['low', 'منخفضة']]]
  ];
  function progView() {
    var t = G.today(), c = D.checkins[t] || {};
    var h = '<div class="dayhead"><div class="en">DAILY CHECK-IN</div><div class="h1">تشيك اليوم</div><div class="muted" style="font-size:13px">' + G.WD[new Date().getDay()] + ' ' + t + ' · 🔥 ' + streak() + ' يوم متتالي</div></div><div class="card">';
    CHK.forEach(function (q) {
      h += '<div style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:6px">' + q[1] + '</div><div class="chips" style="margin:0;flex-wrap:wrap">' +
        q[2].map(function (o) { return '<button class="chip' + (String(c[q[0]]) === o[0] ? ' on' : '') + '" data-ck="' + q[0] + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    });
    h += waterSlider(c);
    h += '<div class="grid2"><label class="field"><span>الوزن (كغ) اختياري</span><input class="input" id="ck-w" inputmode="decimal" value="' + esc(c.weight || '') + '"></label>' +
      '<label class="field"><span>الخصر (سم) اختياري</span><input class="input" id="ck-waist" inputmode="decimal" value="' + esc(c.waist || '') + '"></label></div>' +
      '<label class="field"><span>ملاحظة للكوتش</span><textarea class="input" id="ck-note" rows="2">' + esc(c.note || '') + '</textarea></label>' +
      '<button class="btn gold block" id="ck-save">حفظ</button><div class="muted" style="font-size:12px;text-align:center;margin-top:6px">كل شي بينحفظ لحالو، الزر للتأكيد بس.</div></div>';
    h += weekCard(new Date().getDay() === 0);
    var dots = '';
    for (var i = 13; i >= 0; i--) { var d = G.addDays(t, -i), x = D.checkins[d]; dots += '<i title="' + d + '" style="width:18px;height:18px;border-radius:5px;display:block;background:' + (x && logged(d) ? score(x) >= 75 ? 'var(--green)' : score(x) >= 50 ? 'var(--gold)' : 'var(--red)' : '#222') + '"></i>'; }
    h += '<div class="card"><b>آخر 14 يوم</b><div style="display:flex;gap:4px;direction:ltr;justify-content:space-between;margin-top:8px">' + dots + '</div></div>';
    h += weightCard();
    h += liftsCard();
    h += '<div class="card"><b>صور التقدم</b><div id="photos"></div></div>';
    return h;
  }
  /* weekly average weight: daily weight jumps with water/salt, the 7-day average shows the real trend */
  function weightCard() {
    var t = G.today(), weeks = [];
    for (var k = 7; k >= 0; k--) { var to = G.addDays(t, -7 * k), a = avgW(G.addDays(to, -6), to); if (a) weeks.push([to, Math.round(a * 10) / 10]); }
    var last = null; Object.keys(D.checkins).sort().forEach(function (d) { var w = parseFloat(D.checkins[d].weight); if (w) last = [d, w]; });
    if (!last) return '<div class="card"><b>وزنك</b><div class="muted" style="font-size:13px;margin-top:4px">سجّل وزنك الصبح على الريق 2 إلى 3 مرات بالأسبوع، وهون بيطلعلك المتوسط الأسبوعي.</div></div>';
    var cur = weeks.length ? weeks[weeks.length - 1] : null, prev = weeks.length > 1 ? weeks[weeks.length - 2] : null, first = weeks[0];
    var h = '<div class="card"><b>وزنك</b> <span class="muted">آخر وزن ' + last[1] + ' كغ</span>';
    if (cur && cur[0] === t) h += '<div class="wavg"><div><b>' + cur[1] + '</b><span>متوسط هالأسبوع</span></div>' + (prev ? '<div><b class="' + (cur[1] - prev[1] <= 0 ? 'green' : 'gold') + '">' + fmtDiff(cur[1] - prev[1]) + '</b><span>عن الأسبوع الماضي</span></div>' : '') +
      (weeks.length > 2 ? '<div><b>' + fmtDiff(cur[1] - first[1]) + '</b><span>من ' + weeks.length + ' أسابيع</span></div>' : '') + '</div>';
    if (weeks.length > 1) h += spark(weeks) + '<div class="muted" style="font-size:12px">كل نقطة = متوسط أسبوع. الوزن اليومي بيطلع وبينزل بسبب المي والملح، المتوسط هو يلي بيهم.</div>';
    return h + '</div>';
  }
  function waterTarget() { var w = D.nutrition && D.nutrition.data && D.nutrition.data.water, m = String(w || '').match(/\d+(?:[.,]\d+)?/); var v = m ? parseFloat(m[0].replace(',', '.')) : 0; return v > 0 && v <= 8 ? v : 3; }
  function fmtL(v) { return String(Math.round(v * 100) / 100); }
  function waterInner(c) {
    var tg = waterTarget(), w = parseFloat(c.water) || 0, pct = Math.min(100, Math.round(w / tg * 100)), cups = Math.round(tg / .25), done = Math.round(w / .25), g = '';
    for (var i = 0; i < cups; i++) g += '<i style="flex:1;height:14px;border-radius:4px;background:' + (i < done ? 'var(--gold)' : '#262626') + '"></i>';
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><b>المي</b><span><b class="gold" style="font-size:20px">' + fmtL(w) + '</b> <span class="muted">من ' + fmtL(tg) + ' لتر' + (w >= tg ? ' ✓' : '') + '</span></span></div>' +
      '<div style="display:flex;gap:3px;direction:ltr;margin-bottom:8px">' + g + '</div>' +
      '<div class="muted" style="font-size:12.5px;margin-bottom:8px">' + (w >= tg ? 'وصلت لهدفك اليوم 💧' : 'باقي ' + fmtL(Math.max(0, tg - w)) + ' لتر (' + Math.ceil((tg - w) / .25 - 1e-9) + ' كاسة)') + ' · ' + pct + '%</div>';
  }
  function waterBox(c) {
    return '<div style="margin-bottom:12px;padding:10px;border:1px solid #2a2a2a;border-radius:12px"><div id="wbox">' + waterInner(c) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 44px;gap:6px">' +
      [['0.25', '+ كاسة', '250 مل'], ['0.5', '+ قنينة', '500 مل'], ['1', '+ لتر', '1000 مل']].map(function (x) { return '<button class="btn sm gold" data-wa="' + x[0] + '" style="flex-direction:column;gap:0;padding:7px 4px;min-width:0;white-space:normal;line-height:1.25"><span>' + x[1] + '</span><small style="font-weight:400;font-size:11px">' + x[2] + '</small></button>'; }).join('') +
      '<button class="btn sm" data-wa="-0.25" style="padding:0;font-size:20px" aria-label="ناقص كاسة">−</button></div></div>';
  }
  /* progress tab: one slider in 250 ml steps instead of the add buttons */
  function waterSlider(c) {
    var tg = waterTarget(), w = parseFloat(c.water) || 0, mx = Math.max(Math.ceil((tg + 1.5) * 4) / 4, w);
    return '<div style="margin-bottom:12px;padding:10px;border:1px solid #2a2a2a;border-radius:12px"><div id="wbox">' + waterInner(c) + '</div>' +
      '<input type="range" class="wsl" id="wsl" min="0" max="' + mx + '" step="0.25" value="' + w + '" aria-label="كمية المي باللتر" style="--p:' + Math.round(w / mx * 100) + '%">' +
      '<div class="row muted" style="font-size:12px;direction:ltr;margin-top:2px"><span>0</span><span>' + fmtL(tg) + ' L 🎯</span><span>' + fmtL(mx) + ' L</span></div></div>';
  }
  function setWater(v) {
    var c = todayC(); c.water = fmtL(Math.max(0, Math.min(10, v)));
    var b = $('#wbox'); if (b) b.innerHTML = waterInner(c);
    autoSave();
  }
  var wTimer;
  function autoSave() { var t = G.today(); saveCache(); clearTimeout(wTimer); wTimer = setTimeout(function () { wTimer = null; saveCheckin(t, true); }, 1200); }
  function addWater(d) {
    var c = todayC();
    c.water = fmtL(Math.max(0, Math.min(10, (parseFloat(c.water) || 0) + d)));
    var b = $('#wbox'); if (b) b.innerHTML = waterInner(c);
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
    autoSave();
  }
  function fmtDiff(v) { v = Math.round(v * 10) / 10; return (v > 0 ? '+' : '') + v + ' كغ'; }
  function score(c) {
    var s = 0, n = 0;
    if (c.train) { n++; s += c.train === 'no' ? 0 : 1; }
    if (c.food) { n++; s += (+c.food) / 100; }
    if (c.sleep) { n++; s += +c.sleep >= 7 ? 1 : +c.sleep >= 6 ? .5 : 0; }
    if (c.water) { n++; s += Math.min(1, (parseFloat(c.water) || 0) / waterTarget()); }
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
  function notifRow() {
    if (NATIVE) {
      var on = nativeOn();
      return '<div class="row" style="margin-top:8px"><span>الإشعارات (تطبيق الأندرويد): تذكير التمرين، التقرير، صور التقدم وكل رسائل الكوتش</span><button class="btn sm' + (on ? ' gold' : '') + '" id="ntf-n" style="flex:0 0 auto">' + (on ? 'مفعّل' : 'فعّل') + '</button></div>' +
        (on ? '<button class="btn sm ghost" id="ntf-t" style="margin-top:8px">ابعت إشعار تجربة</button>' : '');
    }
    if (!('Notification' in window)) return '<div class="muted" style="font-size:13px;margin-top:8px">هالمتصفح ما بيدعم الإشعارات. على الآيفون: افتح الرابط من Safari وضيفو عالشاشة الرئيسية.</div>';
    return '<div class="row" style="margin-top:8px"><span>الإشعارات: خلص الراحة + تذكير التمرين والتقرير</span><button class="btn sm' + (Notification.permission === 'granted' ? ' gold' : '') + '" id="ntf" style="flex:0 0 auto">' + (Notification.permission === 'granted' ? 'مفعّل' : Notification.permission === 'denied' ? 'ممنوع' : 'فعّل') + '</button></div>';
  }
  function meView() {
    var m = D.me, d = daysLeft();
    return '<div class="card"><div class="h2">' + esc(m.name) + '</div><div class="muted" dir="ltr" style="text-align:right">@' + esc(m.username) + '</div>' +
      '<div style="margin-top:10px;display:grid;gap:6px">' + (m.package ? '<div>الباقة: <b>' + esc(PKG[m.package] || m.package) + '</b></div>' : '') +
      (m.start_date ? '<div>البداية: <b>' + esc(m.start_date) + '</b></div>' : '') + (m.end_date ? '<div>الانتهاء: <b>' + esc(m.end_date) + '</b>' + (d !== null && d >= 0 ? ' <span class="muted">(باقي ' + d + ' يوم)</span>' : '') + '</div>' : '') + '</div>' +
      (d !== null && d >= 0 && d <= 5 ? '<a class="btn gold block" style="margin-top:10px" target="_blank" rel="noopener" href="' + waLink('مرحبا كوتش جورج، بدي جدّد اشتراكي (' + m.name + ')') + '">جدّد اشتراكك قبل ما يخلص</a>' : '') + '</div>' +
      '<a class="btn gold block" style="margin-bottom:10px" target="_blank" rel="noopener" href="' + waLink('مرحبا كوتش جورج، أنا ' + m.name) + '">راسل الكوتش على واتساب</a>' +
      '<div class="card"><div class="h2" style="font-size:16px">الصوت والإشعارات</div>' +
      '<div class="row"><span>صوت لما تخلص الراحة</span><button class="btn sm' + (soundOn() ? ' gold' : '') + '" id="snd" style="flex:0 0 auto">' + (soundOn() ? 'شغّال' : 'مطفى') + '</button></div>' + notifRow() + '</div>' +
      '<button class="btn block" style="margin-bottom:10px" id="pw">تغيير كلمة المرور</button>' +
      '<button class="btn block" style="margin-bottom:10px" id="rf">تحديث الخطة</button>' +
      '<button class="btn block danger" id="lo">تسجيل خروج</button>' +
      '<p class="muted" style="text-align:center;font-size:12.5px;margin-top:18px">نسخة تجريبية (BETA). أي ملاحظة ابعتها للكوتش.</p>';
  }
  function nativeLoginSheet() {
    G.sheet('<div class="h2">تفعيل الإشعارات</div><p class="muted" style="font-size:13px;margin:0 0 10px">اكتب كلمة المرور مرة وحدة، والتطبيق بيصير يجيب الإشعارات لحالو حتى لو مسكّر.</p>' +
      '<input class="input" id="nl-p" type="password" dir="ltr" autocomplete="current-password" placeholder="كلمة المرور"><button class="btn gold block" style="margin-top:10px" id="nl-b">فعّل</button>', function (b) {
      $('#nl-b', b).onclick = function () {
        var p = $('#nl-p', b).value; if (!p) return;
        S.login(S.a.user || D.me.username, p).then(function () { nativeLogin(S.a.user || D.me.username, p); G.closeSheet(); G.toast('تفعّلت الإشعارات ✓'); setTimeout(render, 1500); })
          .catch(function (e) { G.toast(G.errText(e)); });
      };
    });
  }

  /* ---------- events ---------- */
  function bind() {
    $$('[data-go]').forEach(function (b) { b.onclick = function () { if (b.hasAttribute('data-di')) { dayIdx = +b.getAttribute('data-di'); } go(b.getAttribute('data-go')); }; });
    $$('[data-day]').forEach(function (b) { b.onclick = function () { dayIdx = +b.getAttribute('data-day'); render(); }; });
    $$('[data-log]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-log'); openLog[id] = !openLog[id]; render(); var c = $('.ex[data-ex="' + id + '"]'); if (c && openLog[id]) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; });
    $$('[data-sets]').forEach(function (box) { var id = box.getAttribute('data-sets'); $$('input', box).forEach(function (i) { i.onchange = function () { saveSets(id); }; }); });
    $$('[data-rest]').forEach(function (b) { b.onclick = function () { startTimer(+b.getAttribute('data-rest')); }; });
    $$('[data-swap]').forEach(function (b) { b.onclick = function () { swapSheet(b.getAttribute('data-swap')); }; });
    $$('[data-meal]').forEach(function (b) {
      b.onclick = function () {
        var t = G.today(), c = todayC(), i = b.getAttribute('data-meal'); c.meals = c.meals || {};
        c.meals[i] = !c.meals[i]; var n = (D.nutrition.data.meals || []).length, k = 0; for (var j = 0; j < n; j++) if (c.meals[j]) k++;
        c.food = String(n ? Math.round(k / n * 4) * 25 : 0); saveCheckin(t, true); render();
      };
    });
    var opa = $('#op-add'); if (opa) opa.onclick = offplanSheet;
    $$('[data-opdel]').forEach(function (b) { b.onclick = function () { var c = todayC(); c.offplan = offList(c).filter(function (_, i) { return i !== +b.getAttribute('data-opdel'); }); saveCheckin(G.today(), true); render(); }; });
    var wk = $('#wk-open'); if (wk) wk.onclick = weeklySheet;
    $$('[data-hist]').forEach(function (b) { b.onclick = function () { histSheet(+b.getAttribute('data-hist')); }; });
    var ppd = $('#pp-do'); if (ppd) ppd.onclick = function () { postponeSheet(+ppd.getAttribute('data-pi')); };
    var ppu = $('#pp-undo'); if (ppu) ppu.onclick = function () { var c = todayC(); delete c.postpone; saveCheckin(G.today(), true); render(); };
    var ppo = $('#pp-orig'); if (ppo) ppo.onclick = function () { var c = todayC(); if (c.useOrig) delete c.useOrig; else c.useOrig = true; dayIdx = null; saveCheckin(G.today(), true); render(); };
    $$('[data-wa]').forEach(function (b) { b.onclick = function () { addWater(parseFloat(b.getAttribute('data-wa'))); }; });
    var wsl = $('#wsl'); if (wsl) { var last = wsl.value; wsl.oninput = function () { wsl.style.setProperty('--p', Math.round(wsl.value / wsl.max * 100) + '%'); if (wsl.value !== last && navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} last = wsl.value; setWater(parseFloat(wsl.value)); }; }
    $$('[data-ck]').forEach(function (b) { b.onclick = function () { var c = todayC(); c[b.getAttribute('data-ck')] = b.getAttribute('data-v'); $$('[data-ck="' + b.getAttribute('data-ck') + '"]').forEach(function (x) { x.classList.toggle('on', x === b); }); autoSave(); }; });
    [['ck-w', 'weight'], ['ck-waist', 'waist'], ['ck-note', 'note']].forEach(function (f) { var el = $('#' + f[0]); if (el) el.oninput = function () { var c = todayC(); c[f[1]] = el.value.trim(); autoSave(); }; });
    var phEl = $('#photos'); if (phEl) G.photosUI(S, S.a.uid, phEl);
    var sv = $('#ck-save'); if (sv) sv.onclick = function () { var t = G.today(), c = todayC(); c.weight = $('#ck-w').value.trim(); c.waist = $('#ck-waist').value.trim(); c.note = $('#ck-note').value.trim(); saveCheckin(t).then(render); };
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
    var nn = $('#ntf-n'); if (nn) nn.onclick = function () { if (NATIVE.requestPermission) try { NATIVE.requestPermission(); } catch (e) {} if (!nativeOn()) nativeLoginSheet(); else G.toast('مفعّلة ✓'); };
    var nt = $('#ntf-t'); if (nt) nt.onclick = function () { try { NATIVE.notify('إشعار تجربة ✅', 'الإشعارات شغالة على جهازك.'); } catch (e) {} };
    var rf = $('#rf'); if (rf) rf.onclick = function () { refresh().then(function () { G.toast('تم التحديث'); }); };
    var pw = $('#pw'); if (pw) pw.onclick = function () {
      G.sheet('<div class="h2">كلمة مرور جديدة</div><input class="input" id="np" type="password" dir="ltr" autocomplete="new-password" placeholder="6 أحرف أو أكثر"><button class="btn gold block" style="margin-top:10px" id="npb">حفظ</button>', function (b) {
        $('#npb', b).onclick = function () {
          var v = $('#np', b).value; if (v.length < 6) return G.toast('6 أحرف أو أكثر');
          S.api('/auth/v1/user', { method: 'PUT', body: { password: v } }).then(function () { nativeLogin(S.a.user || D.me.username, v); G.closeSheet(); G.toast('تغيّرت كلمة المرور ✓'); }).catch(function (e) { G.toast(G.errText(e)); });
        };
      });
    };
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.a && D && !wTimer) refresh(); });
  window.GMB = { render: function () { render(); } };   // native side can ask for a redraw
  boot();
})();
