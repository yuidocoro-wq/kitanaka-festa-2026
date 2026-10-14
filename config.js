// config.js — 公開前に gasUrl を入れてください
// gasUrl … GAS（受付係）をウェブアプリとして公開したときに出る URL（https://script.google.com/macros/s/.../exec）
// siteKey … サイトからの予約だと分かるための合言葉。GAS 側と同じ文字にします
// checkinPin … テスト表示（gasUrlが空）のときだけ使う番号。本番の合言葉はGASのスクリプトプロパティ CHECKIN_PIN で確認し、ここには置きません
window.FESTA_CONFIG = {
  gasUrl: "https://script.google.com/macros/s/AKfycbz99zO6BrfsusFq-Dhrfc_gss8zrNzvFLWLy5-54pS66Yn-Ac91UN4s4NVMy5Gjqc4V/exec",
  siteKey: "kitanaka2026",
  checkinPin: "1234",
  // openAt … 予約・来場登録の受付開始（10/14 山野さんと決定：北中城の広報配布に合わせて 11/1 から）。この時刻より前は、予約ボタンを止めて開始日を案内します
  openAt: "2026-11-01T00:00:00+09:00",
  openLabel: "11月1日（日）"
};
