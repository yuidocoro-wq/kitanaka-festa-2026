// config.js — 公開前に gasUrl を入れてください
// gasUrl … GAS（受付係）をウェブアプリとして公開したときに出る URL（https://script.google.com/macros/s/.../exec）
// siteKey … サイトからの予約だと分かるための合言葉。GAS 側と同じ文字にします
// checkinPin … テスト表示（gasUrlが空）のときだけ使う番号。本番の合言葉はGASのスクリプトプロパティ CHECKIN_PIN で確認し、ここには置きません
window.FESTA_CONFIG = {
  gasUrl: "",
  siteKey: "kitanaka2026",
  checkinPin: "1234"
};
