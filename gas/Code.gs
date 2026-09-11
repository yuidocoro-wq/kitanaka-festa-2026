/**
 * 北中城村ウェルネススポーツフェスタ2026 予約受付（GAS ウェブアプリ）
 * ------------------------------------------------------------
 * このファイル1本で、予約の受付・台帳への記録・サンキューメール・
 * 当日のチェックイン（来場登録）まで動きます。
 *
 * 使い方は README_設置手順.md をごらんください。
 * 最初に一度だけ setup() を実行してください（タブと初期設定を作ります）。
 *
 * 作成: ゆいどころ AI秘書「みお」 / 2026-09-11
 */

var VERSION = '1.0.0';

/* =========================================================
 * 1. 設定
 * =======================================================*/

var SH_RESERVE = '予約一覧';
var SH_DETAIL = '予約明細';
var SH_BOOTH = 'ブース設定';
var SH_SUM = '集計';
var SH_LOG = '来場ログ';
var SH_PEOPLE = '参加者';                      // 保険登録用：申込に含まれる人 全員（1人1行）
var SH_VISIT = '来場者名簿';                   // 当日、入口の手書きを写す名簿（予約なしの人・体験しない人も）

var TZ = 'Asia/Tokyo';

/** イベント情報（booths.json の event と同じ内容） */
var EVENT = {
  siteUrl: 'https://yuidocoro-wq.github.io/kitanaka-festa-2026/',
  name: '北中城村ウェルネススポーツフェスタ2026',
  dateLabel: '2026年12月13日（日）',
  time: '10:00〜15:00',
  venue: '北中城村中央公民館 ホール',
  address: '沖縄県中頭郡北中城村字仲順435',
  parking: '無料駐車場139台',
  organizer: '主催 北中城村役場／企画運営 ゆいどころ',
  fee: '入場・体験 無料',
  contact: 'ゆいどころ（比嘉）080-6484-5121'
};

/**
 * ブースの初期値（booths.json の reserve:true のブース）。
 * setup() で「ブース設定」タブに入ります。
 * ★枠数を変えたいときは、このコードではなく「ブース設定」タブを直してください（即反映されます）。
 */
var BOOTH_SEED = [
  ['haihai', 'ハイハイレース（午前の部）', '10:50〜11:20', 12, true, '9/12 なつきさん指示：午前の部12人・月齢の制限なし（単位:組）'],
  ['yochiyochi', 'よちよちレース（午後の部）', '13:35〜14:05', 12, true, '9/12：午後の部12人・走らないで歩ける子ならOK（単位:組）'],
  ['kids_am', '運動あそび 午前の部（れなさん・子ども親子）', '午前（時間は調整中）', 15, true, '9/12：15人'],
  ['kids_pm', '運動あそび 午後の部（れなさん・小学校高学年・中学生）', '午後（時間は調整中）', 15, true, '9/12：15人'],
  ['ashimomi_10', '足もみ体験 10:00の枠', '10:00〜10:10', 1, true, '9/12：5枠×1人（当日枠は別）'],
  ['ashimomi_11', '足もみ体験 11:00の枠', '11:00〜11:10', 1, true, '9/12：5枠×1人'],
  ['ashimomi_12', '足もみ体験 12:00の枠', '12:00〜12:10', 1, true, '9/12：5枠×1人'],
  ['ashimomi_13', '足もみ体験 13:00の枠', '13:00〜13:10', 1, true, '9/12：5枠×1人'],
  ['ashimomi_14', '足もみ体験 14:00の枠', '14:00〜14:10', 1, true, '9/12：5枠×1人'],
  ['adult', '大人エクササイズ（クバトレ）', '前半・後半 各1コマ（30分・案）', 15, true, '要確認：人数はこれから決める（仮に15）'],
  ['seitai_yuimaru', '整体体験（ゆいまーる）', '10:00〜15:00の中で15分（案）', 6, true, '要確認（企画書待ち・仮の数）'],
  ['conditioning', 'コンディショニング体験（クバトレ）', '10:00〜15:00の中で15分（案）', 6, true, '要確認（企画書待ち・仮の数）'],
  ['seitai_motobu', '整体体験（もとぶ糀工房）', '10:00〜15:00の中で15分（案）', 6, true, '要確認（企画書待ち・仮の数）']
];

/** 列の番号（1はじまり） */
var R_NO = 1, R_TS = 2, R_NAME = 3, R_KANA = 4, R_PHONE = 5, R_MAIL = 6,
    R_ADULTS = 7, R_CHILDREN = 8, R_MONTHS = 9, R_BOOTHS = 10, R_NOTE = 11,
    R_STATUS = 12, R_CHECKIN = 13, R_TOKEN = 14, R_TYPE = 15, R_BIRTH = 16, R_ADDR = 17;
var R_COLS = 17;

var D_NO = 1, D_BID = 2, D_BNAME = 3, D_TIME = 4, D_STATUS = 5;
var D_COLS = 7;
var D_PEOPLE = 6;
var D_WHO = 7;                          // 受ける人（名前・複数は「・」区切り）                       // 人数（この明細が何人分か。組で数えるレースは1）
var ST_DONE = '参加済み';               // ブース担当が体験を終えた印
var GROUP_UNIT_IDS = ['haihai', 'yochiyochi'];   // 「組」で数えるブース（1予約=1組）

var B_ID = 1, B_NAME = 2, B_TIME = 3, B_CAP = 4, B_OPEN = 5, B_NOTE = 6;

var ST_RESERVED = '予約';
var ST_CAME = '来場';
var ST_CANCEL = 'キャンセル';

/* =========================================================
 * 2. 初期設定（最初に1回だけ実行）
 * =======================================================*/

function setup() {
  var ss = getSS_();
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty('SITE_KEY')) props.setProperty('SITE_KEY', 'kitanaka2026');
  if (!props.getProperty('CHECKIN_PIN')) props.setProperty('CHECKIN_PIN', '1234');
  props.setProperty('SHEET_ID', ss.getId());

  var shR = ensureSheet_(ss, SH_RESERVE, ['予約番号', '登録日時', 'お名前', 'ふりがな', '電話', 'メール',
    '大人', '子ども', '子どもの月齢', '予約ブース', 'ひとこと', '状態', '来場時刻', 'キャンセルトークン', '種別', '生年月日', '住所']);
  // 電話番号の先頭の0が消えないように、電話の列を「書式なしテキスト」にする
  shR.getRange(2, R_PHONE, Math.max(1, shR.getMaxRows() - 1), 1).setNumberFormat('@');
  shR.setColumnWidth(R_NAME, 140);
  shR.setColumnWidth(R_MAIL, 220);
  shR.setColumnWidth(R_BOOTHS, 260);
  ensureSheet_(ss, SH_DETAIL, ['予約番号', 'ブースID', 'ブース名', '時間', '状態', '人数', '受ける人']);
  var booth = ensureSheet_(ss, SH_BOOTH, ['ブースID', 'ブース名', '時間', '予約枠', '受付中', '備考']);
  ensureSheet_(ss, SH_LOG, ['日時', '予約番号', '操作', 'メモ']);
  ensureSheet_(ss, SH_PEOPLE, ['予約番号', '名前', '生年月日', '区分', '体験を受ける', '状態', '照合キー（名前|生年月日）', '受ける体験']);
  ensureSheet_(ss, SH_VISIT, ['名前', '生年月日', '住所', '電話', '区分', '体験したブース', '予約番号（あれば）', 'メモ']);

  // ブース設定が空のときだけ初期値を入れる（すでにある場合は触らない）
  if (booth.getLastRow() < 2) {
    booth.getRange(2, 1, BOOTH_SEED.length, 6).setValues(BOOTH_SEED);
  }
  booth.setColumnWidth(1, 140);
  booth.setColumnWidth(2, 240);
  booth.setColumnWidth(3, 220);
  booth.setColumnWidth(6, 300);

  buildSummary_(ss);
  buildBoothView_(ss);

  // 空の初期シートが残っていたら片づける
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if ((n === 'シート1' || n === 'Sheet1') && sheets[i].getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheets[i]);
    }
  }
  ss.setActiveSheet(ss.getSheetByName(SH_RESERVE));
  SpreadsheetApp.flush();
  return '初期設定が終わりました。タブを確認してください。';
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('フェスタ受付')
      .addItem('初期設定をする（setup）', 'setup')
      .addItem('集計の数式を作りなおす', 'rebuildSummary')
      .addItem('自分にテストメールを送る', 'sendTestMail')
      .addToUi();
  } catch (err) { /* UIがない実行では無視 */ }
}

