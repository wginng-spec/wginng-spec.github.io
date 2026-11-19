/* ============================================================
   留言板 + 登录门
   ------------------------------------------------------------
   两种身份：
     admin  —— 邮箱 + 密码（首次进入自设），可改站内文字、可删留言
     guest  —— 输个昵称就能进，能看能留言，不能改内容

   存储：现在的实现走本机浏览器（localStorage）。
   将来接后端时，只需要替换下面 Store 里的六个函数，
   页面逻辑一行都不用改。
   ============================================================ */

(function () {
  'use strict';

  var ADMIN_EMAIL = 'jingyi.wang@hetian168.com';
  var K = {
    msg: 'jy.gb.msg.v3',
    admin: 'jy.gb.admin.v3',
    sess: 'jy.gb.sess.v3',
    content: 'jy.gb.content.v3',
    nick: 'jy.gb.nick.v3',
    seen: 'jy.gb.seen.v3'   /* 已读到的最新一条留言时间戳，用来算未读 */
  };
  var MAX_LEN = 200;
  var MAX_TOTAL = 200;
  var SESSION_DAYS = 30;

  /* 留言板只能在应用的发布域名上连云端：服务端会精确匹配 Origin，
     别的域名（比如 GitHub Pages 镜像站）请求会被 CORS 挡掉。
     所以镜像站不自己渲染留言板，点「留言板」直接跳回主站，两边永远是同一份数据。 */
  var MAIN_SITE_URL = 'https://wbapp-x482mkiz1oluemawbxjjzx.app.workbuddy.host/?sharecode=NKZUJBPFPY';
  var IS_MIRROR = location.hostname.indexOf('workbuddy.host') < 0 &&
    location.hostname !== 'localhost' &&
    location.hostname !== '127.0.0.1' &&
    location.protocol !== 'file:';


  /* ---------------- 云服务（WorkBuddy 云托管） ---------------- */

  var CLOUD_CFG = {
    endpoint: 'https://wbapp-x482mkiz1oluemawbxjjzx.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_X482MkIZ1olUemAWbXjjZX_vzVdGdnD6CutFJabm7dRn8rdJi31tcPR'
  };
  var cloud = null;
  var cloudState = 'idle';
  var cloudErr = '';

  function initCloud() {
    if (cloudState !== 'idle') return;
    var WB = window.WorkBuddyCloud;
    if (!WB || typeof WB.createWorkBuddyCloud !== 'function') return; // 还没到，等 whenCloud 再试
    try {
      cloud = WB.createWorkBuddyCloud(CLOUD_CFG);
      cloudState = 'ready';
    } catch (e) {
      cloudState = 'off';
      cloudErr = (e && e.message) || '云服务初始化失败';
    }
  }

  /* SDK 走 CDN，可能比本脚本晚到：最多等 6 秒，等不到就退到本机存储 */
  function whenCloud(cb) {
    var tries = 0;
    (function step() {
      initCloud();
      if (cloudState === 'idle') {
        if (tries < 20) { tries++; setTimeout(step, 300); return; }
        cloudState = 'off';
        cloudErr = '云服务脚本没加载成功';
      }
      cb();
    })();
  }

  /* ---------------- 存储层 ---------------- */

  var Store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; }
      catch (e) { return false; }
    },
    localMessages: function () { return Store.get(K.msg, []); },
    /* 留言：云端优先，所有人共用一份；连不上才退回本机 */
    listMessages: function () {
      if (!cloud) return Promise.resolve(Store.localMessages());
      return cloud.database.from('guestbook')
        .select('id, nick, body, created_at')
        .order('created_at', { ascending: false })
        .limit(120)
        .then(function (res) {
          if (res && res.error) throw res.error;
          return (res.data || []).map(function (r) {
            return { id: 'c' + r.id, nick: r.nick, text: r.body, ts: new Date(r.created_at).getTime() };
          });
        });
    },
    addMessage: function (nick, text, role) {
      if (cloud) {
        return cloud.database.from('guestbook')
          .insert({ nick: String(nick).slice(0, 20), body: String(text).slice(0, MAX_LEN) })
          .select()
          .then(function (res) {
            if (res && res.error) throw res.error;
            return true;
          });
      }
      var list = Store.localMessages();
      list.unshift({ id: uid(), nick: nick, text: text, ts: Date.now(), role: role });
      Store.set(K.msg, list.slice(0, MAX_TOTAL));
      return Promise.resolve(true);
    },
    removeMessage: function (id) {
      return Store.set(K.msg, Store.localMessages().filter(function (m) { return m.id !== id; }));
    }
  };

  /* ---------------- 小工具 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function ago(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 604800000) return Math.floor(d / 86400000) + ' 天前';
    var t = new Date(ts);
    return (t.getMonth() + 1) + ' 月 ' + t.getDate() + ' 日';
  }

  var AV_COLORS = ['var(--red)', 'var(--blue)', 'var(--green)', 'var(--pink)', 'var(--bg)'];

  function avatarColor(str) {
    var h = 0;
    for (var i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }

  /* ---------------- 密码哈希 ----------------
     https 下走 WebCrypto 的 SHA-256；file:// 下浏览器不给 subtle，
     退回一个加盐、多轮的非加密散列（本地钥匙，够用不当保险箱）。 */

  function hexOf(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s;
  }

  function weakHash(str) {
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var r = 0; r < 800; r++) {
      for (var i = 0; i < str.length; i++) {
        h1 ^= str.charCodeAt(i);
        h1 = (h1 * 16777619) >>> 0;
        h2 = ((h2 << 5) - h2 + h1) >>> 0;
      }
    }
    return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8) +
      ('0000000' + ((h1 ^ h2) >>> 0).toString(16)).slice(-8);
  }

  function hashPass(pw, salt) {
    var data = salt + '|' + pw + '|jingyi';
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      try {
        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
          .then(hexOf)
          .catch(function () { return weakHash(data); });
      } catch (e) { /* 落到下面 */ }
    }
    return Promise.resolve(weakHash(data));
  }

  function makeSalt() {
    var s = '';
    if (window.crypto && window.crypto.getRandomValues) {
      var b = new Uint8Array(12);
      window.crypto.getRandomValues(b);
      s = hexOf(b.buffer);
    } else {
      for (var i = 0; i < 12; i++) s += Math.floor(Math.random() * 256).toString(16);
    }
    return s;
  }

  /* ---------------- 会话 ---------------- */

  var session = Store.get(K.sess, null);
  if (session && (!session.exp || Date.now() > session.exp)) session = null;

  function saveSession(s) {
    session = s;
    if (s) s.exp = Date.now() + SESSION_DAYS * 86400000;
    Store.set(K.sess, s);
  }

  function isAdmin() { return !!session && session.role === 'admin'; }

  /* ---------------- 内容覆盖 ---------------- */

  var BASE = window.CONTENT ? JSON.parse(JSON.stringify(window.CONTENT)) : null;

  function getPath(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, val) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) return false;
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
    return true;
  }

  function applyOverrides() {
    if (!BASE || !window.CONTENT) return false;
    var saved = Store.get(K.content, {});
    var next = JSON.parse(JSON.stringify(BASE));
    var touched = false;
    ['zh', 'en'].forEach(function (lang) {
      var map = saved[lang] || {};
      Object.keys(map).forEach(function (path) {
        if (setPath(next[lang], path, map[path])) touched = true;
      });
    });
    window.CONTENT = next;
    return touched;
  }

  /* ---------------- 骨架：门 / 抽屉 / 提示 ---------------- */

  var WIZ_SVG = '' +
    '<div class="gb-cover" id="gbCover">' +
      '<img class="gb-frame gb-frame-a" src="gate-avatar.webp" alt="汪静怡的 3D 形象" draggable="false">' +
      '<img class="gb-frame gb-frame-b" src="gate-avatar2.webp" alt="" aria-hidden="true" draggable="false">' +
      '<span class="gb-float gb-f1">✦</span>' +
      '<span class="gb-float gb-f2">✦</span>' +
      '<span class="gb-float gb-f3">✦</span>' +
    '</div>';

  var gate = el('div', 'gb-gate');
  gate.hidden = true;
  gate.innerHTML = '' +
    '<div class="gb-gate-inner">' +
      '<div class="gb-hero">' + WIZ_SVG + '<p class="gb-hero-tip">把鼠标放到她身上，她会比个耶</p></div>' +
      '<div class="gb-card">' +
        '<p class="gb-kicker">Entrance</p>' +
        '<h2 class="gb-title">先说一句口令</h2>' +
        '<p class="gb-sub">站长登录后可以改站里的文字；访客填个名字就能进，能看也能留一句。</p>' +
        '<div class="gb-seg">' +
          '<button type="button" class="on" data-role="admin">我是站长</button>' +
          '<button type="button" data-role="guest">我是访客</button>' +
        '</div>' +
        '<form class="gb-form" id="gbAdminForm" novalidate>' +
          '<label class="gb-field"><span>邮箱</span><input type="email" id="gbEmail" autocomplete="username" spellcheck="false"></label>' +
          '<label class="gb-field"><span id="gbPassLabel">密码</span><input type="password" id="gbPass" autocomplete="current-password" placeholder="至少 8 位"></label>' +
          '<p class="gb-err" id="gbErr"></p>' +
          '<button class="gb-submit" type="submit" id="gbGo">开门</button>' +
        '</form>' +
        '<form class="gb-form" id="gbGuestForm" novalidate hidden>' +
          '<label class="gb-field"><span>你的名字</span><input id="gbNick" maxlength="16" placeholder="HR、朋友、路过的都行"></label>' +
          '<p class="gb-err" id="gbErr2"></p>' +
          '<button class="gb-submit" type="submit">以访客身份进去</button>' +
        '</form>' +
        '<p class="gb-fine" id="gbFine">密码加盐哈希后只存在这台设备的浏览器里，不会上传到任何地方。</p>' +
      '</div>' +
    '</div>';

  var veil = el('div', 'gb-veil');

  var drawer = el('div', 'gb-drawer');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = '' +
    '<div class="gb-head">' +
      '<h3>留言板</h3>' +
      '<span class="gb-who" id="gbWho"></span>' +
      '<button class="gb-out" id="gbLogout">退出</button>' +
      '<button class="gb-x" id="gbClose" aria-label="关闭">✕</button>' +
    '</div>' +
    '<div class="gb-tabs">' +
      '<button class="on" data-gbtab="board">留言</button>' +
      '<button data-gbtab="edit" id="gbTabEdit" hidden>改内容</button>' +
    '</div>' +
    '<div class="gb-body">' +
      '<div class="gb-pane" data-pane="board">' +
        '<p class="gb-note" id="gbNote"></p>' +
        '<div class="gb-compose">' +
          '<textarea id="gbText" maxlength="' + MAX_LEN + '" placeholder="留一句就走…"></textarea>' +
          '<div class="gb-compose-row">' +
            '<input id="gbNickInput" maxlength="16" placeholder="你的名字">' +
            '<button class="gb-send" id="gbSend">贴上</button>' +
          '</div>' +
          '<div class="gb-count"><span id="gbLen">0</span> / ' + MAX_LEN + '</div>' +
        '</div>' +
        '<div class="gb-list" id="gbList"></div>' +
      '</div>' +
      '<div class="gb-pane gb-edit" data-pane="edit" hidden></div>' +
    '</div>';

  var toastEl = el('div', 'gb-toast');

  var toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2200);
  }

  document.body.appendChild(veil);
  document.body.appendChild(drawer);
  document.body.appendChild(gate);
  document.body.appendChild(toastEl);

  /* ---------------- 控制条入口 ---------------- */

  function mountCtrl() {
    var ctrl = document.querySelector('.ctrl');
    if (!ctrl || document.getElementById('gbOpen')) return;
    var group = el('div', 'ctrl-group');
    group.innerHTML = '<button class="ctrl-btn" id="gbOpen"></button>';
    ctrl.appendChild(group);
    var btn = document.getElementById('gbOpen');
    if (IS_MIRROR) btn.title = '留言板在主站，点一下过去';
    btn.addEventListener('click', function () {
      if (IS_MIRROR) { goMainSite(); return; }
      openDrawer('board');
    });
  }

  /* 镜像站跳主站，把访客昵称一起带过去，免得他再输一遍名字 */
  function goMainSite() {
    var nick = (session && session.nick) || Store.get(K.nick, '') || '';
    var url = MAIN_SITE_URL;
    if (nick) url += '#guest=' + encodeURIComponent(nick);
    location.href = url;
  }

  /* 红点 = 未读数（打开抽屉就算读完，关着才累计） */
  function seenTs() { return Number(Store.get(K.seen, 0)) || 0; }

  function markSeen() {
    var t = seenTs();
    msgCache.forEach(function (m) { if (m.ts > t) t = m.ts; });
    if (t > seenTs()) Store.set(K.seen, t);
  }

  function unreadCount() {
    if (drawer.classList.contains('on')) return 0;
    var s = seenTs();
    var n = 0;
    for (var i = 0; i < msgCache.length; i++) if (msgCache[i].ts > s) n++;
    return n;
  }

  function paintCount() {
    var btn = document.getElementById('gbOpen');
    if (!btn) return;
    var n = unreadCount();
    btn.innerHTML = (window.state && window.state.lang === 'en' ? 'Board' : '留言板') +
      (n ? '<span class="gb-badge">' + (n > 99 ? '99+' : n) + '</span>' : '');
  }

  function syncChrome() {
    paintCount();
    var who = document.getElementById('gbWho');
    if (who) {
      who.textContent = isAdmin() ? '站长' : (session ? '访客 · ' + (session.nick || '访客') : '未登录');
      who.style.background = isAdmin() ? 'var(--green)' : 'var(--bg)';
    }
    var tabEdit = document.getElementById('gbTabEdit');
    if (tabEdit) tabEdit.hidden = !isAdmin();
    var note = document.getElementById('gbNote');
    if (note) {
      note.textContent = cloud
        ? '云端留言板 · 所有人看到的都是同一份'
        : '离线预览 · 云服务没连上（' + (cloudErr || '未初始化') + '），留言只存本机';
    }
  }

  /* ---------------- 登录门逻辑 ---------------- */

  var segAdmin = gate.querySelector('[data-role="admin"]');
  var segGuest = gate.querySelector('[data-role="guest"]');
  var formAdmin = gate.querySelector('#gbAdminForm');
  var formGuest = gate.querySelector('#gbGuestForm');
  var emailEl = gate.querySelector('#gbEmail');
  var passEl = gate.querySelector('#gbPass');
  var errEl = gate.querySelector('#gbErr');
  var errEl2 = gate.querySelector('#gbErr2');
  var nickEl = gate.querySelector('#gbNick');

  function credsExist() { return !!Store.get(K.admin, null); }

  function syncGateCopy() {
    var has = credsExist();
    gate.querySelector('#gbPassLabel').textContent = has ? '密码' : '设置一个密码';
    gate.querySelector('#gbGo').textContent = has ? '开门' : '设置密码并进入';
    gate.querySelector('#gbFine').innerHTML = has
      ? '密码加盐哈希后只存在这台设备的浏览器里，不会上传到任何地方。'
      : '第一次进来，先设一个只有你知道的密码。它只存在这台设备上。';
  }

  function switchRole(role) {
    segAdmin.classList.toggle('on', role === 'admin');
    segGuest.classList.toggle('on', role === 'guest');
    formAdmin.hidden = role !== 'admin';
    formGuest.hidden = role !== 'guest';
    errEl.textContent = '';
    errEl2.textContent = '';
    var first = role === 'admin' ? emailEl : nickEl;
    setTimeout(function () { if (first) first.focus(); }, 60);
  }

  segAdmin.addEventListener('click', function () { switchRole('admin'); });
  segGuest.addEventListener('click', function () { switchRole('guest'); });

  formAdmin.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = emailEl.value.trim().toLowerCase();
    var pw = passEl.value;
    errEl.textContent = '';

    if (email !== ADMIN_EMAIL) {
      errEl.textContent = '这个邮箱不是站长的账号。';
      return;
    }
    if (pw.length < 8) {
      errEl.textContent = '密码至少 8 位。';
      return;
    }

    var creds = Store.get(K.admin, null);
    if (!creds) {
      var salt = makeSalt();
      hashPass(pw, salt).then(function (h) {
        Store.set(K.admin, { email: ADMIN_EMAIL, salt: salt, hash: h, at: Date.now() });
        enterAs('admin', '站长');
        toast('密码设好了，下次用它进来');
      });
      return;
    }

    hashPass(pw, creds.salt).then(function (h) {
      if (h !== creds.hash) {
        errEl.textContent = '密码不对，再试一次。';
        passEl.select();
        return;
      }
      enterAs('admin', '站长');
    });
  });

  formGuest.addEventListener('submit', function (e) {
    e.preventDefault();
    var nick = nickEl.value.trim().slice(0, 16) || '访客';
    Store.set(K.nick, nick);
    enterAs('guest', nick);
  });

  function enterAs(role, nick) {
    saveSession({ role: role, nick: nick });
    gate.hidden = true;
    gate.style.display = 'none';
    document.body.style.overflow = '';
    syncChrome();
    renderList();
    renderEditor();
    if (role === 'admin') toast('欢迎回来，' + nick);
  }

  function showGate() {
    gate.hidden = false;
    gate.style.display = '';
    document.body.style.overflow = 'hidden';
    syncGateCopy();
    emailEl.value = emailEl.value || ADMIN_EMAIL;
    switchRole(credsExist() ? 'admin' : 'admin');
  }

  function logout() {
    saveSession(null);
    closeDrawer();
    syncChrome();
    showGate();
    toast('已退出');
  }

  /* ---------------- 封面立绘：双动作帧 + 轻微 3D 视差 ---------------- */

  var coverEl = gate.querySelector('#gbCover');
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TILT_BASE = -1;
  var targetTilt = TILT_BASE, curTilt = TILT_BASE;
  var targetYaw = 0, curYaw = 0;
  var targetY = 0, curY = 0;
  var idleFrames = 0;

  function onMove(e) {
    if (gate.hidden || !coverEl || reduceMotion) return;
    var r = coverEl.getBoundingClientRect();
    var rel = (e.clientX - (r.left + r.width / 2)) / Math.max(1, r.width / 2);
    var relY = (e.clientY - (r.top + r.height / 2)) / Math.max(1, r.height / 2);
    rel = Math.max(-1, Math.min(1, rel));
    relY = Math.max(-1, Math.min(1, relY));
    targetTilt = TILT_BASE + rel * 1.6;
    targetYaw = -rel * 5;
    targetY = relY * 3;
    idleFrames = 0;
  }

  document.addEventListener('pointermove', onMove, { passive: true });

  function loopCover(t) {
    idleFrames++;   /* 只做统计（鼠标静止了多少帧），不再驱动任何自漂移 */
    /* 不再做「静止自漂移」：鼠标不动时画面完全静止，避免被看成抖动 */
    curTilt += (targetTilt - curTilt) * 0.09;
    curYaw += (targetYaw - curYaw) * 0.07;
    curY += (targetY - curY) * 0.07;
    if (coverEl && !gate.hidden && !reduceMotion) {
      coverEl.style.transform = 'perspective(1100px) rotateY(' + curYaw.toFixed(2) +
        'deg) rotate(' + curTilt.toFixed(2) + 'deg) translateY(' + curY.toFixed(2) + 'px)';
    }
    requestAnimationFrame(loopCover);
  }
  requestAnimationFrame(loopCover);

  /* 触屏没有 hover：按住换动作，松手复原 */
  if (coverEl) {
    coverEl.addEventListener('pointerdown', function () {
      coverEl.classList.add('touch');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      coverEl.addEventListener(ev, function () {
        coverEl.classList.remove('touch');
      });
    });

  }

  /* ---------------- 留言板 ---------------- */

  var listEl = drawer.querySelector('#gbList');
  var textEl = drawer.querySelector('#gbText');
  var nickInput = drawer.querySelector('#gbNickInput');
  var lenEl = drawer.querySelector('#gbLen');

  var msgCache = [];

  function errText(err) {
    if (!err) return '未知错误';
    var m = err.message || err.error_description || String(err);
    if (/Failed to fetch|NetworkError|load failed|fetch/i.test(m)) return '网络不通';
    return String(m).slice(0, 60);
  }

  /* 拉一次列表：抽屉开着就重绘并标记已读，关着只更新红点 */
  function renderList() {
    var open = drawer.classList.contains('on');
    if (open) listEl.innerHTML = '<div class="gb-empty">正在读取留言…</div>';
    return Store.listMessages().then(function (list) {
      msgCache = list;
      if (open) {
        paintList(list);
        markSeen();
      }
      paintCount();
      return list;
    }).catch(function (err) {
      if (open) {
        listEl.innerHTML = '<div class="gb-empty">读不到留言：' + esc(errText(err)) +
          '<br>' + esc(cloudErr || '') + '</div>';
      }
    });
  }

  function paintList(list) {
    if (!list.length) {
      listEl.innerHTML = '<div class="gb-empty">还没有人留言。<br>你是第一个的话，我会记住你。</div>';
      return;
    }
    listEl.innerHTML = list.map(function (m, i) {
      var initial = (m.nick || '匿').slice(0, 1);
      return '' +
        '<div class="gb-item" style="animation-delay:' + Math.min(i * 40, 240) + 'ms">' +
          '<div class="gb-item-top">' +
            '<span class="gb-av" style="background:' + avatarColor(m.nick) + '">' + esc(initial) + '</span>' +
            '<span class="gb-nick">' + esc(m.nick) + '</span>' +
            (m.role === 'admin' ? '<span class="gb-who">站长</span>' : '') +
            '<span class="gb-time">' + ago(m.ts) + '</span>' +
            (isAdmin() && !cloud ? '<button class="gb-del" data-del="' + m.id + '">删</button>' : '') +
          '</div>' +
          '<p class="gb-text">' + esc(m.text) + '</p>' +
        '</div>';
    }).join('');
  }

  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-del]');
    if (!btn || !isAdmin()) return;
    if (!window.confirm('删掉这条留言？')) return;
    Store.removeMessage(btn.getAttribute('data-del'));
    renderList();
    syncChrome();
    toast('删掉了');
  });

  textEl.addEventListener('input', function () {
    lenEl.textContent = textEl.value.length;
  });

  drawer.querySelector('#gbSend').addEventListener('click', function () {
    if (!session) { showGate(); return; }
    var btn = this;
    if (btn.disabled) return;
    var text = textEl.value.trim();
    if (!text) { textEl.focus(); toast('还没写东西'); return; }
    if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);

    var nick = (isAdmin() ? '汪静怡' : (nickInput.value.trim() || session.nick || '访客')).slice(0, 16);
    if (!isAdmin()) {
      session.nick = nick;
      Store.set(K.nick, nick);
      saveSession(session);
    }

    btn.disabled = true;
    Store.addMessage(nick, text, session.role).then(function () {
      textEl.value = '';
      lenEl.textContent = '0';
      renderList();
      toast(cloud ? '贴上去了，大家都看得到' : '贴到本机了（云服务没连上）');
    }).catch(function (err) {
      toast('没发出去：' + errText(err));
    }).then(function () { btn.disabled = false; });
  });

  /* ---------------- 抽屉开关 ---------------- */

  function openDrawer(tab) {
    drawer.classList.add('on');
    veil.classList.add('on');
    drawer.setAttribute('aria-hidden', 'false');
    switchTab(tab || 'board');
    syncChrome();
    renderList();
    if (session && !isAdmin() && !nickInput.value) nickInput.value = session.nick || '';
  }

  function closeDrawer() {
    drawer.classList.remove('on');
    veil.classList.remove('on');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function switchTab(name) {
    drawer.querySelectorAll('[data-gbtab]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-gbtab') === name);
    });
    drawer.querySelectorAll('[data-pane]').forEach(function (p) {
      p.hidden = p.getAttribute('data-pane') !== name;
    });
    if (name === 'edit' && !isAdmin()) switchTab('board');
  }

  drawer.querySelectorAll('[data-gbtab]').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-gbtab')); });
  });

  veil.addEventListener('click', closeDrawer);
  drawer.querySelector('#gbClose').addEventListener('click', closeDrawer);
  drawer.querySelector('#gbLogout').addEventListener('click', logout);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (drawer.classList.contains('on')) closeDrawer();
    }
  });

  /* ---------------- 内容编辑（admin） ---------------- */

  var editPane = drawer.querySelector('[data-pane="edit"]');

  function editGroups(lang) {
    var t = BASE[lang];
    var groups = [];

    groups.push({
      title: '名字与简介',
      fields: [
        ['name', '姓名'], ['en', '英文名'], ['role', '一句话身份'],
        ['lede.0', '首页简介 ①'], ['lede.1', '首页简介 ②'],
        ['bio2', '长一点的自我介绍'], ['shout', '首页那句大字'],
        ['creed', '信条'], ['contactText', '联系页开头'],
        ['email', '邮箱'], ['loc', '所在地'], ['footer', '页脚']
      ]
    });

    groups.push({
      title: '关于',
      fields: [['aboutTitle', '小标题'], ['about.0', '第 1 段'], ['about.1', '第 2 段']]
    });

    t.exp.forEach(function (e, i) {
      groups.push({
        title: '经历 ' + (i + 1) + ' · ' + e.title,
        fields: [
          ['exp.' + i + '.title', '职位'],
          ['exp.' + i + '.when', '时间'],
          ['exp.' + i + '.org', '公司'],
          ['exp.' + i + '.points', '工作内容（一行一条）']
        ]
      });
    });

    t.works.forEach(function (w, i) {
      groups.push({
        title: '作品 ' + (i + 1) + ' · ' + w.title,
        fields: [
          ['works.' + i + '.title', '标题'],
          ['works.' + i + '.meta', '副标题'],
          ['works.' + i + '.desc', '描述']
        ]
      });
    });

    groups.push({
      title: '技能',
      fields: t.skills.reduce(function (acc, s, i) {
        return acc.concat([['skills.' + i + '.0', '第 ' + (i + 1) + ' 行 · 名称'], ['skills.' + i + '.1', '第 ' + (i + 1) + ' 行 · 内容']]);
      }, [])
    });

    groups.push({
      title: '教育',
      fields: [
        ['edu.school', '学校与专业'], ['edu.when', '时间'],
        ['edu.meta', '补充说明'], ['edu.points', '明细（一行一条）']
      ]
    });

    return groups;
  }

  function renderEditor() {
    if (!isAdmin() || !BASE) { editPane.innerHTML = ''; return; }
    var lang = (window.state && window.state.lang) || 'zh';
    var saved = Store.get(K.content, {})[lang] || {};

    var html = '' +
      '<p class="gb-note">只改文字，不动排版。存下来只影响这台设备，改完点开「改内容」可继续调整。</p>' +
      '<div class="gb-edit-actions">' +
        '<button class="primary" id="gbSaveEdit">保存</button>' +
        '<button id="gbRevert">全部还原</button>' +
      '</div>';

    editGroups(lang).forEach(function (g) {
      html += '<details><summary>' + esc(g.title) + '</summary><div>';
      g.fields.forEach(function (f) {
        var path = f[0], label = f[1];
        var val = saved[path] !== undefined ? saved[path] : getPath(BASE[lang], path);
        var isLines = Array.isArray(val);
        var text = isLines ? val.join('\n') : (val == null ? '' : String(val));
        var changed = saved[path] !== undefined;
        html += '<label><span>' + esc(label) + (changed ? ' · 已改' : '') + '</span>';
        if (isLines || text.length > 46) {
          html += '<textarea data-path="' + esc(path) + '" rows="' + (isLines ? 4 : 3) + '">' + esc(text) + '</textarea>';
        } else {
          html += '<input data-path="' + esc(path) + '" value="' + esc(text) + '">';
        }
        html += '</label>';
      });
      html += '</div></details>';
    });

    editPane.innerHTML = html;

    editPane.querySelector('#gbSaveEdit').addEventListener('click', saveEdits);
    editPane.querySelector('#gbRevert').addEventListener('click', function () {
      if (!window.confirm('把所有改过的文字还原成原始版本？')) return;
      var all = Store.get(K.content, {});
      delete all[lang];
      Store.set(K.content, all);
      applyOverrides();
      if (window.render) window.render();
      renderEditor();
      toast('已还原');
    });
  }

  function saveEdits() {
    if (!isAdmin() || !BASE) return;
    var lang = (window.state && window.state.lang) || 'zh';
    var all = Store.get(K.content, {});
    var map = all[lang] || {};
    var changed = 0;
    var empty = 0;

    editPane.querySelectorAll('[data-path]').forEach(function (field) {
      var path = field.getAttribute('data-path');
      var baseVal = getPath(BASE[lang], path);
      var val = Array.isArray(baseVal)
        ? field.value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; })
        : field.value;
      if (JSON.stringify(val) === JSON.stringify(baseVal)) {
        if (map[path] !== undefined) delete map[path];
      } else if (!val || (Array.isArray(val) && !val.length)) {
        empty++;
      } else {
        map[path] = val;
        changed++;
      }
    });

    if (empty) toast('有 ' + empty + ' 项是空的，已跳过');
    all[lang] = map;
    Store.set(K.content, all);
    applyOverrides();
    if (window.render) window.render();
    renderEditor();
    if (changed) toast('保存了 ' + changed + ' 处修改');
    else if (!empty) toast('没有改动');
  }

  /* ---------------- 启动 ---------------- */

  var _render = window.render;
  if (typeof _render === 'function') {
    window.render = function () {
      _render();
      syncChrome();
    };
  }

  function boot() {
    /* 从镜像站跳过来会带 #guest=昵称，直接以访客身份进门 */
    var hm = /(?:^|[#&])guest=([^&]+)/.exec(location.hash || '');
    if (hm && !session) {
      var fromMirror = '';
      try { fromMirror = decodeURIComponent(hm[1]).slice(0, 16); } catch (e) { fromMirror = ''; }
      if (fromMirror) {
        Store.set(K.nick, fromMirror);
        saveSession({ role: 'guest', nick: fromMirror });
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e2) {}
      }
    }

    mountCtrl();

    if (applyOverrides() && window.render) window.render();

    syncGateCopy();
    emailEl.value = ADMIN_EMAIL;
    nickEl.value = Store.get(K.nick, '') || '';

    if (session) {
      gate.hidden = true;
      gate.style.display = 'none';
      renderList();
      renderEditor();
    } else {
      showGate();
    }

    if (!session) {
      setTimeout(function () { emailEl.focus(); }, 260);
    }

    syncChrome();

    whenCloud(function () {
      syncChrome();
      renderList();
      /* 抽屉关着也要定时看一眼，否则新留言不会冒红点 */
      if (!drawer._gbTimer) {
        drawer._gbTimer = setInterval(function () { renderList(); }, 40000);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.GB = {
    logout: logout,
    open: openDrawer,
    isAdmin: isAdmin,
    session: function () { return session; },
    aim: function (x, y) { onMove({ clientX: x, clientY: y }); },
    dbg: function () {
      return {
        hidden: gate.hidden,
        cover: !!coverEl,
        w: coverEl ? Math.round(coverEl.getBoundingClientRect().width) : -1,
        yaw: Math.round(curYaw * 10) / 10,
        idle: idleFrames,
        cloud: cloudState,
        cloudErr: cloudErr,
        msgs: msgCache.length,
        unread: unreadCount(),
        seen: seenTs()
      };
    }
  };
})();
