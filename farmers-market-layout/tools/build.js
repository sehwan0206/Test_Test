#!/usr/bin/env node
/*
 * src/ 의 HTML·CSS·JS·라이브러리를 HTML 파일 하나로 합칩니다.
 *   node tools/build.js   →   농부의시장_배치도.html
 * 결과 파일은 인터넷 없이도 더블클릭만으로 열립니다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const outFile = path.join(root, '농부의시장_배치도.html');

/** 인라인 <script> 안에서 HTML 파서를 속일 수 있는 문자열을 \x3C 로 바꿈 (JS 의미는 동일) */
function escapeInlineJs(code, name) {
  const before = (code.match(/<!--|<\/?script/gi) || []).length;
  const out = code.replace(/(\\*)(<)(!--|\/?script)/gi, (all, bs, lt, rest) => {
    if (bs.length % 2 === 1) throw new Error(`${name}: 백슬래시 뒤의 "${lt}${rest}" 는 안전하게 바꿀 수 없습니다.`);
    return bs + '\\x3C' + rest;
  });
  const after = (out.match(/<!--|<\/?script/gi) || []).length;
  if (after !== 0) throw new Error(`${name}: 이스케이프 실패 (${before} → ${after})`);
  return out;
}

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const stamp = new Date();
const pad = (n) => String(n).padStart(2, '0');
const build = `${stamp.getFullYear()}.${pad(stamp.getMonth() + 1)}.${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (all, href) => {
  const css = fs.readFileSync(path.join(src, href), 'utf8');
  if (/<\/style/i.test(css)) throw new Error(href + ': </style 포함');
  return `<style>\n${css}\n</style>`;
});

let count = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (all, file) => {
  const code = fs.readFileSync(path.join(src, file), 'utf8');
  count++;
  return `<script>/* ${file} */\n${escapeInlineJs(code, file)}\n</script>`;
});

html = html.replace('</head>', () => `<meta name="generator" content="농부의시장 배치도 도우미 ${build}">\n<script>window.FM_BUILD = ${JSON.stringify(build)};</script>\n</head>`);

if (/<script src=/.test(html) || /<link rel="stylesheet"/.test(html)) throw new Error('외부 파일 참조가 남아 있습니다.');
if (!/<script id="fm-embedded" type="application\/json"><\/script>/.test(html)) throw new Error('fm-embedded 자리가 없습니다.');

fs.writeFileSync(outFile, html);
console.log(`✓ ${path.relative(process.cwd(), outFile)}  (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB, 스크립트 ${count}개 포함, 빌드 ${build})`);