var SH_BYBOOTH = 'ブース別一覧';

/** ブース担当が見る表：ブースごとに「誰が・何時に・何人」 */
function buildBoothView_(ss) {
  var sh = ss.getSheetByName(SH_BYBOOTH);
  if (!sh) sh = ss.insertSheet(SH_BYBOOTH);
  sh.clear();
  var booths = readBooths_(ss);
  var row = 1;
  sh.getRange(row, 1).setValue('ブースごとの予約（自動で更新。キャンセルは出ません）').setFontWeight('bold').setFontSize(13);
  row += 2;
  var headers = ['予約番号', '時間', 'お名前（代表）', '人数', '状態', '電話', '受ける人'];
  for (var i = 0; i < booths.length; i++) {
    var b = booths[i];
    sh.getRange(row, 1).setValue('■ ' + b.name + '　' + b.time + '　（予約枠 ' + b.capacity + '）').setFontWeight('bold').setBackground('#EAF3EF');
    sh.getRange(row, 1, 1, headers.length).setBackground('#EAF3EF');
    row++;
    sh.getRange(row, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#468977').setFontColor('#FFFFFF');
    row++;
    var D = "'" + SH_DETAIL + "'", R = "'" + SH_RESERVE + "'", P = "'" + SH_PEOPLE + "'";
    var f = "=IFERROR(SORT(FILTER({" +
      D + "!A2:A," + D + "!D2:D," +
      "ARRAYFORMULA(IFERROR(VLOOKUP(" + D + "!A2:A," + R + "!A:C,3,FALSE),\"\"))," +
      D + "!F2:F," + D + "!E2:E," +
      "ARRAYFORMULA(IFERROR(VLOOKUP(" + D + "!A2:A," + R + "!A:E,5,FALSE),\"\"))," +
      D + "!G2:G" +
      "}," + D + "!B2:B=\"" + b.id + "\"," + D + "!E2:E<>\"" + ST_CANCEL + "\"),2,TRUE),\"（まだ予約はありません）\")";
    sh.getRange(row, 1).setFormula(f);
    row += Math.max(Number(b.capacity) || 0, 5) + 3;
  }
  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 130); sh.setColumnWidth(3, 160); sh.setColumnWidth(4, 50);
  sh.setColumnWidth(5, 70); sh.setColumnWidth(6, 120); sh.setColumnWidth(7, 220);
  sh.setFrozenRows(1);
  var shP = ss.getSheetByName(SH_PEOPLE);
  if (shP) { shP.getRange('H1').setValue('受ける体験'); shP.getRange('I1:J2').clearContent(); }
  var shD0 = ss.getSheetByName(SH_DETAIL);
  if (shD0) shD0.getRange('G1').setValue('受ける人').setFontWeight('bold');
}

function rebuildSummary() {
  var ssx = getSS_(); var shPx = ssx.getSheetByName(SH_PEOPLE); if (shPx) shPx.getRange('H1').setValue('受ける体験');
  buildSummary_(getSS_());
  buildBoothView_(getSS_());
  return '集計とブース別一覧を作りなおしました。';
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var empty = true;
  for (var i = 0; i < cur.length; i++) if (String(cur[i]) !== '') empty = false;
  if (empty) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#F2B705');
    sh.setFrozenRows(1);
  }
  return sh;
}

function buildSummary_(ss) {
  var sh = ss.getSheetByName(SH_SUM);
  if (!sh) sh = ss.insertSheet(SH_SUM);
  sh.clear();
  sh.getRange(1, 1, 1, 7).setValues([['ブースID', 'ブース名', '予約枠', '予約済み（人数）', '残り', '来場した人数', '参加済み（人数）']])
    .setFontWeight('bold').setBackground('#F2B705');
  sh.setFrozenRows(1);
  var rows = [];
  for (var r = 2; r <= 31; r++) {   // ブース設定の2〜31行目を見る（30ブースまで）
    rows.push([
      "=IF('" + SH_BOOTH + "'!A" + r + "=\"\",\"\",'" + SH_BOOTH + "'!A" + r + ")",
      "=IF('" + SH_BOOTH + "'!A" + r + "=\"\",\"\",'" + SH_BOOTH + "'!B" + r + ")",
      "=IF('" + SH_BOOTH + "'!A" + r + "=\"\",\"\",'" + SH_BOOTH + "'!D" + r + ")",
      "=IF('" + SH_BOOTH + "'!A" + r + "=\"\",\"\",SUMIFS('" + SH_DETAIL + "'!F:F,'" + SH_DETAIL + "'!B:B,'" + SH_BOOTH + "'!A" + r + ",'" + SH_DETAIL + "'!E:E,\"<>" + ST_CANCEL + "\"))",
      "=IF('" + SH_BOOTH + "'!A" + r + "=\"\",\"\",C" + r + "-D" + r + ")",
      "=IF('" + SH_BOOTH + "'!A" + r + "=\"\",\"\",SUMIFS('" + SH_DETAIL + "'!F:F,'" + SH_DETAIL + "'!B:B,'" + SH_BOOTH + "'!A" + r + ",'" + SH_DETAIL + "'!E:E,\"" + ST_CAME + "\")+SUMIFS('" + SH_DETAIL + "'!F:F,'" + SH_DETAIL + "'!B:B,'" + SH_BOOTH + "'!A" + r + ",'" + SH_DETAIL + "'!E:E,\"" + ST_DONE + "\"))",
      "=IF('" + SH_BOOTH + "'!A" + r + "=\"\",\"\",SUMIFS('" + SH_DETAIL + "'!F:F,'" + SH_DETAIL + "'!B:B,'" + SH_BOOTH + "'!A" + r + ",'" + SH_DETAIL + "'!E:E,\"" + ST_DONE + "\"))"
    ]);
  }
  sh.getRange(2, 1, rows.length, 7).setFormulas(rows);

  var top = rows.length + 3;
  sh.getRange(top, 1).setValue('当日のまとめ').setFontWeight('bold');
  sh.getRange(top + 1, 1, 11, 2).setValues([
    ['申込の人数合計（延べ。同じ人が2回申し込むと2）', "=SUMIFS('" + SH_RESERVE + "'!G:G,'" + SH_RESERVE + "'!L:L,\"<>" + ST_CANCEL + "\")+SUMIFS('" + SH_RESERVE + "'!H:H,'" + SH_RESERVE + "'!L:L,\"<>" + ST_CANCEL + "\")"],
    ['　うち子ども', "=SUMIFS('" + SH_RESERVE + "'!H:H,'" + SH_RESERVE + "'!L:L,\"<>" + ST_CANCEL + "\")"],
    ['来場者合計（大人＋子ども）', "=SUMIFS('" + SH_RESERVE + "'!G:G,'" + SH_RESERVE + "'!L:L,\"" + ST_CAME + "\")+SUMIFS('" + SH_RESERVE + "'!H:H,'" + SH_RESERVE + "'!L:L,\"" + ST_CAME + "\")"],
    ['　うち子ども', "=SUMIFS('" + SH_RESERVE + "'!H:H,'" + SH_RESERVE + "'!L:L,\"" + ST_CAME + "\")"],
    ['来場した組数', "=COUNTIF('" + SH_RESERVE + "'!L:L,\"" + ST_CAME + "\")"],
    ['予約したまま未来場', "=COUNTIF('" + SH_RESERVE + "'!L:L,\"" + ST_RESERVED + "\")"],
    ['キャンセル', "=COUNTIF('" + SH_RESERVE + "'!L:L,\"" + ST_CANCEL + "\")"],
    ['体験を予約した人（同じ人は1・目標50）', "=IFERROR(COUNTUNIQUEIFS('" + SH_PEOPLE + "'!G:G,'" + SH_PEOPLE + "'!E:E,TRUE,'" + SH_PEOPLE + "'!F:F,\"<>" + ST_CANCEL + "\"),0)"],
    ['★予約に入っている人（同じ人は1・名前と生年月日で判定）', "=IFERROR(COUNTUNIQUEIFS('" + SH_PEOPLE + "'!G:G,'" + SH_PEOPLE + "'!F:F,\"<>" + ST_CANCEL + "\"),0)"],
    ['当日名簿の人数（入口の手書きを写した分）', "=COUNTA('" + SH_VISIT + "'!A2:A)"],
    ['★入口の来場者数（いま・同じ人は1）', "=IFERROR(COUNTUNIQUEIFS('" + SH_PEOPLE + "'!G:G,'" + SH_PEOPLE + "'!F:F,\"" + ST_CAME + "\"),0)"]
  ]);
  sh.getRange(top + 1, 1, 11, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 260);
}

