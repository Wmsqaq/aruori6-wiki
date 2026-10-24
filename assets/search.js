(function(){
"use strict";
var ROOT = document.body.getAttribute("data-root") || "./";
var input = document.getElementById("q");
var box = document.getElementById("results");
var toggle = document.getElementById("modeToggle");
var simpleIdx = null, simpleById = null, simpleLoading = false;
var fullIdx = null, fullLower = null, fullLoading = false;
var mode = "simple";
try { mode = localStorage.getItem("wsearch-mode") || "simple"; } catch (e) {}
if (mode !== "simple" && mode !== "full") mode = "simple";
var selIdx = -1, current = [];

function esc(s){return String(s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}

function itemHref(id){ return ROOT + "item/" + id.replace(":", "/") + ".html"; }

function preloadSimple(){
  if (simpleIdx || simpleLoading) return;
  simpleLoading = true;
  fetch(ROOT + "assets/search_simple.json").then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){ simpleIdx = d; if(mode==="simple") render(); })
  .catch(function(){ simpleIdx = []; });
}
function ensureFull(){
  if (fullIdx || fullLoading) return;
  fullLoading = true;
  fetch(ROOT + "assets/search_full.json").then(function(r){
    if(!r.ok) throw new Error(r.status); return r.json();
  }).then(function(d){
    fullIdx = d; fullLower = {};
    for (var k in d) fullLower[k] = d[k].toLowerCase();
    if(mode==="full") render();
  }).catch(function(){ fullIdx = {}; fullLower = {}; });
}

function setMode(m){
  mode = m;
  try { localStorage.setItem("wsearch-mode", m); } catch(e) {}
  var bs = toggle.querySelectorAll("button");
  for (var i=0;i<bs.length;i++) bs[i].classList.toggle("on", bs[i].getAttribute("data-m")===m);
  if (m==="full") ensureFull();
  render();
}
toggle.addEventListener("click", function(e){
  var b = e.target.closest("button"); if(!b) return;
  setMode(b.getAttribute("data-m"));
});

// —— 简单模式：zh/en/ID 前缀与子串，加权排序 top20
function simpleSearch(q){
  var ql = q.toLowerCase(), out = [];
  for (var i=0;i<simpleIdx.length;i++){
    var it = simpleIdx[i];
    var zh = it.zh || "", en = (it.en || "").toLowerCase(), id = it.id.toLowerCase();
    var sc = -1;
    if (zh.indexOf(q) === 0) sc = 0;
    else if (zh.indexOf(q) >= 0) sc = 1;
    else if (en.indexOf(ql) === 0) sc = 2;
    else if (en.indexOf(ql) >= 0) sc = 3;
    else if (id.indexOf(ql) === 0) sc = 4;
    else if (id.indexOf(ql) >= 0) sc = 5;
    if (sc >= 0) out.push([sc, it.id, it]);
  }
  out.sort(function(a,b){
    if (a[0] !== b[0]) return a[0]-b[0];
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  return out.slice(0,20).map(function(x){ return x[1]; }); // 返回 id 字符串，与 fullSearch/show/rowHtml 的约定一致
}

// —— 精确模式：全文子串，命中位置靠前者优先，top20
function fullSearch(q){
  var ql = q.toLowerCase(), out = [];
  for (var id in fullLower){
    var idx = fullLower[id].indexOf(ql);
    if (idx >= 0) out.push([idx, id]);
  }
  out.sort(function(a,b){
    if (a[0] !== b[0]) return a[0]-b[0];
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  return out.slice(0,20).map(function(x){ return x[1]; });
}

function markAround(text, q){
  var low = text.toLowerCase(), ql = q.toLowerCase();
  var i = low.indexOf(ql);
  if (i < 0) return esc(text);
  var start = Math.max(0, i - 26), end = Math.min(text.length, i + ql.length + 44);
  var mid = text.slice(start, end);
  var ml = mid.toLowerCase(), out = "", pos = 0, hit;
  while ((hit = ml.indexOf(ql, pos)) >= 0 && out.length < 400){
    out += esc(mid.slice(pos, hit)) + "<mark>" + esc(mid.slice(hit, hit+ql.length)) + "</mark>";
    pos = hit + ql.length;
  }
  out += esc(mid.slice(pos));
  return (start>0?"…":"") + out + (end<text.length?"…":"");
}

function rowHtml(id, q, snip){
  id = String(id);  // 防御：上游 list 元素永远是 id 字符串，String 归一保证即使回归也不会抛 TypeError
  if (simpleIdx && !simpleById){
    simpleById = {};
    for (var i=0;i<simpleIdx.length;i++) simpleById[simpleIdx[i].id] = simpleIdx[i];
  }
  var it = simpleById ? (simpleById[id] || null) : null;
  var name = it && (it.zh || it.en) ? (it.zh || it.en) : "";
  var nameHtml = name ? markAround(name, q) : "";
  var idHtml = markAround(id, q);
  return '<a class="sr" href="' + esc(itemHref(id)) + '">' +
    (nameHtml ? '<span class="sr-name">'+nameHtml+'</span>' : '') +
    '<span class="sr-id">'+idHtml+'</span>' +
    (snip ? '<span class="sr-snip">'+snip+'</span>' : '') + '</a>';
}

function show(list, q, withSnip){
  current = list; selIdx = -1;
  if (!list.length){ box.innerHTML = '<div class="sr-status">无匹配结果</div>'; box.hidden = false; return; }
  var html = "";
  for (var i=0;i<list.length;i++){
    var snip = "";
    if (withSnip && fullIdx && fullIdx[list[i]] != null) snip = markAround(fullIdx[list[i]], q);
    html += rowHtml(list[i], q, snip);
  }
  box.innerHTML = html; box.hidden = false;
}

function render(){
  var q = input.value.trim();
  if (!q){ box.hidden = true; current = []; return; }
  if (mode === "simple"){
    if (!simpleIdx){ box.innerHTML = '<div class="sr-status">索引加载中…</div>'; box.hidden = false;
      preloadSimple(); return; }
    show(simpleSearch(q), q, false);
  } else {
    if (!fullIdx){ box.innerHTML = '<div class="sr-status">精确索引加载中…（首次约数 MB）</div>'; box.hidden = false;
      ensureFull(); return; }
    show(fullSearch(q), q, true);
  }
}

input.addEventListener("input", render);
input.addEventListener("focus", render);
document.addEventListener("click", function(e){
  if (!e.target.closest(".searchbox")) box.hidden = true;
});
input.addEventListener("keydown", function(e){
  var rows = box.querySelectorAll("a.sr");
  if (e.key === "Enter"){
    if (rows.length){ window.location = rows[Math.max(selIdx,0)].getAttribute("href"); }
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp"){
    e.preventDefault();
    if (!rows.length) return;
    selIdx = e.key === "ArrowDown" ? Math.min(selIdx+1, rows.length-1) : Math.max(selIdx-1, 0);
    for (var i=0;i<rows.length;i++) rows[i].classList.toggle("sel", i===selIdx);
    rows[selIdx].scrollIntoView({block:"nearest"});
  } else if (e.key === "Escape"){ box.hidden = true; }
});

// —— 槽位悬浮 tooltip（中文名 + ID + mod）
var tt = document.getElementById("tt");
var ttTimer = null;
document.addEventListener("mousemove", function(e){
  var t = e.target && e.target.closest ? e.target.closest("[data-tt]") : null;
  if (!t){ tt.hidden = true; return; }
  var tag = t.getAttribute("data-tt-tag") === "1";
  var title = t.getAttribute("data-tt") || "";
  var sub = t.getAttribute("data-tt-sub");
  var mod = t.getAttribute("data-tt-mod");
  var h = "";
  if (tag) h += '<div class="tt-tag">#标签</div>';
  h += '<div>' + esc(title) + '</div>';
  if (sub) h += '<div class="tt-sub">' + esc(sub) + '</div>';
  if (mod) h += '<div class="tt-mod">来源模组：' + esc(mod) + '</div>';
  tt.innerHTML = h;
  tt.hidden = false;
  var x = e.clientX + 14, y = e.clientY + 16;
  var r = tt.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 10;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 10;
  tt.style.left = x + "px"; tt.style.top = y + "px";
});
document.addEventListener("mouseleave", function(){ tt.hidden = true; });

var bs = toggle.querySelectorAll("button");
for (var i=0;i<bs.length;i++) bs[i].classList.toggle("on", bs[i].getAttribute("data-m")===mode);
preloadSimple();
})();
