/* annai.js — 予約が終わった画面で「まだ体験が入っていない方」に、入れる体験を案内する（2026-11-13 試作）
   ・名前・生年月日は、この端末の中だけで使います（外へ送りません・URLにも入れません）
   ・空き状況は受付係の status（F.fetchStatus の結果）をそのまま使います。取れなかったときは体験をすすめず、一覧へのボタンだけ
   ・ケアブース（足もみ・整体・コンディショニング・ストレッチ・キッズ）はすすめません（お一人1つ・残りが少ない・個別のため）
   ・ブラウザでは window.FestaAnnai、Node（テスト）では module.exports */
(function (global) {
  "use strict";

  /* ---------- すすめる体験と年齢の対応表（★運営の判断が要るところ・仮の表） ----------
     months＝開催日時点の月齢／grade＝開催日時点の学年（1〜6＝小学生、7〜9＝中学生、10以上＝高校生以上。0以下＝未就学）
     years＝開催日時点の満年齢／parent:true＝保護者もいっしょに入る体験（大人は、家族のだれかが入る・入れるときだけ案内）
     上から順に、1人あたり最大3つまですすめます */
  var RULES = [
    { booth: "haihai",      label: "0〜1歳（ハイハイの子）",           test: function (a) { return a.months >= 0 && a.months <= 23; } },
    { booth: "yochiyochi",  label: "0歳10か月〜2歳",                   test: function (a) { return a.months >= 10 && a.months <= 35; } },
    { booth: "kids_am",     label: "1歳〜小学生（12歳）と保護者",      test: function (a) { return a.months >= 12 && a.grade <= 6; }, parent: true },
    { booth: "kids_pm",     label: "小学生（6歳の4月以降）〜18歳と保護者", test: function (a) { return a.grade >= 1 && a.years <= 18; }, parent: true },
    { booth: "kubatore_pm", label: "小学生〜大人",                     test: function (a) { return a.grade >= 1; } },
    { booth: "adult",       label: "大人（親子でも可）",               test: function (a) { return a.grade >= 10; } }
  ];
  var MAX_PER_PERSON = 3;
  var RACES = { haihai: 1, yochiyochi: 1 };

  /* ---------- 生年月日 → 開催日時点の月齢・満年齢・学年 ---------- */
  function evDate(DATA) {
    var s = (DATA && DATA.event && DATA.event.date) || "2026-12-13";
    var m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : { y: 2026, m: 12, d: 13 };
  }
  /* reserve.html の parseBirth と同じ読み方（全角数字も可・年月日か8桁） */
  function parseBirth(str) {
    var t = String(str || "").replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\s+/g, "");
    var m = t.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?$/) || t.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y: y, m: mo, d: d };
  }
  /* 読めない・開催日より後・120歳より上 は null（年齢でしぼらない） */
  function ageInfo(birthStr, EV) {
    var b = parseBirth(birthStr);
    if (!b) return null;
    var months = (EV.y - b.y) * 12 + (EV.m - b.m);
    if (EV.d < b.d) months -= 1;
    if (months < 0 || months > 120 * 12) return null;
    /* 学年：4/2〜翌4/1生まれで同じ学年（日本の区切り）。開催日の年度で数える */
    var sy = EV.m >= 4 ? EV.y : EV.y - 1;
    var adjY = (b.m > 4 || (b.m === 4 && b.d >= 2)) ? b.y : b.y - 1;
    return { months: months, years: Math.floor(months / 12), grade: sy - adjY - 6 };
  }
  function ageText(a) { return a ? (a.months < 12 ? a.months + "か月" : a.years + "さい") : ""; }

  /* ---------- 時間の重なり ---------- */
  function mins(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function overlaps(a, b) {
    if (!a || !b || a.id === b.id) return false;
    var s1 = mins(a.start), e1 = mins(a.end), s2 = mins(b.start), e2 = mins(b.end);
    if (s1 === null || e1 === null || s2 === null || e2 === null) return false;
    return s1 < e2 && s2 < e1;
  }

  /* ---------- この端末の「同じタブで前に予約した体験」（sessionStorage・タブを閉じると消える） ---------- */
  var BOOKED_KEY = "kitanaka_festa_booked";
  function personKey(p) {
    return String(p.name || "").replace(/[\s　]+/g, "") + "|" + String(p.birth || "").replace(/[^\d０-９]/g, "");
  }

  /* ---------- 本体：だれに・どの体験をすすめるか ----------
     people   … 今回の申し込みの参加者 [{name, birth, kind, booths:[id…]}]（reserve.html の readPeople の形）
     status   … 受付係の status を id ごとにした map（F.fetchStatus の結果）。取れなかったときは null
     opts.DATA … booths.js の FESTA_DATA／opts.earlier … 前の申し込みで入った体験 { personKey: [id…] }
     返り値   … { show, statusOk, covered:{行番号: レースid}, persons:[{ idx, name, age, readable, items:[{id, name, time, remaining, unit, href}] }] } */
  function plan(people, status, opts) {
    opts = opts || {};
    var DATA = opts.DATA || global.FESTA_DATA || { booths: [] };
    var earlier = opts.earlier || {};
    var EV = evDate(DATA);
    function booth(id) { for (var i = 0; i < DATA.booths.length; i++) if (DATA.booths[i].id === id) return DATA.booths[i]; return null; }

    people = (people || []).map(function (p, i) {
      var mine = (p.booths || []).slice();
      var before = earlier[personKey(p)] || [];
      return { idx: i, name: String(p.name || ""), birth: p.birth, kind: p.kind, booths: mine, all: mine.concat(before), age: ageInfo(p.birth, EV) };
    });

    /* レース（1組で1枠）は、代表の大人だけにチェックが入ったまま送られることがある（初期値がそうなっているため）。
       そのときは、レースの年齢に合う子のうち先頭の1人が出る子とみなし、「体験が入っていない方」に数えない */
    var coveredByRace = {};
    Object.keys(RACES).forEach(function (rid) {
      var inApp = people.some(function (p) { return p.booths.indexOf(rid) >= 0; });
      if (!inApp) return;
      var childIn = people.some(function (p) { return p.booths.indexOf(rid) >= 0 && !(p.age && p.age.grade >= 10) && p.kind === "子ども"; });
      if (childIn) return;
      var rule = null; RULES.forEach(function (r) { if (r.booth === rid) rule = r; });
      for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (!p.all.length && p.age && rule && rule.test(p.age) && !coveredByRace[p.idx]) { coveredByRace[p.idx] = rid; break; }
      }
    });

    var none = people.filter(function (p) { return !p.all.length && !coveredByRace[p.idx]; });
    if (!none.length) return { show: false, statusOk: !!status, persons: [], covered: coveredByRace };

    /* 家族はいっしょに動くので、この申し込み（と前の申し込み）で家族のだれかが入っている時間と重なる体験はすすめない */
    var familyBooked = [];
    people.forEach(function (p) { p.all.forEach(function (id) { var b = booth(id); if (b && familyBooked.indexOf(b) < 0) familyBooked.push(b); }); });

    function available(id) {
      if (!status) return false;
      var st = status[id];
      return !!st && st.open !== false && typeof st.remaining === "number" && st.remaining > 0;
    }
    function itemOf(id) {
      var b = booth(id); if (!b) return null;
      var g = b.group ? booth(b.group) : null;
      var nm = g ? String(b.name || "").split("（")[0] : b.name;
      return {
        id: id, name: nm, time: b.time || "",
        remaining: status && status[id] ? status[id].remaining : null,
        unit: b.unit || "名",
        href: "reserve.html?booth=" + encodeURIComponent(g ? g.id : id) + (g ? "&slot=" + encodeURIComponent(id) : "")
      };
    }
    function okFor(rule, p) {
      var b = booth(rule.booth);
      if (!b || !b.reserve) return false;
      if (!available(rule.booth)) return false;
      for (var i = 0; i < familyBooked.length; i++) if (overlaps(familyBooked[i], b)) return false;
      return true;
    }

    var persons = none.map(function (p) {
      var out = { idx: p.idx, name: p.name, age: ageText(p.age), readable: !!p.age, items: [] };
      if (!p.age || !status) return out;
      var isAdult = p.age.grade >= 10;
      var first = [], later = [];
      RULES.forEach(function (r) {
        if (!okFor(r, p)) return;
        if (r.test(p.age) && !(r.parent && isAdult)) { first.push(r); return; }
        /* 保護者として：大人で、家族のだれか（この人以外）がその体験に入っている・年齢で入れる */
        if (r.parent && isAdult) {
          var fam = people.some(function (q) { return q.idx !== p.idx && (q.all.indexOf(r.booth) >= 0 || (q.age && q.age.grade < 10 && r.test(q.age))); });
          if (fam) later.push(r);
        }
      });
      first.concat(later).slice(0, MAX_PER_PERSON).forEach(function (r) { var it = itemOf(r.booth); if (it) out.items.push(it); });
      return out;
    });
    return { show: true, statusOk: !!status, persons: persons, covered: coveredByRace };
  }

  var api = { RULES: RULES, plan: plan, ageInfo: ageInfo, ageText: ageText, parseBirth: parseBirth, personKey: personKey, BOOKED_KEY: BOOKED_KEY, evDate: evDate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.FestaAnnai = api;
})(typeof window !== "undefined" ? window : this);