/* =========================================================
 * 3. 入口（doGet / doPost）
 * =======================================================*/

function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var action = String(p.action || '');
    if (action === 'status') return jsonOut_(apiStatus_());
    if (action === 'lookup') return jsonOut_(apiLookup_(p));
    if (action === 'cancel') return htmlOut_(apiCancelPage_(p));
    if (action === 'ping') return jsonOut_({ ok: true, app: 'kitanaka-festa-2026', version: VERSION });
    return jsonOut_({ ok: false, error: 'action', message: 'action が指定されていません' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'server', message: String(err) });
  }
}

function doPost(e) {
  var data = {};
  try {
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }
  } catch (err) {
    data = (e && e.parameter) ? e.parameter : {};
  }
  try {
    var action = String(data.action || '');
    if (action === 'reserve') return jsonOut_(apiReserve_(data));
    if (action === 'checkin') return jsonOut_(apiCheckin_(data));
    if (action === 'participate') return jsonOut_(apiParticipate_(data));
    if (action === 'walkin') return jsonOut_(apiWalkin_(data));
    return jsonOut_({ ok: false, error: 'action', message: 'action が指定されていません' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'server', message: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlOut_(html) {
  return ContentService.createTextOutput(html)
    .setMimeType(ContentService.MimeType.HTML);
}

/* =========================================================
 * 4. API 本体
 * =======================================================*/

/** 空き状況 */
function apiStatus_() {
  var ss = getSS_();
  var booths = readBooths_(ss);
  var counts = countReserved_(ss);
  var list = [];
  for (var i = 0; i < booths.length; i++) {
    var b = booths[i];
    var used = counts[b.id] || 0;
    var remaining = b.open ? Math.max(0, b.capacity - used) : 0;
    list.push({ id: b.id, capacity: b.capacity, reserved: used, remaining: remaining, open: b.open });
  }
  return { ok: true, booths: list };
}

/** 予約番号で引く（当日チェックイン画面用・PIN必須） */
function apiLookup_(p) {
  if (String(p.pin || '') !== getPin_()) return { ok: false, error: 'pin' };
  var no = normalizeNo_(p.no);
  if (!no) return { ok: false, error: 'notfound' };
  var ss = getSS_();
  var found = findReservation_(ss, no);
  if (!found) return { ok: false, error: 'notfound' };
  var row = found.values;
  return {
    ok: true,
    no: no,
    name: String(row[R_NAME - 1] || ''),
    kana: String(row[R_KANA - 1] || ''),
    phone: stripQuote_(row[R_PHONE - 1]),
    adults: Number(row[R_ADULTS - 1] || 0),
    children: Number(row[R_CHILDREN - 1] || 0),
    months: String(row[R_MONTHS - 1] || ''),
    note: String(row[R_NOTE - 1] || ''),
    status: String(row[R_STATUS - 1] || ''),
    booths: readDetail_(ss, no),
    checkedIn: String(row[R_STATUS - 1] || '') === ST_CAME,
    checkedInAt: String(row[R_CHECKIN - 1] || ''),
    canceled: String(row[R_STATUS - 1] || '') === ST_CANCEL
  };
}

/** メール内リンクからのキャンセル（HTMLを返す） */
function apiCancelPage_(p) {
  var no = normalizeNo_(p.no);
  var token = String(p.token || '');
  var lock = LockService.getScriptLock();
  var msg, ok = false;
  try {
    lock.waitLock(20000);
    var ss = getSS_();
    var found = no ? findReservation_(ss, no) : null;
    if (!found) {
      msg = 'この予約番号は見つかりませんでした。お手数ですが受付までお電話ください。';
    } else if (String(found.values[R_TOKEN - 1] || '') !== token || !token) {
      msg = 'リンクが正しくないようです。お手数ですが受付までお電話ください。';
    } else if (String(found.values[R_STATUS - 1]) === ST_CANCEL) {
      ok = true;
      msg = 'この予約はすでにキャンセル済みです。';
    } else if (String(p.confirm || '') !== '1') {
      /* まず確認ページ。ここでは何も変えない */
      return confirmCancelHtml_(no, String(found.values[R_NAME - 1] || ''), readDetail_(ss, no), token);
    } else {
      setStatus_(ss, found.row, no, ST_CANCEL);
      addLog_(ss, no, 'cancel', 'メールのリンクから');
      ok = true;
      msg = 'キャンセルを受け付けました。またのご参加をお待ちしています。';
    }
  } catch (err) {
    msg = 'ただいま混み合っています。少し時間をおいてもう一度お試しください。';
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
  return cancelHtml_(ok, no, msg);
}

/** 予約を受け付ける */
function apiReserve_(d) {
  if (String(d.key || '') !== getSiteKey_()) return { ok: false, error: 'key', message: '合言葉が違います' };

  var name = trim_(d.name, 100);
  var kana = trim_(d.kana, 100);
  var phone = trim_(d.phone, 40);
  var email = trim_(d.email, 200);
  var note = trim_(d.note || d.message, 500);
  var months = trim_(d.months || d.childMonths, 100);

  if (!name) return { ok: false, error: 'invalid', field: 'name', message: 'お名前を入れてください' };
  if (!phone) return { ok: false, error: 'invalid', field: 'phone', message: '電話番号を入れてください' };
  if (!email) return { ok: false, error: 'invalid', field: 'email', message: 'メールアドレスを入れてください' };
  if (!isEmail_(email)) return { ok: false, error: 'invalid', field: 'email', message: 'メールアドレスの形を確認してください' };

  var adults = toCount_(d.adults);
  var children = toCount_(d.children);
  if (adults === null) return { ok: false, error: 'invalid', field: 'adults', message: '大人の人数は0〜10で入れてください' };
  if (children === null) return { ok: false, error: 'invalid', field: 'children', message: '子どもの人数は0〜10で入れてください' };
  if (adults + children < 1) return { ok: false, error: 'invalid', field: 'adults', message: '人数を1人以上にしてください' };

  var ids = toIdList_(d.booths);
  if (ids.length === 0) return { ok: false, error: 'booths', message: '予約したいブースを選んでください' };
  var count = toCount_(d.count);                 // この体験を受ける人数（省略時1）
  if (count === null || count < 1) count = 1;

  /* 参加する人 全員（保険登録用）。届いていなければ代表者1人だけ */
  var people = [];
  if (d.people && d.people.length) {
    for (var pi = 0; pi < Math.min(d.people.length, 12); pi++) {
      var pp = d.people[pi] || {};
      var pn = trim_(pp.name, 100);
      if (!pn) continue;
      var pb = (pp.booths && pp.booths.length) ? pp.booths.map(function (x) { return String(x); }) : [];
      people.push({ name: pn, birth: trim_(pp.birth, 40), kind: (String(pp.kind) === '子ども' ? '子ども' : '大人'),
                    join: pb.length ? true : !(pp.join === false || String(pp.join) === 'false'), booths: pb });
    }
  }
  if (people.length === 0) people.push({ name: name, birth: trim_(d.birth, 40), kind: '大人', join: true });
  var joinN = 0; adults = 0; children = 0;
  for (pi = 0; pi < people.length; pi++) { if (people[pi].kind === '子ども') children++; else adults++; if (people[pi].join) joinN++; }
  if (joinN >= 1) count = joinN;
  var wantN = (d.counts && typeof d.counts === 'object') ? d.counts : {};   // ブースごとに受ける人数

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return { ok: false, error: 'busy', message: 'ただいま混み合っています。少し待ってもう一度お願いします' };
  }
  try {
    var ss = getSS_();
    var booths = readBooths_(ss);
    var map = {};
    for (var i = 0; i < booths.length; i++) map[booths[i].id] = booths[i];

    var counts = countReserved_(ss);
    var full = [], picked = [];
    for (i = 0; i < ids.length; i++) {
      var b = map[ids[i]];
      if (!b || !b.open) { full.push(ids[i]); continue; }
      var used = counts[b.id] || 0;
      var need = (GROUP_UNIT_IDS.indexOf(b.id) >= 0) ? 1 : (Number(wantN[b.id]) || count);
      if (used + need > b.capacity) { full.push(b.id); continue; }
      b.need = need;
      picked.push(b);
    }
    if (full.length > 0) return { ok: false, error: 'full', full: full, message: '満席のブースがありました' };

    var no = nextNo_(ss);
    var token = Utilities.getUuid();
    var now = nowStr_();
    var names = [];
    for (i = 0; i < picked.length; i++) names.push(picked[i].name);

    var shR = ss.getSheetByName(SH_RESERVE);
    var row = [];
    for (i = 0; i < R_COLS; i++) row.push('');
    row[R_NO - 1] = no;
    row[R_TS - 1] = now;
    row[R_NAME - 1] = name;
    row[R_KANA - 1] = kana;
    row[R_PHONE - 1] = phone;
    row[R_MAIL - 1] = email;
    row[R_ADULTS - 1] = adults;
    row[R_CHILDREN - 1] = children;
    row[R_MONTHS - 1] = months;
    row[R_BOOTHS - 1] = names.join('、');
    row[R_NOTE - 1] = note;
    row[R_BIRTH - 1] = trim_(d.birth, 40);      // 保険登録用（9/12 なつきさん）
    row[R_ADDR - 1] = trim_(d.address, 200);
    row[R_STATUS - 1] = ST_RESERVED;
    row[R_CHECKIN - 1] = '';
    row[R_TOKEN - 1] = token;
    row[R_TYPE - 1] = 'web';
    shR.appendRow(row);

    var shD = ss.getSheetByName(SH_DETAIL);
    var dRows = [];
    for (i = 0; i < picked.length; i++) {
      var whoNames = [];
      for (var wi = 0; wi < people.length; wi++) { if ((people[wi].booths || []).indexOf(picked[i].id) >= 0) whoNames.push(people[wi].name); }
      if (!whoNames.length) whoNames.push(name);
      dRows.push([no, picked[i].id, picked[i].name, picked[i].time, ST_RESERVED, picked[i].need || 1, whoNames.join('・')]);
    }
    shD.getRange(shD.getLastRow() + 1, 1, dRows.length, D_COLS).setValues(dRows);
    var shP = ss.getSheetByName(SH_PEOPLE);
    if (shP) {
      var pRows = [];
      for (i = 0; i < people.length; i++) {
        var bn = (people[i].booths || []).map(function (id) { return map[id] ? map[id].name : id; }).join('、');
        pRows.push([no, people[i].name, people[i].birth, people[i].kind, people[i].join, ST_RESERVED, people[i].name + '|' + people[i].birth, bn]);
      }
      shP.getRange(shP.getLastRow() + 1, 1, pRows.length, 8).setValues(pRows);
    }
    SpreadsheetApp.flush();

    var outBooths = [];
    for (i = 0; i < picked.length; i++) {
      outBooths.push({ id: picked[i].id, name: picked[i].name, time: picked[i].time });
    }

    var mailed = false;
    try {
      sendThanksMail_(no, name, email, outBooths, token);
      mailed = true;
    } catch (err2) {
      addLog_(ss, no, 'mail-error', String(err2));
    }
    return { ok: true, no: no, name: name, booths: outBooths, mailed: mailed };
  } finally {
    try { lock.releaseLock(); } catch (e3) { }
  }
}

/** 当日チェックイン（来場） */
function apiCheckin_(d) {
  if (String(d.pin || '') !== getPin_()) return { ok: false, error: 'pin' };
  var no = normalizeNo_(d.no);
  if (!no) return { ok: false, error: 'notfound' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, error: 'busy' }; }
  try {
    var ss = getSS_();
    var found = findReservation_(ss, no);
    if (!found) return { ok: false, error: 'notfound' };
    var status = String(found.values[R_STATUS - 1] || '');
    if (status === ST_CANCEL) return { ok: false, error: 'canceled', no: no, name: String(found.values[R_NAME - 1] || '') };

    var already = (status === ST_CAME);
    var at = String(found.values[R_CHECKIN - 1] || '');
    if (!already) {
      at = nowStr_();
      setStatus_(ss, found.row, no, ST_CAME, at);
      addLog_(ss, no, 'checkin', trim_(d.memo, 200));
      SpreadsheetApp.flush();
    }
    return {
      ok: true, no: no, already: already,
      name: String(found.values[R_NAME - 1] || ''),
      kana: String(found.values[R_KANA - 1] || ''),
      adults: Number(found.values[R_ADULTS - 1] || 0),
      children: Number(found.values[R_CHILDREN - 1] || 0),
      booths: readDetail_(ss, no),
      checkedIn: true,
      checkedInAt: at
    };
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
}

/** ブース担当が「体験おわり」を押す：予約明細の1行を参加済みにする */
function apiParticipate_(d) {
  if (String(d.pin || '') !== getPin_()) return { ok: false, error: 'pin' };
  var no = normalizeNo_(d.no);
  var bid = trim_(d.booth, 60);
  if (!no || !bid) return { ok: false, error: 'notfound' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, error: 'busy' }; }
  try {
    var ss = getSS_();
    var shD = ss.getSheetByName(SH_DETAIL);
    if (!shD || shD.getLastRow() < 2) return { ok: false, error: 'notfound' };
    var vals = shD.getRange(2, 1, shD.getLastRow() - 1, D_COLS).getValues();
    var hit = false;
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][D_NO - 1]) === no && String(vals[i][D_BID - 1]) === bid) {
        if (String(vals[i][D_STATUS - 1]) !== ST_CANCEL) { shD.getRange(i + 2, D_STATUS).setValue(ST_DONE); hit = true; }
      }
    }
    if (!hit) return { ok: false, error: 'notfound' };
    addLog_(ss, no, 'participate', bid);
    SpreadsheetApp.flush();
    return { ok: true, no: no, booth: bid, booths: readDetail_(ss, no) };
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
}

