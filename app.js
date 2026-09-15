/* app.js — 3ページ共通の小さな道具箱
   ・booths.js（window.FESTA_DATA）と config.js（window.FESTA_CONFIG）を先に読み込んでおくこと
   ・外部ライブラリは使いません（QR読み取りの jsQR だけ checkin.html で読み込みます） */
(function (global) {
  "use strict";

  var CFG = global.FESTA_CONFIG || {};
  var DATA = global.FESTA_DATA || { event: {}, booths: [], exhibitors: {} };

  /* ---------------- 小道具 ---------------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(global.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  function isDemo() { return !CFG.gasUrl; }

  function booth(id) {
    for (var i = 0; i < DATA.booths.length; i++) {
      if (DATA.booths[i].id === id) return DATA.booths[i];
    }
    return null;
  }

  function exhibitor(key) { return (DATA.exhibitors || {})[key] || null; }

  function reservableBooths() {
    return DATA.booths.filter(function (b) { return b.reserve === true; });
  }

  /* レース系＝子どもの月齢・年齢をきく対象 */
  function isRace(b) { return !!b && (b.id === "haihai" || b.id === "yochiyochi"); }

  /* 「仮」のブースの注記 */
  function provisionalNote(b) {
    return b && b.status === "仮" ? "時間・枠は調整中です" : "";
  }

  /* 時間の表示（time のなかにすでに所要時間が入っていれば重ねて出さない） */
  function timeText(b) {
    if (!b) return "";
    var t = b.time || "", d = b.duration || "";
    if (!d || t.indexOf(d) >= 0) return t;
    return t + "（" + d + "）";
  }

  /* 地図リンク（テキストURLで作る） */
  function mapQuery() {
    var v = (DATA.event && DATA.event.venue) || "北中城村中央公民館";
    return v.split(/[ 　]/)[0];  /* 「北中城村中央公民館 ホール」→「北中城村中央公民館」 */
  }
  function mapUrl() {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapQuery());
  }
  /* 画面に文字で見せるとき用（読める形のまま。貼り付けても開けます） */
  function mapUrlText() {
    return "https://www.google.com/maps/search/?api=1&query=" + mapQuery();
  }

  /* ---------------- 受付係（GAS）とのやりとり ---------------- */

  /* 残り枠を取る： GET ?action=status */
  function fetchStatus() {
    if (isDemo()) return Promise.reject(new Error("demo"));
    var url = CFG.gasUrl + (CFG.gasUrl.indexOf("?") >= 0 ? "&" : "?") + "action=status";
    return fetch(url, { method: "GET", redirect: "follow" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.ok !== true || !j.booths) throw new Error("bad");
        var map = {};
        j.booths.forEach(function (b) { map[b.id] = b; });
        return map;
      });
  }

  /* POST は必ず text/plain（CORSのプリフライトを避けるため） */
  function postGas(payload) {
    return fetch(CFG.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      redirect: "follow",
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  /* GET（照会など） */
  function getGas(params) {
    var parts = [];
    for (var k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k)) {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
      }
    }
    var url = CFG.gasUrl + (CFG.gasUrl.indexOf("?") >= 0 ? "&" : "?") + parts.join("&");
    return fetch(url, { method: "GET", redirect: "follow" }).then(function (r) { return r.json(); });
  }

  /* ---------------- エラーメッセージ（やさしい日本語に） ---------------- */

  function friendlyError(code, extra) {
    switch (code) {
      case "full":
        var names = (extra || []).map(function (id) {
          var b = booth(id);
          return b ? b.name : id;
        });
        return names.length
          ? "申し訳ありません。「" + names.join("」「") + "」は、ちょうど満席になりました。ほかのブースをお選びいただくか、当日の空き枠をお試しください。"
          : "申し訳ありません。ちょうど満席になりました。当日の空き枠をお試しください。";
      case "key":
        return "うまく送信できませんでした。お手数ですが、ページを開き直してもう一度お試しください。";
      case "pin":
        return "番号がちがうようです。もう一度入れてください。";
      case "notfound":
        return "その予約番号は見つかりませんでした。番号をお確かめください。";
      case "network":
        return "通信がうまくいきませんでした。電波のよいところで、もう一度お試しください。何度も失敗するときは、お電話（" +
          (DATA.event.contact || "") + "）でご予約もうけたまわります。";
      default:
        return "うまく送信できませんでした。お手数ですが、もう一度お試しください。何度も失敗するときは、お電話（" +
          (DATA.event.contact || "") + "）でご予約もうけたまわります。";
    }
  }

  /* ---------------- 直近の予約番号（localStorage） ---------------- */
  /* 保存するのは予約番号だけ。名前や電話はサイトに残しません。 */
  var LAST_KEY = "kitanaka_festa_last_no";

  function saveLastNo(no) {
    try { global.localStorage.setItem(LAST_KEY, no); } catch (e) { /* 使えない環境は何もしない */ }
  }
  function loadLastNo() {
    try { return global.localStorage.getItem(LAST_KEY) || ""; } catch (e) { return ""; }
  }

  /* ---------------- デモ用のダミー番号 ---------------- */
  function demoNo() { return "KF-0000"; }

  /* ---------------- 「テスト表示中」の帯 ---------------- */
  function showDemoBar(text) {
    if (!isDemo()) return;
    var bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.textContent = text || "テスト表示中です（まだ本当の予約はできません）";
    document.body.insertBefore(bar, document.body.firstChild);
  }

  global.Festa = {
    CFG: CFG, DATA: DATA,
    esc: esc, $: $, $$: $$, qs: qs,
    isDemo: isDemo, demoNo: demoNo, showDemoBar: showDemoBar,
    booth: booth, exhibitor: exhibitor, reservableBooths: reservableBooths,
    isRace: isRace, provisionalNote: provisionalNote,
    timeText: timeText, mapUrl: mapUrl, mapUrlText: mapUrlText,
    fetchStatus: fetchStatus, postGas: postGas, getGas: getGas,
    friendlyError: friendlyError,
    saveLastNo: saveLastNo, loadLastNo: loadLastNo
  };
})(window);

/* ---------- スマホ：固定メニューの縮小と「▲ トップへ」（2026-09-16） ---------- */
(function () {
  var head = document.querySelector(".site-head");
  if (!head) return;
  var top = document.createElement("a");
  top.className = "to-top";
  top.href = "#top";
  top.setAttribute("aria-label", "ページの上へ戻る");
  top.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>トップへ';
  top.addEventListener("click", function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.body.appendChild(top);
  var ticking = false;
  function update() {
    ticking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    head.classList.toggle("is-compact", y > 120);
    top.classList.toggle("is-on", y > 600);
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
