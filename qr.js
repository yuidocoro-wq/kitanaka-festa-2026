/* qr.js — 予約番号のQRコードを画面に出す（2026-10-16）
 * 受付係（GAS）がメールに入れているQRと同じ作り方（バイトモード・誤り訂正M・型番1〜3）。
 * 外部サービスを使わず、この端末の中だけで作ります（予約番号を外に送らない）。
 * 使い方: FestaQR.svg("KF-0001") → <svg> の文字列
 */
(function (global) {
  "use strict";
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

  return { makeMatrix: makeMatrix };
})();

  /** QRの<svg>を作る。quiet = まわりの白い余白（マス数）。1マス=1単位で、表示の大きさはCSSで決める */
  function svg(text, quiet) {
    var m = QR_.makeMatrix(String(text));
    if (!m) return "";
    var q = (quiet === undefined) ? 4 : quiet, n = m.length, size = n + q * 2, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (m[r][c]) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="QRコード ' + String(text).replace(/[<>&"]/g, "") + '">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  global.FestaQR = { svg: svg, matrix: function (t) { return QR_.makeMatrix(String(t)); } };
})(window);