/** 予約なしの方の来場登録 */
function apiWalkin_(d) {
  if (String(d.pin || '') !== getPin_()) return { ok: false, error: 'pin' };
  var name = trim_(d.name, 100);
  if (!name) return { ok: false, error: 'invalid', field: 'name', message: 'お名前を入れてください' };
  var adults = toCount_(d.adults);
  var children = toCount_(d.children);
  if (adults === null || children === null) return { ok: false, error: 'invalid', field: 'adults', message: '人数は0〜10で入れてください' };
  if (adults + children < 1) return { ok: false, error: 'invalid', field: 'adults', message: '人数を1人以上にしてください' };
  var people = [];
  if (d.people && d.people.length) {
    for (var pi = 0; pi < Math.min(d.people.length, 12); pi++) {
      var pp = d.people[pi] || {}; var pn = trim_(pp.name, 100); if (!pn) continue;
      people.push({ name: pn, birth: trim_(pp.birth, 40), kind: (String(pp.kind) === '子ども' ? '子ども' : '大人') });
    }
  }
  if (people.length === 0) people.push({ name: name, birth: trim_(d.birth, 40), kind: '大人' });
  adults = 0; children = 0;
  for (pi = 0; pi < people.length; pi++) { if (people[pi].kind === '子ども') children++; else adults++; }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return { ok: false, error: 'busy' }; }
  try {
    var ss = getSS_();
    var ids = toIdList_(d.booths);
    var booths = readBooths_(ss), map = {}, i;
    for (i = 0; i < booths.length; i++) map[booths[i].id] = booths[i];
    var counts = countReserved_(ss);
    var picked = [], full = [];
    for (i = 0; i < ids.length; i++) {
      var b = map[ids[i]];
      if (!b || !b.open) { full.push(ids[i]); continue; }
      if ((counts[b.id] || 0) >= b.capacity) { full.push(b.id); continue; }
      picked.push(b);
    }
    if (full.length > 0) return { ok: false, error: 'full', full: full, message: '満席のブースがありました' };

    var no = nextNo_(ss);
    var now = nowStr_();
    var names = [];
    for (i = 0; i < picked.length; i++) names.push(picked[i].name);

    var shR = ss.getSheetByName(SH_RESERVE);
    var row = [];
    for (i = 0; i < R_COLS; i++) row.push('');
    row[R_NO - 1] = no;
    row[R_TS - 1] = now;
    row[R_NAME - 1] = name;
    row[R_KANA - 1] = trim_(d.kana, 100);
    row[R_PHONE - 1] = trim_(d.phone, 40);
    row[R_MAIL - 1] = trim_(d.email, 200);
    row[R_ADULTS - 1] = adults;
    row[R_CHILDREN - 1] = children;
    row[R_MONTHS - 1] = trim_(d.months || d.childMonths, 100);
    row[R_BOOTHS - 1] = names.join('、');
    row[R_NOTE - 1] = trim_(d.note || d.memo, 500);
    row[R_BIRTH - 1] = trim_(d.birth, 40);
    row[R_ADDR - 1] = trim_(d.address, 200);
    row[R_STATUS - 1] = ST_CAME;
    row[R_CHECKIN - 1] = now;
    row[R_TOKEN - 1] = '';
    row[R_TYPE - 1] = 'walkin';
    shR.appendRow(row);
    var shP = ss.getSheetByName(SH_PEOPLE);
    if (shP) {
      var pRows = [];
      for (i = 0; i < people.length; i++) pRows.push([no, people[i].name, people[i].birth, people[i].kind, true, ST_CAME, people[i].name + '|' + people[i].birth, '']);
      shP.getRange(shP.getLastRow() + 1, 1, pRows.length, 8).setValues(pRows);
    }

    if (picked.length > 0) {
      var shD = ss.getSheetByName(SH_DETAIL);
      var dRows = [];
      for (i = 0; i < picked.length; i++) dRows.push([no, picked[i].id, picked[i].name, picked[i].time, ST_CAME, 1, name]);
      shD.getRange(shD.getLastRow() + 1, 1, dRows.length, D_COLS).setValues(dRows);
    }
    addLog_(ss, no, 'walkin', trim_(d.memo, 200));
    SpreadsheetApp.flush();

    var outBooths = [];
    for (i = 0; i < picked.length; i++) outBooths.push({ id: picked[i].id, name: picked[i].name, time: picked[i].time });
    return { ok: true, no: no, name: name, adults: adults, children: children, booths: outBooths, checkedIn: true, checkedInAt: now };
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
}

/* =========================================================
 * 5. スプレッドシート読み書き
 * =======================================================*/

function getSS_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('スプレッドシートが見つかりません。setup() を実行してください。');
  return SpreadsheetApp.openById(id);
}

function getSiteKey_() {
  return String(PropertiesService.getScriptProperties().getProperty('SITE_KEY') || 'kitanaka2026');
}

function getPin_() {
  return String(PropertiesService.getScriptProperties().getProperty('CHECKIN_PIN') || '1234');
}

function getWebAppUrl_() {
  var url = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL');
  if (url) return url;
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

function readBooths_(ss) {
  var sh = ss.getSheetByName(SH_BOOTH);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var id = String(vals[i][B_ID - 1] || '').trim();
    if (!id) continue;
    out.push({
      id: id,
      name: String(vals[i][B_NAME - 1] || id),
      time: String(vals[i][B_TIME - 1] || ''),
      capacity: Math.max(0, Math.floor(Number(vals[i][B_CAP - 1]) || 0)),
      open: isTrue_(vals[i][B_OPEN - 1]),
      note: String(vals[i][B_NOTE - 1] || '')
    });
  }
  return out;
}

/** ブースごとの予約数（キャンセルは数えない） */
function countReserved_(ss) {
  var sh = ss.getSheetByName(SH_DETAIL);
  var counts = {};
  if (!sh || sh.getLastRow() < 2) return counts;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, D_COLS).getValues();
  for (var i = 0; i < vals.length; i++) {
    var id = String(vals[i][D_BID - 1] || '').trim();
    if (!id) continue;
    if (String(vals[i][D_STATUS - 1] || '') === ST_CANCEL) continue;
    var ppl = Number(vals[i][D_PEOPLE - 1]); if (!ppl || ppl < 1) ppl = 1;
    counts[id] = (counts[id] || 0) + ppl;
  }
  return counts;
}

function readDetail_(ss, no) {
  var sh = ss.getSheetByName(SH_DETAIL);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, D_COLS).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][D_NO - 1] || '').trim() !== no) continue;
    if (String(vals[i][D_STATUS - 1] || '') === ST_CANCEL) continue;
    out.push({
      id: String(vals[i][D_BID - 1] || ''),
      name: String(vals[i][D_BNAME - 1] || ''),
      time: String(vals[i][D_TIME - 1] || ''),
      status: String(vals[i][D_STATUS - 1] || ''),
      people: Number(vals[i][D_PEOPLE - 1] || 1)
    });
  }
  return out;
}

function findReservation_(ss, no) {
  var sh = ss.getSheetByName(SH_RESERVE);
  if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, R_COLS).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][R_NO - 1] || '').trim() === no) {
      return { row: i + 2, values: vals[i] };
    }
  }
  return null;
}

function setStatus_(ss, rowIndex, no, status, checkinAt) {
  var shR = ss.getSheetByName(SH_RESERVE);
  shR.getRange(rowIndex, R_STATUS).setValue(status);
  if (checkinAt) shR.getRange(rowIndex, R_CHECKIN).setValue(checkinAt);

  var shD = ss.getSheetByName(SH_DETAIL);
  if (shD && shD.getLastRow() >= 2) {
    var vals = shD.getRange(2, 1, shD.getLastRow() - 1, D_COLS).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][D_NO - 1] || '').trim() === no) {
        shD.getRange(i + 2, D_STATUS).setValue(status);
      }
    }
  }
  var shP = ss.getSheetByName(SH_PEOPLE);
  if (shP && shP.getLastRow() >= 2) {
    var pv = shP.getRange(2, 1, shP.getLastRow() - 1, 6).getValues();
    for (var k = 0; k < pv.length; k++) {
      if (String(pv[k][0] || '').trim() === no) shP.getRange(k + 2, 6).setValue(status);
    }
  }
}

function nextNo_(ss) {
  var sh = ss.getSheetByName(SH_RESERVE);
  var max = 0;
  if (sh && sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, R_NO, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var m = String(vals[i][0] || '').match(/^KF-(\d+)$/);
      if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
    }
  }
  return 'KF-' + padZero_(max + 1, 4);
}

function addLog_(ss, no, op, memo) {
  var sh = ss.getSheetByName(SH_LOG);
  if (!sh) return;
  sh.appendRow([nowStr_(), no, op, memo || '']);
}

/* =========================================================
 * 6. 小さな道具
 * =======================================================*/

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd HH:mm:ss');
}

function padZero_(n, len) {
  var s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

function trim_(v, max) {
  var s = (v === null || v === undefined) ? '' : String(v);
  s = s.replace(/^[\s　]+|[\s　]+$/g, '');
  if (s.length > max) s = s.substring(0, max);
  return s;
}

function isEmail_(s) {
  return /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/.test(s);
}

function toCount_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(v);
  if (isNaN(n)) return null;
  n = Math.floor(n);
  if (n < 0 || n > 10) return null;
  return n;
}

function toIdList_(v) {
  var arr = [];
  if (!v) return arr;
  if (typeof v === 'string') arr = v.split(',');
  else if (v.length !== undefined) { for (var i = 0; i < v.length; i++) arr.push(v[i]); }
  var seen = {}, out = [];
  for (i = 0; i < arr.length; i++) {
    var id = trim_(arr[i], 60);
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function normalizeNo_(v) {
  var s = trim_(v, 40).toUpperCase().replace(/[Ａ-Ｚａ-ｚ０-９－−ー]/g, function (ch) {
    var c = ch.charCodeAt(0);
    if (c >= 0xFF21 && c <= 0xFF3A) return String.fromCharCode(c - 0xFEE0);
    if (c >= 0xFF41 && c <= 0xFF5A) return String.fromCharCode(c - 0xFEE0).toUpperCase();
    if (c >= 0xFF10 && c <= 0xFF19) return String.fromCharCode(c - 0xFEE0);
    return '-';
  });
  var m = s.match(/^KF-?(\d{1,6})$/);
  if (m) return 'KF-' + padZero_(parseInt(m[1], 10), 4);
  if (/^\d{1,6}$/.test(s)) return 'KF-' + padZero_(parseInt(s, 10), 4);
  return '';
}

/** セルの先頭についてしまった「'」を取る */
function stripQuote_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return s.replace(/^'/, '');
}

function isTrue_(v) {
  if (v === true) return true;
  if (v === 1) return true;
  var s = String(v).trim().toUpperCase();
  return (s === 'TRUE' || s === '1' || s === 'はい' || s === 'ON' || s === '○');
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* =========================================================
 * 7. メール
 * =======================================================*/

function sendThanksMail_(no, name, email, booths, token) {
  var url = getWebAppUrl_();
  var cancelUrl = url ? (url + '?action=cancel&no=' + encodeURIComponent(no) + '&token=' + encodeURIComponent(token)) : '';
  var qrBlob = null;
  try {
    qrBlob = makeQrBlob_(no, 8, 4);
  } catch (err) {
    qrBlob = null;
  }
  var html = buildMailHtml_(no, name, booths, cancelUrl, !!qrBlob);
  var opts = {
    to: email,
    subject: '【北中城フェスタ】ご予約ありがとうございます（予約番号 ' + no + '）',
    htmlBody: html,
    body: buildMailText_(no, name, booths, cancelUrl),
    name: 'ゆいどころ（北中城フェスタ受付）'
  };
  if (qrBlob) opts.inlineImages = { qrimg: qrBlob };
  MailApp.sendEmail(opts);
}

function buildMailHtml_(no, name, booths, cancelUrl, hasQr) {
  var rows = '';
  for (var i = 0; i < booths.length; i++) {
    rows += '<tr>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #E3DBC9;font-size:17px;">' + esc_(booths[i].name) + '</td>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #E3DBC9;font-size:17px;white-space:nowrap;">' + esc_(booths[i].time) + '</td>' +
      '</tr>';
  }
  if (!rows) rows = '<tr><td style="padding:10px 12px;font-size:17px;">（当日のご来場のみ）</td><td></td></tr>';

  var qrBlock = hasQr
    ? '<div style="text-align:center;margin:8px 0 4px;">' +
      '<img src="cid:qrimg" width="232" height="232" alt="予約番号のQRコード" style="display:block;margin:0 auto;border:8px solid #FFFFFF;background:#FFFFFF;">' +
      '</div>' +
      '<p style="font-size:16px;line-height:1.8;margin:6px 0 0;text-align:center;">当日は受付でこのQRコード、または予約番号をお見せください。</p>'
    : '<p style="font-size:16px;line-height:1.8;margin:6px 0 0;text-align:center;">当日は受付で、上の予約番号をお伝えください。</p>';

  return '' +
    '<div style="margin:0;padding:0;background:#F4EFE4;">' +
    '<div style="max-width:600px;margin:0 auto;padding:0 0 28px;background:#F4EFE4;font-family:\'Hiragino Sans\',\'Yu Gothic\',sans-serif;color:#33302B;">' +

    '<div style="background:#F2B705;padding:20px 24px;">' +
    '<div style="font-size:15px;letter-spacing:.08em;color:#5A4300;">' + esc_(EVENT.dateLabel) + ' ' + esc_(EVENT.time) + '</div>' +
    '<div style="font-size:24px;font-weight:bold;margin-top:6px;color:#33302B;">' + esc_(EVENT.name) + '</div>' +
    '</div>' +

    '<div style="padding:24px;">' +
    '<p style="font-size:19px;line-height:1.9;margin:0 0 18px;">' + esc_(name) + ' 様</p>' +
    '<p style="font-size:17px;line-height:1.9;margin:0 0 22px;">ご予約ありがとうございます。<br>下記の内容で承りました。当日お会いできるのを楽しみにしています。</p>' +

    '<div style="background:#FFFFFF;border-radius:14px;padding:22px 20px;text-align:center;">' +
    '<div style="font-size:15px;color:#7A7266;letter-spacing:.1em;">予約番号</div>' +
    '<div style="font-size:40px;font-weight:bold;letter-spacing:.06em;margin:6px 0 16px;">' + esc_(no) + '</div>' +
    qrBlock +
    '</div>' +

    '<h3 style="font-size:18px;margin:26px 0 10px;border-left:6px solid #F2B705;padding-left:10px;">ご予約のブース</h3>' +
    '<table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:10px;">' + rows + '</table>' +

    '<h3 style="font-size:18px;margin:26px 0 10px;border-left:6px solid #F2B705;padding-left:10px;">開催のご案内</h3>' +
    '<table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:10px;font-size:17px;">' +
    mailRow_('日にち', EVENT.dateLabel) +
    mailRow_('時間', EVENT.time) +
    mailRow_('会場', EVENT.venue) +
    mailRow_('住所', EVENT.address) +
    mailRow_('駐車場', EVENT.parking) +
    mailRow_('参加費', EVENT.fee) +
    '</table>' +

    '<p style="font-size:17px;line-height:1.9;margin:22px 0 0;">体験はすべて無料です。無理な営業や勧誘はしませんので、どうぞ気軽にお越しください。</p>' +

    (cancelUrl ?
      '<p style="font-size:15px;line-height:1.9;margin:22px 0 0;color:#5C554B;">ご都合が悪くなった場合は、こちらからキャンセルできます。<br>' +
      '<a href="' + esc_(cancelUrl) + '" style="color:#8A6B00;">予約をキャンセルする</a></p>' : '') +

    '<div style="margin-top:26px;padding-top:18px;border-top:1px solid #E3DBC9;font-size:15px;line-height:1.9;color:#5C554B;">' +
    esc_(EVENT.organizer) + '<br>' +
    'お問い合わせ　' + esc_(EVENT.contact) +
    '</div>' +

    '</div></div></div>';
}

function mailRow_(label, value) {
  return '<tr>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #E3DBC9;white-space:nowrap;color:#7A7266;">' + esc_(label) + '</td>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #E3DBC9;">' + esc_(value) + '</td>' +
    '</tr>';
}

function buildMailText_(no, name, booths, cancelUrl) {
  var lines = [];
  lines.push(name + ' 様');
  lines.push('');
  lines.push('ご予約ありがとうございます。下記の内容で承りました。');
  lines.push('');
  lines.push('予約番号： ' + no);
  lines.push('');
  lines.push('【ご予約のブース】');
  for (var i = 0; i < booths.length; i++) lines.push('・' + booths[i].name + '　' + booths[i].time);
  lines.push('');
  lines.push('【開催のご案内】');
  lines.push('日にち： ' + EVENT.dateLabel);
  lines.push('時間： ' + EVENT.time);
  lines.push('会場： ' + EVENT.venue);
  lines.push('住所： ' + EVENT.address);
  lines.push('駐車場： ' + EVENT.parking);
  lines.push('参加費： ' + EVENT.fee);
  lines.push('');
  lines.push('当日は受付で、このメールのQRコードか予約番号をお見せください。');
  lines.push('体験はすべて無料です。無理な営業や勧誘はしません。');
  if (cancelUrl) {
    lines.push('');
    lines.push('キャンセルはこちら： ' + cancelUrl);
  }
  lines.push('');
  lines.push(EVENT.organizer);
  lines.push('お問い合わせ　' + EVENT.contact);
  return lines.join('\n');
}

/** キャンセルの確認ページ（「本当にキャンセルしますか？」） */
function confirmCancelHtml_(no, name, booths, token) {
  var url = getWebAppUrl_() + '?action=cancel&no=' + encodeURIComponent(no) + '&token=' + encodeURIComponent(token) + '&confirm=1';
  var list = '';
  for (var i = 0; i < booths.length; i++) {
    list += '<li style="margin:4px 0;">' + esc_(booths[i].name) + (booths[i].time ? '　<span style="color:#666;font-size:15px;">' + esc_(booths[i].time) + '</span>' : '') + '</li>';
  }
  return pageShell_('予約のキャンセル',
    '<h1 style="font-size:22px;margin:0 0 14px;color:#2F6B5A;">本当にキャンセルしますか？</h1>' +
    '<p style="font-size:17px;margin:0 0 6px;">予約番号　<strong>' + esc_(no) + '</strong>　' + esc_(name) + ' 様</p>' +
    (list ? '<ul style="font-size:17px;line-height:1.7;margin:0 0 16px;padding-left:22px;">' + list + '</ul>' : '') +
    '<p style="font-size:16px;line-height:1.8;color:#555;margin:0 0 18px;">キャンセルすると枠がほかの方に回ります。もとに戻すには、もう一度予約が必要です。</p>' +
    '<a href="' + url + '" style="display:block;text-align:center;background:#B3281E;color:#fff;font-size:18px;font-weight:bold;padding:16px;border-radius:14px;text-decoration:none;margin-bottom:12px;">キャンセルする</a>' +
    '<a href="' + esc_(EVENT.siteUrl || 'https://yuidocoro-wq.github.io/kitanaka-festa-2026/') + '" style="display:block;text-align:center;background:#fff;color:#2F6B5A;border:2px solid #468977;font-size:18px;font-weight:bold;padding:14px;border-radius:14px;text-decoration:none;">やめる（予約はそのまま）</a>');
}

function pageShell_(title, inner) {
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc_(title) + '｜' + esc_(EVENT.name) + '</title></head>' +
    '<body style="margin:0;background:#F4F8F6;font-family:\'Hiragino Sans\',\'Yu Gothic\',sans-serif;color:#222;">' +
    '<div style="max-width:560px;margin:0 auto;">' +
    '<div style="background:#468977;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold;">' + esc_(EVENT.name) + '</div>' +
    '<div style="background:#FFFFFF;margin:22px;padding:26px 22px;border-radius:14px;border:2px solid #DDE7E2;">' + inner + '</div>' +
    '<div style="margin:0 22px 30px;font-size:15px;line-height:1.9;color:#555;">' +
    esc_(EVENT.organizer) + '<br>お問い合わせ　' + esc_(EVENT.contact) +
    '</div></div></body></html>';
}

function cancelHtml_(ok, no, msg) {
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>予約のキャンセル｜' + esc_(EVENT.name) + '</title></head>' +
    '<body style="margin:0;background:#F4F8F6;font-family:\'Hiragino Sans\',\'Yu Gothic\',sans-serif;color:#222;">' +
    '<div style="max-width:560px;margin:0 auto;">' +
    '<div style="background:#468977;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold;">' + esc_(EVENT.name) + '</div>' +
    '<div style="background:#FFFFFF;margin:22px;padding:26px 22px;border-radius:14px;">' +
    '<h1 style="font-size:22px;margin:0 0 16px;">' + (ok ? 'キャンセルの手続きが完了しました' : 'キャンセルできませんでした') + '</h1>' +
    (no ? '<p style="font-size:18px;margin:0 0 12px;">予約番号　<strong>' + esc_(no) + '</strong></p>' : '') +
    '<p style="font-size:17px;line-height:1.9;margin:0;">' + esc_(msg) + '</p>' +
    '</div>' +
    '<div style="margin:0 22px 30px;font-size:15px;line-height:1.9;color:#5C554B;">' +
    esc_(EVENT.organizer) + '<br>お問い合わせ　' + esc_(EVENT.contact) +
    '</div></div></body></html>';
}

/* =========================================================
 * 8. テスト用（スクリプトエディタから実行）
 * =======================================================*/

/** 自分あてにサンキューメールの見本を送る */
function sendTestMail() {
  var to = Session.getActiveUser().getEmail();
  sendThanksMail_('KF-0001', 'テスト 太郎', to,
    [{ id: 'haihai', name: 'ハイハイレース', time: '10:50〜11:20' }], 'test-token');
  return to + ' に見本を送りました。';
}

/** ダミーの予約を1件入れてみる（台帳に残るので、あとで行を消してください） */
function testReserve() {
  var r = apiReserve_({
    action: 'reserve',
    key: getSiteKey_(),
    name: 'テスト 太郎',
    kana: 'てすと たろう',
    phone: '080-0000-0000',
    email: Session.getActiveUser().getEmail(),
    adults: 1, children: 1, months: '10か月',
    booths: ['haihai'],
    note: 'テストです'
  });
  Logger.log(JSON.stringify(r));
  return r;
}

/** QRコードが作れるか確認する（GIFをドライブに保存せず、サイズだけ見る） */
function testQr() {
  var blob = makeQrBlob_('KF-0001', 8, 4);
  Logger.log('QR bytes: ' + blob.getBytes().length);
  return 'QRを作れました（' + blob.getBytes().length + ' バイト）';
}

/* =========================================================
 * 9. QRコード生成（外部サービスを使わない・GAS内で完結）
 *    バイトモード／誤り訂正レベルM／型番1〜3（最大42バイト）
 *    予約番号（KF-0001 など）はすべて型番1（21×21）に収まります。
 * =======================================================*/

/** 予約番号などの文字列からGIF画像のBlobを作る */
function makeQrBlob_(text, scale, quiet) {
  var m = QR_.makeMatrix(String(text));
  if (!m) throw new Error('QRにできる長さを超えています: ' + text);
  var b64 = QR_.gifBase64(m, scale || 8, quiet === undefined ? 4 : quiet);
  return Utilities.newBlob(Utilities.base64Decode(b64), 'image/gif', 'qr.gif');
}

var QR_ = (function () {
  var EXP = [], LOG = [];
  (function () {
    var x = 1, i;
    for (i = 0; i < 256; i++) { EXP[i] = x; x = x << 1; if (x & 0x100) x = x ^ 0x11d; }
    for (i = 0; i < 255; i++) { LOG[EXP[i]] = i; }
  })();

  function gmul(a, b) { if (a === 0 || b === 0) return 0; return EXP[(LOG[a] + LOG[b]) % 255]; }

  function genPoly(n) {
    var poly = [1], i, j, next;
    for (i = 0; i < n; i++) {
      next = [];
      for (j = 0; j < poly.length + 1; j++) next.push(0);
      for (j = 0; j < poly.length; j++) {
        next[j] = next[j] ^ poly[j];
        next[j + 1] = next[j + 1] ^ gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEc(data, ecCount) {
    var gen = genPoly(ecCount), res = [], i, j, factor;
    for (i = 0; i < data.length; i++) res.push(data[i]);
    for (i = 0; i < ecCount; i++) res.push(0);
    for (i = 0; i < data.length; i++) {
      factor = res[i];
      if (factor !== 0) for (j = 0; j < gen.length; j++) res[i + j] = res[i + j] ^ gmul(gen[j], factor);
    }
    return res.slice(data.length);
  }

  // レベルM : [総コード語数, データコード語数]
  var SPEC = { 1: [26, 16], 2: [44, 28], 3: [70, 44] };

  function pickVersion(len) {
    for (var v = 1; v <= 3; v++) if (len <= SPEC[v][1] - 2) return v;
    return 0;
  }

  function toBytes(text) {
    var out = [], i, c;
    for (i = 0; i < text.length; i++) {
      c = text.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6)); out.push(0x80 | (c & 0x3f)); }
      else { out.push(0xe0 | (c >> 12)); out.push(0x80 | ((c >> 6) & 0x3f)); out.push(0x80 | (c & 0x3f)); }
    }
    return out;
  }

  function makeDataCodewords(bytes, version) {
    var dataCount = SPEC[version][1], bits = [], i, j, b;
    function put(val, n) { for (j = n - 1; j >= 0; j--) bits.push((val >> j) & 1); }
    put(4, 4);
    put(bytes.length, 8);
    for (i = 0; i < bytes.length; i++) put(bytes[i], 8);
    for (i = 0; i < 4 && bits.length < dataCount * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    var cw = [];
    for (i = 0; i < bits.length; i += 8) {
      b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    var pad = [0xEC, 0x11], k = 0;
    while (cw.length < dataCount) { cw.push(pad[k % 2]); k++; }
    return cw;
  }

  function maskFn(mask, i, j) {
    switch (mask) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      case 7: return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
    }
    return false;
  }

  function bitLen(n) { var c = 0; while (n !== 0) { c++; n = n >>> 1; } return c; }

  function formatInfo(mask) {
    var data = (0 << 3) | mask;   // レベルM = 00
    var d = data << 10;
    while (bitLen(d) - 11 >= 0) d = d ^ (0x537 << (bitLen(d) - 11));
    return ((data << 10) | d) ^ 0x5412;
  }

  function buildMatrix(codewords, version, mask) {
    var size = version * 4 + 17, m = [], r, c, i;
    for (r = 0; r < size; r++) { m.push([]); for (c = 0; c < size; c++) m[r].push(null); }

    function setFinder(row, col) {
      var rr, cc, dark;
      for (rr = -1; rr <= 7; rr++) for (cc = -1; cc <= 7; cc++) {
        if (row + rr < 0 || size <= row + rr || col + cc < 0 || size <= col + cc) continue;
        dark = (0 <= rr && rr <= 6 && (cc === 0 || cc === 6)) ||
               (0 <= cc && cc <= 6 && (rr === 0 || rr === 6)) ||
               (2 <= rr && rr <= 4 && 2 <= cc && cc <= 4);
        m[row + rr][col + cc] = dark;
      }
    }
    setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);

    if (version >= 2) {
      var ctr = (version === 2) ? 18 : 22, rr, cc;
      for (rr = -2; rr <= 2; rr++) for (cc = -2; cc <= 2; cc++) {
        m[ctr + rr][ctr + cc] = (rr === -2 || rr === 2 || cc === -2 || cc === 2 || (rr === 0 && cc === 0));
      }
    }
    for (i = 8; i < size - 8; i++) {
      if (m[i][6] === null) m[i][6] = (i % 2 === 0);
      if (m[6][i] === null) m[6][i] = (i % 2 === 0);
    }
    var fmt = formatInfo(mask);
    for (i = 0; i < 15; i++) {
      var dark = ((fmt >> i) & 1) === 1;
      if (i < 6) m[i][8] = dark;
      else if (i < 8) m[i + 1][8] = dark;
      else m[size - 15 + i][8] = dark;
      if (i < 8) m[8][size - i - 1] = dark;
      else if (i < 9) m[8][15 - i - 1 + 1] = dark;
      else m[8][15 - i - 1] = dark;
    }
    m[size - 8][8] = true;

    var inc = -1, row = size - 1, bitIndex = 7, byteIndex = 0, col, cc2;
    for (col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      while (true) {
        for (cc2 = 0; cc2 < 2; cc2++) {
          if (m[row][col - cc2] === null) {
            var d2 = false;
            if (byteIndex < codewords.length) d2 = (((codewords[byteIndex] >>> bitIndex) & 1) === 1);
            if (maskFn(mask, row, col - cc2)) d2 = !d2;
            m[row][col - cc2] = d2;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || size <= row) { row -= inc; inc = -inc; break; }
      }
    }
    return m;
  }

  function penalty(m) {
    var size = m.length, score = 0, r, c, run, prev, k;
    for (r = 0; r < size; r++) {
      run = 1; prev = m[r][0];
      for (c = 1; c < size; c++) {
        if (m[r][c] === prev) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; prev = m[r][c]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (c = 0; c < size; c++) {
      run = 1; prev = m[0][c];
      for (r = 1; r < size; r++) {
        if (m[r][c] === prev) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; prev = m[r][c]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    var p1 = [true, false, true, true, true, false, true, false, false, false, false];
    var p2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (r = 0; r < size; r++) for (c = 0; c + 11 <= size; c++) {
      var h1 = true, h2 = true;
      for (k = 0; k < 11; k++) {
        if (m[r][c + k] !== p1[k]) h1 = false;
        if (m[r][c + k] !== p2[k]) h2 = false;
      }
      if (h1) score += 40;
      if (h2) score += 40;
    }
    for (c = 0; c < size; c++) for (r = 0; r + 11 <= size; r++) {
      var v1 = true, v2 = true;
      for (k = 0; k < 11; k++) {
        if (m[r + k][c] !== p1[k]) v1 = false;
        if (m[r + k][c] !== p2[k]) v2 = false;
      }
      if (v1) score += 40;
      if (v2) score += 40;
    }
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return score;
  }

  function makeMatrix(text) {
    var bytes = toBytes(text), version = pickVersion(bytes.length);
    if (version === 0) return null;
    var data = makeDataCodewords(bytes, version);
    var ec = rsEc(data, SPEC[version][0] - SPEC[version][1]);
    var all = data.concat(ec);
    var best = null, bestScore = -1, mask, m, s;
    for (mask = 0; mask < 8; mask++) {
      m = buildMatrix(all, version, mask);
      s = penalty(m);
      if (bestScore < 0 || s < bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  /* GIF（白黒2色・LZWは「そのまま出す」方式）をbase64で返す */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function toBase64(bytes) {
    var out = '', i, a, b, c;
    for (i = 0; i < bytes.length; i += 3) {
      a = bytes[i];
      b = (i + 1 < bytes.length) ? bytes[i + 1] : -1;
      c = (i + 2 < bytes.length) ? bytes[i + 2] : -1;
      out += B64.charAt(a >> 2);
      out += B64.charAt(((a & 3) << 4) | (b >= 0 ? (b >> 4) : 0));
      out += (b >= 0) ? B64.charAt(((b & 15) << 2) | (c >= 0 ? (c >> 6) : 0)) : '=';
      out += (c >= 0) ? B64.charAt(c & 63) : '=';
    }
    return out;
  }

  function gifBase64(matrix, scale, quiet) {
    var size = matrix.length, px = (size + quiet * 2) * scale, bytes = [], i, k;
    function w8(v) { bytes.push(v & 0xff); }
    function w16(v) { bytes.push(v & 0xff); bytes.push((v >> 8) & 0xff); }
    var head = 'GIF87a';
    for (i = 0; i < head.length; i++) w8(head.charCodeAt(i));
    w16(px); w16(px); w8(0x80); w8(0); w8(0);
    w8(0xff); w8(0xff); w8(0xff);     // 0番 = 白
    w8(0x00); w8(0x00); w8(0x00);     // 1番 = 黒
    w8(0x2c); w16(0); w16(0); w16(px); w16(px); w8(0);
    w8(2);                            // LZW最小コードサイズ

    var chunks = [], cur = [], bitBuf = 0, bitCnt = 0;
    var width = 3, next = 6, first = true;
    function flushByte(b) { cur.push(b); if (cur.length === 255) { chunks.push(cur); cur = []; } }
    function emit(code) {
      bitBuf = bitBuf | (code << bitCnt); bitCnt += width;
      while (bitCnt >= 8) { flushByte(bitBuf & 0xff); bitBuf = bitBuf >> 8; bitCnt -= 8; }
    }
    emit(4); width = 3; next = 6; first = true;   // クリアコード
    function pixel(v) {
      emit(v);
      if (first) { first = false; return; }
      next++;
      if (next === (1 << width)) {
        width++;
        if (width > 5) { emit(4); width = 3; next = 6; first = true; }
      }
    }
    var r, c, yy, xx;
    for (yy = 0; yy < px; yy++) {
      r = Math.floor(yy / scale) - quiet;
      for (xx = 0; xx < px; xx++) {
        c = Math.floor(xx / scale) - quiet;
        pixel((r >= 0 && r < size && c >= 0 && c < size && matrix[r][c]) ? 1 : 0);
      }
    }
    emit(5);   // 終わりのコード
    if (bitCnt > 0) { flushByte(bitBuf & 0xff); bitBuf = 0; bitCnt = 0; }
    if (cur.length > 0) chunks.push(cur);
    for (i = 0; i < chunks.length; i++) {
      w8(chunks[i].length);
      for (k = 0; k < chunks[i].length; k++) w8(chunks[i][k]);
    }
    w8(0); w8(0x3b);
    return toBase64(bytes);
  }

  return { makeMatrix: makeMatrix, gifBase64: gifBase64 };
})();
