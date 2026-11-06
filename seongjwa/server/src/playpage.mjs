// 웹 전투 프로토타입(/play, DEV_LOGIN=1 환경 전용). AI 대전 한 판을 픽 → 스펠·덱 → 전투 → 결과까지 해 보는 느낌 확인용.
// 서버 엔진·AI·방(DO)은 실제 것을 그대로 쓰고(POST /v1/practice + 방 WebSocket), 그림은 어드민에 등록한 에셋(/v1/assets)으로 그린다.
// 화면 배치: 상세 01 전투 UI·조작(위 상대 · 가운데 필드 · 아래 나), 카드: 전투카드 구성 규격 가안(기획지시 2026-10-30), 캐릭터 카드: BO 카드 미리보기와 같은 방식.
// 빠진 것: 소리, 다듬은 효과, 컷인, 튜토리얼, 감정표현. 실제 클라이언트는 Godot(총괄 13장).
export const PLAY_PAGE = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Chrono Arcadia</title>
<style>
:root{--bg:#0d1020;--pan:rgba(14,18,36,.78);--line:rgba(255,255,255,.12);--tx:#F2F0E8;--mu:#9aa0b8;--acc:#7fb4ff;--hp:#4fd17a;--sh:#5aa8ff;--bad:#ff6b6b;--gold:#ffd56b;--cw:110px;--sw:90px}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;overscroll-behavior:none;touch-action:manipulation;-webkit-touch-callout:none;-webkit-text-size-adjust:100%;background:var(--bg);color:var(--tx);font:14px/1.4 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;overflow:hidden;user-select:none;-webkit-user-select:none}
button{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--line);background:rgba(255,255,255,.08);border-radius:10px;padding:8px 14px}
button:disabled{opacity:.4;cursor:default}
button.pri{background:linear-gradient(180deg,#4f8dff,#2b5fd0);border-color:#7fb4ff;font-weight:700}
button.on{outline:2px solid var(--acc);background:rgba(127,180,255,.2)}
#app{position:fixed;inset:0;background:#0d1020 center/cover no-repeat}
#rot{display:none}
@media (orientation:portrait) and (pointer:coarse){#rot{display:flex;position:fixed;inset:0;z-index:200;background:#0d1020;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px}#rot b{font-size:20px}#rot i{font-style:normal;font-size:54px;animation:rot 1.6s infinite}}
@keyframes rot{0%,30%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
#net{position:fixed;left:0;right:0;top:0;z-index:120;text-align:center;font-weight:700;font-size:13px;padding:max(6px,var(--st,0px)) 12px 6px;background:#c99a1f;color:#1b1400}
#net.off{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(8,10,22,.92);color:var(--tx);font-size:18px}
.hint{max-width:420px;background:rgba(127,180,255,.12);border:1px solid rgba(127,180,255,.35);border-radius:12px;padding:8px 12px;font-size:13px}
#app::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(8,10,22,.25),rgba(8,10,22,.75))}
.scr{position:absolute;inset:0;display:flex;flex-direction:column;padding:max(12px,var(--st,0px)) max(10px,var(--sr,0px)) max(12px,var(--sb,0px)) max(10px,var(--sl,0px))}
.mu{color:var(--mu)}.small{font-size:12px}
h1{margin:0;font-size:28px;letter-spacing:2px}
.home{align-items:center;justify-content:center;gap:16px;text-align:center}
.home input{background:rgba(0,0,0,.4);border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:9px 12px;font:inherit;width:180px;text-align:center}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px}
.chips{display:flex;gap:6px}.chip{padding:3px 10px;border-radius:99px;border:1px solid var(--line);font-size:12px;color:var(--mu);background:rgba(0,0,0,.3)}
.chip.on{color:#fff;border-color:var(--acc);background:rgba(79,141,255,.35)}
.timer{font-weight:800;font-size:18px;min-width:44px;text-align:center}.timer.red{color:var(--bad)}
/* 캐릭터 카드(BO 카드 미리보기와 같은 구조) */
.pvc{--mx:.5;--my:.5;--px:0;--py:0;position:relative;width:var(--w,150px);aspect-ratio:5/7;transform:perspective(800px) rotateX(calc(var(--py)*-7deg)) rotateY(calc(var(--px)*9deg));container-type:inline-size;flex:none}
.pvb{position:absolute;inset:0;border-radius:6%/4.3%;overflow:hidden;isolation:isolate;background:#223;box-shadow:0 10px 24px -10px rgba(0,0,0,.6)}
.pvl{position:absolute;inset:0;pointer-events:none}.pvbg{background-size:cover;background-position:center}
.pvwin{position:absolute;left:0;top:0;width:100%;height:100%}  /* 5:7 카드 영역 = 카드 본체 전체(기획지시 2026-11-06 카드영역5대7, 그림 창 720×960 폐기) */.pvchar{background-repeat:no-repeat}
.pvname{top:auto;height:22%;display:flex;flex-direction:column;justify-content:flex-end;padding:0 7cqw 5cqw;color:#F7F5EE;font-weight:700;font-size:max(11px,8cqw);line-height:1.15;background:linear-gradient(to top,rgba(8,10,22,.9),rgba(8,10,22,0))}
.pvname small{font-size:max(9px,5cqw);font-weight:500;opacity:.8}
.pvhb,.pvhf,.pvsp,.pvgl{display:none}
.pvhb{background-image:repeating-linear-gradient(112deg,#ff8a8a 0%,#ffd56b 7%,#93f2a5 14%,#7fd3ff 21%,#b894ff 28%,#ff8a8a 35%);background-size:260% 260%;background-position:calc(var(--mx)*100%) calc(var(--my)*100%);mix-blend-mode:color-dodge;filter:hue-rotate(calc(var(--px)*50deg)) saturate(1.2);opacity:.32}
.pvhf{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 2px,transparent 2px 7px),repeating-linear-gradient(112deg,#ff8a8a 0%,#ffd56b 7%,#93f2a5 14%,#7fd3ff 21%,#b894ff 28%,#ff8a8a 35%);background-size:100% 100%,240% 240%;background-position:0 0,calc(var(--mx)*100%) calc(var(--my)*100%);mix-blend-mode:overlay;opacity:.4}
.pvsp{background-image:radial-gradient(circle,#fff 0 1.1px,transparent 1.8px),radial-gradient(circle,#fff 0 .8px,transparent 1.4px);background-size:37px 41px,23px 27px;background-position:calc(var(--mx)*40px) calc(var(--my)*30px),calc(var(--mx)*-26px) calc(var(--my)*-34px);mix-blend-mode:color-dodge;-webkit-mask-image:radial-gradient(circle at calc(var(--mx)*100%) calc(var(--my)*100%),#000 0%,transparent 52%);mask-image:radial-gradient(circle at calc(var(--mx)*100%) calc(var(--my)*100%),#000 0%,transparent 52%);opacity:.5}
.pvgl{background:radial-gradient(circle at calc(var(--mx)*100%) calc(var(--my)*100%),rgba(255,255,255,.55) 0%,rgba(255,255,255,0) 48%);mix-blend-mode:soft-light}
.pvring{position:absolute;inset:0;border-radius:6%/4.3%;padding:3.5cqw;pointer-events:none;background:linear-gradient(105deg,transparent calc(var(--mx)*100% - 16%),rgba(255,255,255,.95) calc(var(--mx)*100%),transparent calc(var(--mx)*100% + 16%));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);mix-blend-mode:screen;opacity:0}
.pvc.h1 .pvring,.pvc.h2 .pvring,.pvc.h3 .pvring,.pvc.h4 .pvring{opacity:1}
.pvc.h2 .pvhb,.pvc.h3 .pvhb,.pvc.h4 .pvhb,.pvc.h2 .pvgl,.pvc.h3 .pvgl,.pvc.h4 .pvgl{display:block}
.pvc.h3 .pvhf,.pvc.h4 .pvhf,.pvc.h3 .pvsp,.pvc.h4 .pvsp{display:block}
.pvc.h4 .pvbg{transform:translate3d(calc(var(--px)*-6%),calc(var(--py)*-5%),0) scale(1.12)}
.pvc.h4 .pvchar{transform:translate3d(calc(var(--px)*4%),calc(var(--py)*3%),0) scale(1.04)}
.pvframe{position:absolute;left:-8%;top:-5.714%;width:116%;height:111.428%;pointer-events:none;background-size:100% 100%}
.pvbadge{position:absolute;right:4%;top:2.8%;width:20%;aspect-ratio:1;background-size:contain;background-repeat:no-repeat;pointer-events:none}
.pvfac{position:absolute;left:5%;top:3%;width:15%;aspect-ratio:1;background-size:contain;background-repeat:no-repeat;pointer-events:none}
.pick .pvc{cursor:pointer;transition:filter .15s}
.pvc.ban{filter:grayscale(1) brightness(.45)}.pvc.ban::after{content:"밴됨";position:absolute;inset:40% 0 auto;text-align:center;font-weight:800;font-size:12cqw;color:#ff9a9a}
.pvc.sel{outline:3px solid var(--acc);outline-offset:4px;border-radius:6%/4.3%}
/* 전투카드(구성 규격 가안) */
.bc{position:relative;width:var(--w,110px);aspect-ratio:5/7;container-type:inline-size;border-radius:6%/4.3%;overflow:hidden;background:#223;box-shadow:0 8px 18px -8px rgba(0,0,0,.7);color:#F7F5EE;flex:none;transition:transform .15s,filter .15s,opacity .15s}
.bc .l{position:absolute;inset:0;pointer-events:none}.bc .art{background-size:cover;background-position:center}
.bc .symt{position:absolute;left:0;right:0;top:27%;text-align:center;font-size:12cqw;font-weight:700;opacity:.85}
.bc .frm{background-size:100% 100%}
.bc .shade{top:auto;height:40%;background:linear-gradient(to top,rgba(8,10,22,.88),rgba(8,10,22,0))}
.bc .sock{position:absolute;width:20%;aspect-ratio:1;transform:translate(-50%,-50%);display:grid;place-items:center}
.bc .sock.c{left:12.5%;top:8.929%}.bc .sock.k{left:87.5%;top:8.929%}
.bc .sock.c b{font-size:11cqw;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.bc .sock.nos{border-radius:50%;background:radial-gradient(circle at 35% 30%,#7fc8ff,#1d5fae 70%);border:.6cqw solid rgba(255,255,255,.8)}
.bc .sock.k.nos{background:rgba(0,0,0,.55)}.bc .sock .kt{font-size:4.6cqw;font-weight:700}
.bc .txt{position:absolute;left:0;right:0;bottom:0;padding:0 6cqw 6cqw}
.bc .txt .nm{font-weight:800;font-size:5.5cqw;line-height:1.2}
.bc .txt .tx{margin-top:1.75cqw;font-size:3.6cqw;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.bc.hand .txt{top:60%;padding:0 6cqw;display:flex;align-items:center}.bc.hand .txt .nm{font-size:13cqw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bc .own{position:absolute;left:4%;top:20%;padding:.5cqw 2.4cqw;border-radius:99px;background:rgba(255,215,120,.9);color:#2a1d00;font-size:5.5cqw;font-weight:800}
.bc.back{background:#223 center/cover no-repeat}
.bc .stamp{position:absolute;inset:38% -6% auto;transform:rotate(-14deg);text-align:center;font-weight:900;font-size:17cqw;color:#ff6b6b;border:1.2cqw solid #ff6b6b;border-radius:3cqw;background:rgba(20,0,0,.55);animation:pop .25s}
.bc.lit{transform:scale(1.08);box-shadow:0 0 0 3px #fff,0 0 22px 4px rgba(127,180,255,.9)}
.bc.cant{filter:grayscale(.9) brightness(.6)}.bc.dim{opacity:.55}
.bc.lock::after{content:"🔒";position:absolute;inset:30% 0 auto;text-align:center;font-size:20cqw}
.bc.picked{transform:translateY(-7%);box-shadow:0 0 0 3px var(--acc),0 10px 22px -6px rgba(79,141,255,.8)}
/* 전투 화면 */
.bt{display:grid;grid-template-rows:auto 1fr auto;gap:6px}
.side{display:flex;align-items:center;gap:10px;background:var(--pan);border:1px solid var(--line);border-radius:14px;padding:6px 10px;backdrop-filter:blur(4px);position:relative}
.face{width:54px;height:54px;border-radius:50%;flex:none;background:#334 center/cover no-repeat;border:2px solid rgba(255,255,255,.5);overflow:hidden;position:relative}
.face.dim{filter:grayscale(.6) brightness(.7)}
.info{flex:1;min-width:0}.nmrow{display:flex;gap:6px;align-items:center;font-weight:700;white-space:nowrap;overflow:hidden}
.nmrow i{width:16px;height:16px;background-size:contain;flex:none}
.hpbar{position:relative;height:12px;border-radius:6px;background:rgba(0,0,0,.55);overflow:hidden;margin:4px 0 3px}
.hpbar .gh{position:absolute;inset:0 auto 0 0;background:#ffdf7a;transition:width .6s .25s}
.hpbar .hp{position:absolute;inset:0 auto 0 0;background:var(--hp);transition:width .25s}
.hpbar .sh{position:absolute;top:0;bottom:0;background:var(--sh);opacity:.9;transition:all .25s}
.hptx{font-size:12px;color:#dfe3f0;display:flex;gap:8px;flex-wrap:wrap}
.sts{display:flex;gap:3px;flex-wrap:wrap}.sts i{width:20px;height:20px;background:rgba(0,0,0,.4) center/contain no-repeat;border-radius:5px;font-style:normal;font-size:10px;display:grid;place-items:center;position:relative}
.sts i b{position:absolute;right:-3px;bottom:-4px;font-size:9px;background:#000;border-radius:5px;padding:0 2px}
.gauge{height:4px;background:rgba(0,0,0,.5);border-radius:2px;overflow:hidden;margin-top:3px}.gauge i{display:block;height:100%;background:linear-gradient(90deg,#b894ff,#ffd56b)}
.spl{display:flex;gap:6px;align-items:center}
.sp{width:44px;height:44px;border-radius:10px;background:rgba(0,0,0,.4) center/78% no-repeat;border:1px solid var(--line);position:relative;padding:0;flex:none}
.sp b{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.6);border-radius:10px;font-size:16px}
.sp.on{outline:3px solid var(--acc);outline-offset:1px}
.sp small{position:absolute;left:0;right:0;bottom:-15px;font-size:10px;color:var(--mu);white-space:nowrap;text-align:center}
.backs{display:flex;justify-content:center}.backs .bc{margin-left:calc(var(--w)*-.55)}.backs .bc:first-child{margin-left:0}
.field{display:flex;flex-direction:column;justify-content:center;gap:6px;min-height:0}
.slots.opp{margin-bottom:16px}.slots:not(.opp){margin-top:18px}
.slots{display:flex;justify-content:center;gap:10px;position:relative}
.slot{width:var(--sw);aspect-ratio:5/7;border:2px dashed rgba(255,255,255,.18);border-radius:6%/4.3%;display:grid;place-items:center;color:var(--mu);font-size:12px;flex:none;position:relative}
.slot.mine{border-color:rgba(127,180,255,.35)}
.slot .lab{position:absolute;left:50%;top:calc(-1.45em - 5px);transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:700;color:#d6e4ff;background:rgba(10,14,30,.85);border:1px solid rgba(127,180,255,.45);border-radius:99px;padding:1px 8px;z-index:4}
.slots.opp .slot .lab{top:auto;bottom:calc(-1.45em - 5px)}
.slots .tag{position:absolute;left:50%;top:-12px;transform:translateX(-50%);font-size:11px;font-weight:700;padding:1px 8px;border-radius:99px;background:#2b8a4b;z-index:5}
.slots.old .slot>.bc{opacity:.5}.slots.old .tag{background:#555b78}
.bc{-webkit-touch-callout:none}
.slot>.bc{position:absolute;inset:-2px;width:auto}
.done{position:absolute;right:-6px;top:-10px;background:#2b8a4b;color:#fff;border-radius:99px;font-size:11px;padding:1px 8px;font-weight:700;z-index:3}
.mid{display:flex;align-items:center;justify-content:center;gap:12px}
.ring{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:17px;background:conic-gradient(var(--acc) calc(var(--p,1)*360deg),rgba(255,255,255,.12) 0);position:relative;flex:none}
.ring::before{content:"";position:absolute;inset:5px;border-radius:50%;background:#12162a}.ring span{position:relative}
.ring.red{--acc:#ff6b6b}.ring.red span{color:#ff8a8a}
.turn{font-weight:800;font-size:15px;text-align:center;min-width:56px}.turn small{display:block;font-size:11px;color:var(--mu);font-weight:500}
.rush{color:#ff9a6b}
.bot{display:grid;grid-template-columns:minmax(200px,1fr) auto minmax(200px,1fr);gap:8px;align-items:end}
.hand{display:flex;justify-content:center;align-items:flex-end;padding-top:18px;min-width:0}
.hand .bc{cursor:pointer;-webkit-touch-callout:none}.hand.ov .bc+.bc{margin-left:calc(var(--cw)*-.3)}.hand:not(.ov) .bc+.bc{margin-left:6px}
.hand .bc:hover{z-index:6;transform:translateY(-4%)}.hand .bc.picked:hover{transform:translateY(-8%)}
.ctl{display:flex;flex-direction:column;gap:8px;align-items:stretch;background:var(--pan);border:1px solid var(--line);border-radius:14px;padding:8px 10px;backdrop-filter:blur(4px)}
.orbs{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.orbs i{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#bfe3ff,#2a7ade 70%);box-shadow:0 0 6px rgba(90,168,255,.8)}
.orbs i.use{background:rgba(255,255,255,.15);box-shadow:none}
.confirm{font-size:16px;padding:12px 10px}
.act{margin-top:6px;width:100%;font-weight:800}.act.ready{background:linear-gradient(90deg,#8a5cff,#ffb84d);border-color:#ffd56b;animation:glow 1.2s infinite alternate}
@keyframes glow{to{box-shadow:0 0 16px rgba(255,213,107,.8)}}
@keyframes pop{from{transform:rotate(-14deg) scale(1.6);opacity:0}}
@keyframes fl{0%{transform:translate(-50%,0) scale(.7);opacity:0}15%{transform:translate(-50%,-10px) scale(1.15);opacity:1}100%{transform:translate(-50%,-60px) scale(1);opacity:0}}
.float{position:absolute;left:50%;top:10px;font-weight:900;font-size:24px;text-shadow:0 2px 4px #000,0 0 2px #000;animation:fl 1.1s forwards;pointer-events:none;z-index:9;white-space:nowrap}
.float.crit{color:var(--gold);font-size:32px}.float.abs{color:var(--sh)}.float.heal{color:var(--hp)}.float.burn{color:#ff9a4d}
.banner{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 26px;border-radius:12px;background:rgba(10,12,28,.88);border:1px solid var(--acc);font-weight:800;font-size:20px;z-index:20;pointer-events:none;animation:ban 1.3s forwards;white-space:nowrap}
@keyframes ban{0%{opacity:0;transform:translate(-50%,-50%) scale(.8)}12%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0}}
.peek{position:fixed;left:50%;top:6%;transform:translateX(-50%);z-index:60;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:8px;filter:drop-shadow(0 12px 30px rgba(0,0,0,.8))}
.pinfo{background:rgba(14,18,36,.96);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:15px;line-height:1.45}.pinfo p{margin:6px 0 0}
.cap{min-height:24px;text-align:center;font-size:14px;font-weight:600;color:#e8ecff;opacity:0;transition:opacity .15s;padding:0 8px;line-height:1.35}
.cap.show{opacity:1;text-shadow:0 1px 3px #000}.cap.bad{color:#ff9a9a}.cap.warn{color:#ffcf6b}
.cn{border-bottom:1px dotted rgba(255,255,255,.5);cursor:help}
.log .lh{color:var(--acc);margin-top:6px;font-weight:700}.log>div{padding:1px 0}
.toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(20,22,40,.95);border:1px solid var(--line);padding:8px 16px;border-radius:10px;z-index:99;font-size:13px;max-width:90vw}
.dlg{position:fixed;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:98}.dlg>div{background:#171b30;border:1px solid var(--line);border-radius:14px;padding:18px;max-width:320px;text-align:center}
.log{position:absolute;right:10px;top:60px;bottom:10px;width:min(320px,86vw);background:rgba(10,12,26,.95);border:1px solid var(--line);border-radius:12px;padding:10px;overflow:auto;z-index:30;font-size:12px;white-space:pre-wrap}
.res{align-items:center;justify-content:center;gap:14px;text-align:center}
.vs{display:flex;align-items:center;gap:14px}.vs b{font-size:22px;color:var(--mu)}
.res h2{margin:0;font-size:56px;letter-spacing:6px}.rtext{display:flex;flex-direction:column;align-items:center;gap:10px}
.res.short{display:grid;grid-template-columns:auto auto;grid-template-rows:auto auto;align-content:center;justify-content:center;gap:6px 28px}.res.short .vs{grid-row:1/3;grid-column:1}.res.short .rtext{grid-column:2}.res.short h2{font-size:38px}.res h2.win{color:var(--gold);text-shadow:0 0 24px rgba(255,213,107,.6)}.res h2.lose{color:#c8cbe0;opacity:.85}
/* 좁은 화면(휴대폰 세로) */
@media (max-width:760px){
 .bot{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);grid-template-areas:"me ctl" "hand hand"}
 .top{gap:6px}.top .side{padding:5px 7px;gap:6px}.backs{display:none}.top .opps .spl{gap:3px}
 .opps .eng{font-size:10px}.opps button#logb,.opps button#menu{padding:6px 8px;font-size:12px}
 .mid{gap:6px}.chip{padding:2px 6px;font-size:11px}.chips{gap:3px}.ring{width:44px;height:44px;font-size:15px}.turn{min-width:44px;font-size:13px}
 .side{min-width:0}.info{min-width:0}.hptx{font-size:11px;gap:4px}.sts i{width:16px;height:16px}
 .ctl .row{gap:4px}.orbs i{width:12px;height:12px}.act{font-size:12px;padding:6px}.confirm{font-size:14px;padding:10px 6px}#tb{padding:8px 6px;font-size:12px}
 .bot .me{grid-area:me}.bot .ctl{grid-area:ctl}.bot .hand{grid-area:hand;padding-top:14px}
 .face{width:38px;height:38px}.sp{width:38px;height:38px}.ctl{padding:6px 8px;gap:6px}
 .top .opps .sp{width:30px;height:30px}
 h1{font-size:22px}.res h2{font-size:44px}
 .spg{grid-template-columns:repeat(4,1fr)}
}
/* 효과 연출·스펠/액티브 칸·처리 순서 막대(기획지시 효과연출) */
.slot.k-attack,.slot.k-defense,.slot.k-counter,.slot.k-silence,.slot.k-immune,.slot.k-disrupt,.slot.k-skill,.slot.k-spell,.slot.k-active{border-style:solid}
.cell{position:absolute;inset:-2px;border-radius:6%/4.3%;background:rgba(14,18,36,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;container-type:inline-size;overflow:hidden}
.cell i{width:58%;aspect-ratio:1;background:center/contain no-repeat;display:grid;place-items:center;font-style:normal;font-size:14cqw;font-weight:800}
.cell b{font-size:max(9px,11cqw);text-align:center;line-height:1.15;padding:0 4%}
.cell em{position:absolute;right:4%;top:3%;font-style:normal;font-size:max(8px,9cqw);font-weight:800;background:#2b8a4b;border-radius:99px;padding:0 5px}
.acc .af{width:62%;aspect-ratio:1;border-radius:50%;background:#334 center/cover no-repeat;position:relative;border:2px solid #2ec4c4}.acc .af s{position:absolute;inset:-14%;background:center/100% 100% no-repeat}
.oppmid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0}
.hc{display:flex;align-items:center;gap:3px;font-size:12px;color:var(--mu)}.hc .bk{width:14px;height:20px;border-radius:3px;background:#2a3a7a center/cover}
.recent{display:flex;gap:6px;align-items:center}.recent .rt{display:flex;gap:2px;align-items:center}.recent small{font-size:9px;color:var(--mu);margin-right:1px}
.recent i{width:18px;height:18px;border-radius:5px;display:grid;place-items:center;font-style:normal;font-size:10px;font-weight:800;color:#0b0e1c;cursor:help}.recent em{font-size:10px;color:var(--mu)}
.obar{display:flex;gap:4px;align-items:center;flex-wrap:nowrap}
.obar i{min-width:26px;height:26px;border-radius:7px;display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:800;color:#0b0e1c;position:relative;border:2px solid #fff;transition:opacity .2s,transform .2s}
.obar i.opp{border:2px dashed #ff6b9a}.obar i sub{position:absolute;right:-3px;bottom:-5px;font-size:9px;color:#fff;background:#000;border-radius:4px;padding:0 2px}
.obar i.now{transform:scale(1.18);box-shadow:0 0 12px 3px rgba(255,255,255,.8)}.obar i.past{opacity:.35}
.bc.lit{box-shadow:0 0 0 3px var(--kc,#fff),0 0 22px 4px var(--kc,rgba(127,180,255,.9))}
.zoom{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);z-index:35;pointer-events:none;animation:zm .5s ease-out both}
@keyframes zm{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}20%{opacity:1;transform:translate(-50%,-50%) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(.9)}}
.zw{background:rgba(10,12,26,.92);border:2px solid var(--kc);border-radius:14px;padding:8px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;max-width:min(320px,80vw);box-shadow:0 0 30px var(--kc)}
.zw p{margin:0;font-size:13px;text-align:center;line-height:1.35}.zt{font-weight:800}.zt span{font-size:11px;padding:1px 7px;border-radius:99px;background:#2b5fd0;margin-right:4px}.zw.opp .zt span{background:#b23a63}
.zi{width:64px;height:64px;background:center/contain no-repeat}.zi.face{border-radius:50%;background-size:cover;border:2px solid var(--kc)}
.orb{position:absolute;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#fff 0 20%,var(--kc) 55%,transparent 72%);box-shadow:0 0 16px 6px var(--kc);z-index:36;pointer-events:none;transform:translate(-50%,-50%)}
.orb.brk{animation:brk .25s forwards}@keyframes brk{to{opacity:0;width:60px;height:60px;filter:blur(3px)}}
.side.hit{animation:hit .35s}@keyframes hit{0%{box-shadow:0 0 0 0 var(--kc)}40%{box-shadow:0 0 0 4px var(--kc),0 0 24px 6px var(--kc)}100%{box-shadow:none}}
.wait{position:absolute;left:8px;top:-10px;font-size:10px;font-weight:800;background:#ff9a3c;color:#1b1000;border-radius:99px;padding:0 6px;z-index:5}
.first{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:34;background:#171b30;border:1px solid var(--gold);border-radius:10px;padding:6px 12px;font-size:12px;max-width:min(420px,90vw);text-align:center;pointer-events:none}
.first b{color:var(--gold);margin-right:4px}
.lockt{position:absolute;left:0;right:0;top:34%;text-align:center;font-size:max(9px,9cqw);font-weight:800;color:#ffb3b3;text-shadow:0 1px 2px #000}
.act.lockb{background:rgba(120,60,160,.35);border-color:#a86bff}.sp.cd{filter:saturate(.4)}
.rushc{margin-left:4px;background:rgba(255,120,60,.25);border-color:#ff9a6b;color:#ffcfb0;padding:1px 6px;font-size:10px}
.tip{position:fixed;z-index:70;background:rgba(14,18,36,.97);border:1px solid var(--line);border-radius:8px;padding:5px 9px;font-size:12px;max-width:min(320px,80vw);pointer-events:none}
.kd{display:inline-block;width:6px;height:12px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.calcb{padding:0 6px;font-size:10px;margin-left:5px;border-radius:5px;vertical-align:1px}
table.calc{border-collapse:collapse;margin:8px 0;font-size:13px;width:100%}table.calc td{padding:2px 6px;border-bottom:1px solid var(--line);text-align:left}table.calc td+td{text-align:right}
.sumL{color:#ffe7a3;font-weight:700}
@media (max-height:500px){
 .obar i{min-width:24px;height:24px;font-size:11px}.recent i{width:16px;height:16px;font-size:9px}.zi{width:48px;height:48px}.zw{padding:6px 10px}.zw p{font-size:12px}
 .scr{padding:max(12px,var(--st,0px)) max(8px,var(--sr,0px)) max(12px,var(--sb,0px)) max(8px,var(--sl,0px))}
 .home{gap:10px}h1{font-size:22px}.bt{gap:2px}.top{min-height:0}
 .face{width:34px;height:34px}.side{padding:3px 8px;gap:6px;border-radius:10px}.hpbar{height:8px;margin:2px 0}.hptx{font-size:10px}.nmrow{font-size:13px}
 .sp{width:30px;height:30px}.sp small{display:none}.opps button{padding:4px 8px;font-size:12px}.eng{font-size:10px}.eng b{font-size:13px!important}
 .ring{width:36px;height:36px;font-size:13px}.ring::before{inset:4px}.chip{padding:1px 6px;font-size:10px}.turn{font-size:12px;min-width:44px}.turn small{font-size:9px}
 .cap{min-height:16px;font-size:12px}.field{gap:1px}.slots.opp{margin-bottom:12px}.slots:not(.opp){margin-top:13px}.slot .lab{font-size:9px;padding:0 5px;top:calc(-1.45em - 2px)}.slots.opp .slot .lab{bottom:calc(-1.45em - 2px)}
 .ctl{padding:5px 7px;gap:4px;border-radius:10px}.act{padding:4px;font-size:11px;margin-top:0}.confirm{padding:7px 6px;font-size:13px}#tb,#spd{padding:6px;font-size:11px}.orbs i{width:11px;height:11px}
 .hand{padding-top:10px}.bot{grid-template-columns:minmax(150px,1fr) auto minmax(170px,1fr)}
 .grid{gap:12px 10px;padding:8px 4px}.res{gap:8px}.res h2{font-size:38px}.box{padding:8px}.spb{padding:4px 2px}.spb i{width:28px;height:28px}
}

.pickg{flex:1;min-height:0;display:flex;flex-wrap:wrap;justify-content:center;align-content:center;margin:0 auto}
.bar{justify-content:space-between;flex-wrap:nowrap;min-height:40px}.line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1;text-align:right}
.lo{display:flex;gap:16px;flex:1;min-height:0;align-items:center;justify-content:center;overflow:hidden}
.lcol{display:flex;flex-direction:column;gap:14px;align-items:center}
.rcol{display:flex;flex-direction:column;gap:8px;min-width:0;background:var(--pan);border:1px solid var(--line);border-radius:14px;padding:10px}
.rcol .line{text-align:left;flex:none}
.spg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.spb{display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 6px;font-size:12px;border-radius:10px;min-width:0}
.spb i{height:70%;aspect-ratio:1;background:center/contain no-repeat;flex:none}.spb span{display:flex;flex-direction:column;align-items:flex-start;min-width:0}.spb b{white-space:nowrap}.spb small{color:var(--mu);font-size:10px}
.deck{display:grid;gap:6px;justify-content:center}
button.sm{padding:5px 10px;font-size:12px}
.log{position:absolute;right:10px;top:56px;bottom:10px;width:min(340px,86vw);background:rgba(10,12,26,.96);border:1px solid var(--line);border-radius:12px;padding:8px 10px;z-index:30;font-size:12px;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.ltabs{display:flex;gap:3px;flex-wrap:wrap}.ltabs button{padding:2px 7px;font-size:11px;border-radius:6px}.lbody{flex:1;min-height:0;overflow:hidden}.lbody div{line-height:20px;height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lnav{display:flex;justify-content:space-between;align-items:center}.lnav button{padding:3px 10px;font-size:12px}
.menu{position:absolute;top:56px;left:10px;z-index:40;background:#171b30;border:1px solid var(--line);border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:4px;min-width:160px}.menu button{text-align:left}
.guide{position:absolute;inset:0;z-index:45;background:rgba(6,8,20,.55);display:flex;align-items:center;justify-content:center}
.guide .gc{background:#171b30;border:1px solid var(--acc);border-radius:14px;padding:14px 18px;max-width:min(460px,90vw);box-shadow:0 10px 40px rgba(0,0,0,.6)}
.guide .gc h4{margin:0 0 6px;font-size:15px}.guide .gc p{margin:0 0 8px;font-size:14px;line-height:1.45}.guide .gc .row{justify-content:space-between}
.guide.bubble{inset:auto;left:50%;top:40%;transform:translateX(-50%);background:none}
.hl{outline:3px solid var(--gold)!important;outline-offset:3px;border-radius:12px;position:relative;z-index:46;animation:hlp 1s infinite alternate}
@keyframes hlp{to{outline-color:rgba(255,213,107,.3)}}
.bot{grid-template-areas:"me hand ctl"}.bot .me{grid-area:me}.bot .hand{grid-area:hand}.bot .ctl{grid-area:ctl}.bt.lefty .bot{grid-template-areas:"ctl hand me"}.bt.lefty .top{flex-direction:row-reverse}
.peek .aff{font-size:13px;color:#ffd98a;margin-top:4px}
@media (max-width:760px){.bt.lefty .bot{grid-template-areas:"ctl me" "hand hand"}}
@media (max-height:500px){.lcol{gap:8px}.rcol{padding:6px;gap:5px}.bar{min-height:34px}.bar button{padding:5px 12px}.home .keys{display:none}.log{top:48px}}

/* ===== 전투 화면 개편(기획지시 2026-11-01 전투UI개편): 고정 구역 + 가변 손패 ===== */
.bt2{display:grid;gap:4px var(--g);padding:max(var(--pad),var(--st,0px)) max(var(--pad),var(--sr,0px)) max(var(--pad),var(--sb,0px)) max(var(--pad),var(--sl,0px));
 grid-template-columns:var(--cardW) minmax(0,1fr) var(--cardW);grid-template-rows:var(--topH) minmax(0,1fr) var(--handH);
 grid-template-areas:"icons log oppc" "mec field oppc" "mec hand ctl"}
.bt2.lefty{grid-template-areas:"oppc log icons" "oppc field mec" "ctl hand mec"}
.bt2 .icons{grid-area:icons;display:flex;gap:5px;align-items:center;min-width:0}
.bt2 .ib{height:calc(var(--topH) - 2px);min-width:calc(var(--topH) - 2px);padding:0 6px;border-radius:9px;border:1px solid var(--line);background:rgba(14,18,36,.8) center/80% no-repeat;display:inline-flex;align-items:center;justify-content:center;gap:3px;font-size:12px;font-weight:700;position:relative;cursor:pointer}
.bt2 .ib.sp2{padding:0}.bt2 .ib.cd{filter:saturate(.4)}.bt2 .ib b{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.6);border-radius:9px}
.bt2 .ib .bk{display:inline-block;width:10px;height:14px;border-radius:2px;background:#2a3a7a center/cover;text-decoration:none}
.bt2 .logline{grid-area:log;align-self:stretch;display:flex;flex-direction:column;justify-content:center;background:rgba(14,18,36,.7);border:1px solid var(--line);border-radius:9px;padding:0 10px;cursor:pointer;min-width:0;overflow:hidden}
.bt2 .logline div{font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bt2 .logline div:not(:last-child){opacity:.6;font-size:11px}
.bt2 .oppc{grid-area:oppc;display:flex;flex-direction:column;gap:4px;min-height:0}
.bt2 .mec{grid-area:mec;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;min-height:0}
.bt2 .field{grid-area:field;min-height:0}.bt2 .hand{grid-area:hand;padding-top:0;align-items:flex-end;min-height:0}.bt2 .ctl{grid-area:ctl;padding:6px 8px;gap:5px;justify-content:space-between;min-height:0}
.bt2 .cc{width:var(--cardW);height:var(--cardH);flex:none;border-radius:16px;padding:6px;gap:8px;overflow:visible}
.bt2 .cc .face{width:calc(var(--cardH) - 12px);height:calc(var(--cardH) - 12px);border-radius:12px;border-width:1px}
.bt2 .cc .nmrow{font-size:13px;gap:4px}.bt2 .cc .nmrow span:first-of-type{overflow:hidden;text-overflow:ellipsis}.bt2 .okc{font-size:9px;padding:0 5px;margin-left:auto}
.bt2 .cc .hpbar{height:9px;margin:3px 0 2px}.bt2 .cc .hptx{font-size:11px;gap:6px;white-space:nowrap;overflow:hidden}
.bt2 .bdg{height:var(--bdgH);display:flex;flex-direction:column;gap:2px;overflow:hidden}
.bt2 .bg{display:flex;align-items:center;gap:4px;height:calc((var(--bdgH) - 4px)/3);font-size:11px;padding:0 6px;border-radius:6px;background:rgba(14,18,36,.75);border-left:3px solid var(--bc);white-space:nowrap;overflow:hidden;cursor:help}
.bt2 .bg i{width:13px;height:13px;flex:none;background:var(--bc) center/contain no-repeat;border-radius:3px}.bt2 .bg i[style*="url"]{background-color:transparent}
.bt2 .bg.more{border-left-color:#8a90a8;color:var(--mu)}.bt2 .bg.flash{animation:bfl .5s 3}@keyframes bfl{50%{background:var(--bc);color:#000}}
.bt2 .recent{flex-wrap:wrap;gap:4px}
.bt2 .slots{gap:4px;align-items:center}.bt2 .arr{color:var(--mu);font-size:16px;font-weight:800;flex:none;width:8px;text-align:center}
.bt2 .slot .lab{display:flex;align-items:center;gap:3px;padding:0 6px 0 0;font-size:10px;border-radius:99px}
.bt2 .slot .lab .num{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;color:#0b0e1c;font-size:12px;font-weight:900;margin-left:-1px;box-shadow:0 0 0 2px rgba(10,14,30,.9)}
.bt2 .chips{flex-wrap:nowrap}.bt2 .mid{gap:8px}
.bt2 .bc.face2 .txt{top:50%;display:flex;flex-direction:column;justify-content:flex-start;padding:0 5cqw}
.bt2 .bc.face2 .txt .nm{font-size:max(10px,12cqw);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt2 .bc.face2 .sht{font-size:max(9px,8.5cqw);line-height:1.2;margin-top:1px;opacity:.92;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:keep-all}
.bt2 .bc.face2 .shade{height:55%}
.bt2 .fr1{color:var(--hp);margin-left:4px}
.bt2 .log{top:calc(var(--topH) + var(--pad) + 4px)}.bt2 .menu{top:calc(var(--topH) + var(--pad) + 4px)}
.bt2 .first{bottom:calc(var(--handH) + var(--pad))}
.manual{position:absolute;left:50%;bottom:calc(var(--handH) + var(--pad) + 4px);transform:translateX(-50%);z-index:33;background:rgba(43,95,208,.9);border-radius:99px;padding:4px 14px;font-size:12px;font-weight:700;pointer-events:none;animation:glow 1s infinite alternate}
.bt2.short .cc{border-radius:13px;padding:5px;gap:6px}.bt2.short .cc .nmrow{font-size:12px}.bt2.short .cc .hpbar{height:7px;margin:2px 0}.bt2.short .cc .hptx{font-size:10px}
.bt2.short .bg{font-size:10px}.bt2.short .slot .lab .num{width:17px;height:17px;font-size:10px}.bt2.short .slot .lab{font-size:9px}.bt2.short .ib{font-size:11px}
.bt2.short .logline div{font-size:11px}.bt2.short .logline div:not(:last-child){font-size:10px}
.bt2.short .ctl .row{gap:4px}.bt2.short .sp{width:28px;height:28px}

/* 밴·픽·결과(기획지시 밴픽결과화면) */
.pickg.r1{flex-wrap:nowrap;align-content:center;align-items:center;width:auto}
.pvc.rnd .pvb{border-radius:12%/8.6%}.pvc.rnd .pvring{display:none}.pvc.rnd .pvname{font-size:max(11px,11cqw)}.pvc.rnd .pvname small{font-size:max(9px,8cqw)}
.pinfo2{min-height:52px;text-align:center;padding:4px 10px;line-height:1.35}.pinfo2 .small{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.res2{flex-direction:row;align-items:center;justify-content:center;gap:24px}
.res2 .rmenu{position:absolute;right:max(12px,var(--sr,0px));top:max(10px,var(--st,0px));width:36px;height:32px;border-radius:9px;border:1px solid var(--line);background:rgba(14,18,36,.8);z-index:3}
.rleft{position:relative}.rart{position:relative;border-radius:18px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 65%,transparent);mask-image:linear-gradient(#000 65%,transparent)}
.rbg,.rch{position:absolute;inset:0}.res2.lose .rart{filter:saturate(.35) brightness(.65)}.res2.win .rart{box-shadow:0 0 50px rgba(255,213,107,.35)}
.rover{position:absolute;left:0;right:0;bottom:4%;text-align:center}.rover h2{margin:0;font-size:52px;letter-spacing:6px;text-shadow:0 2px 12px #000}
.res2.win .rover h2{color:var(--gold)}.res2.lose .rover h2{color:#c8cbe0}
.rright{display:flex;flex-direction:column;gap:12px;min-width:220px}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:6px}.stats .st{background:var(--pan);border:1px solid var(--line);border-radius:10px;padding:6px 10px;display:flex;flex-direction:column}
.stats .st small{color:var(--mu);font-size:11px}.stats .st b{font-size:18px}.stats .st:first-child{grid-column:1/3}
.rew{display:flex;flex-direction:column;gap:3px;font-size:14px}
@media (max-height:500px){.rover h2{font-size:36px}.stats .st b{font-size:15px}.stats .st{padding:4px 8px}.rright{gap:8px;min-width:200px}.pinfo2{min-height:44px}.pinfo2 .small{font-size:11px}}

/* ===== 밴·픽·스펠덱·결과 재배치(기획지시 2026-11-01 밴픽화면재배치) ===== */
.pk3 .top,.lo3 .top{margin-bottom:12px;min-height:40px}
.pk3b{flex:1;min-height:0;display:grid;grid-template-columns:var(--side) var(--cen) var(--side);gap:var(--g);justify-content:center}
.pcol{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:0}.pcol.me{justify-content:flex-end}.pcol.opp{justify-content:flex-start}
.pcol.me .lab2,.pcol.opp .lab2{font-weight:800;color:#fff;padding:1px 10px;border-radius:99px;background:#2b5fd0}.pcol.opp .lab2{background:#b23a63}.lab2{font-size:12px;color:var(--mu)}.pnm{font-size:14px}
.emp,.qcard{aspect-ratio:5/7;border-radius:12%/8.6%;border:2px dashed rgba(255,255,255,.2);display:grid;place-items:center;color:var(--mu);font-size:13px}
.qcard{border-style:solid;background:linear-gradient(160deg,#232a4a,#141a30);font-size:56px;font-weight:900;color:#5a6390}
.pmid{display:flex;flex-direction:column;min-height:0;gap:6px}
.plist{flex:1;min-height:0;overflow:hidden;display:flex;flex-wrap:wrap;justify-content:center;align-content:center;gap:8px;padding:2px 4px}.plist .pk{width:var(--pw);flex:none}
.plist.scr2{overflow-y:auto;align-content:flex-start;scroll-snap-type:y mandatory;scrollbar-width:thin;padding:12px 4px}
.plist.more{-webkit-mask-image:linear-gradient(#000 calc(100% - 28px),rgba(0,0,0,.35));mask-image:linear-gradient(#000 calc(100% - 28px),rgba(0,0,0,.35))}
.pk{position:relative;scroll-snap-align:start;border:2px solid transparent;border-radius:13%/9.3%;transition:border-color .12s,filter .12s;cursor:pointer}
.pk:hover{filter:brightness(1.12)}.pk.sel{border-color:var(--acc)}.pk.off{cursor:default}
.pk .ck{position:absolute;right:6%;bottom:22%;width:22px;height:22px;border-radius:50%;background:var(--acc);color:#fff;font-style:normal;font-weight:900;font-size:13px;display:grid;place-items:center;opacity:0;transition:opacity .12s}
.pk.sel .ck{opacity:1}
.pvc.rnd{transform:none!important}
.pband{height:var(--band);font-size:max(10px,11px);line-height:1.4;overflow:hidden;padding:0 6px}.pband div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pbar{margin-top:12px;justify-content:space-between;min-height:46px}
.rcol2{display:flex;flex-direction:column;gap:8px;min-width:0;justify-content:center}
.sprow{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}
.spb2{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border:2px solid transparent;background:rgba(14,18,36,.8);border-radius:10px;transition:border-color .12s,filter .12s;min-width:0}
.spb2 i{width:30px;height:30px;background:center/contain no-repeat;display:grid;place-items:center;font-style:normal;font-weight:800}.spb2 b{font-size:12px;white-space:nowrap}.spb2 small{font-size:10px;color:var(--mu)}
.spb2.on{border-color:var(--acc)}.spb2:hover{filter:brightness(1.15)}.spb2 em{position:absolute;right:3px;top:3px;width:16px;height:16px;border-radius:50%;background:var(--acc);font-style:normal;font-size:10px;font-weight:900;display:grid;place-items:center}
.line1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tabs{gap:6px;flex-wrap:nowrap}.tab2{border:2px solid transparent;background:rgba(255,255,255,.08)}.tab2.on{border-color:var(--acc);outline:none}
.deck2{display:grid;grid-template-columns:repeat(12,var(--dw));gap:4px;justify-content:start}.deck2.two{grid-template-columns:repeat(6,var(--dw));gap:6px}
.bc.mini .txt{display:none}.bc.mini .shade{height:25%}.bc.mini .sock{width:30%}.bc.mini .sock.c b{font-size:16cqw}.bc.mini .sock.c{left:17%;top:13%}.bc.mini .sock.k{left:83%;top:13%}.bc.mini .own{display:none}
.res3{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;background:#0b0d1a;padding:0 var(--sr,0px) 0 var(--sl,0px)}
.rl{position:relative;overflow:hidden}
.rimg{position:absolute;inset:max(8px,var(--st,0px)) 8px 0 8px;background:center top/100% 100% no-repeat;filter:drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.res3.lose .rimg{filter:saturate(.35) brightness(.65) drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.rr{position:relative;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:max(16px,var(--st,0px)) max(24px,var(--sr,0px)) max(16px,var(--sb,0px)) 24px}
.rr h2{margin:0;font-size:52px;letter-spacing:6px}.res3.win h2{color:var(--gold);text-shadow:0 0 24px rgba(255,213,107,.5)}.res3.lose h2{color:#c8cbe0}
.rr .rmenu{position:absolute;right:max(12px,var(--sr,0px));top:max(10px,var(--st,0px));width:36px;height:32px;border-radius:9px;border:1px solid var(--line);background:rgba(14,18,36,.8)}
@media (max-height:500px){.pk3 .top,.lo3 .top{margin-bottom:6px;min-height:30px;height:30px}.pk3 .top{margin-bottom:4px}.pbar{margin-top:6px;min-height:40px;height:40px}.pk3 .pbar{margin-top:4px}.pband{height:28px;font-size:10px;line-height:1.4}.rr h2{font-size:36px}.rr{gap:8px}.spb2{padding:4px 2px}.spb2 i{width:24px;height:24px}.spb2 b{font-size:11px}.pnm{font-size:12px}}

/* 카드 면 텍스트 뱃지(유형에너지텍스트): 왼쪽 위 비용 "2E"(남색), 오른쪽 위 유형(종류 색 배경). 휴대폰 손패 68pt에서도 9pt 이상 */
.bc .bdc,.bc .bdk{position:absolute;top:3.5%;font-size:max(9px,8.5cqw);line-height:1;font-weight:800;padding:.28em .45em;border-radius:99px;white-space:nowrap;z-index:2}
.bc .bdc{left:4%;background:rgba(10,14,30,.88);color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.55)}
.bc .bdk{right:4%;color:#0b0e1c}
.bc.mini .bdc,.bc.mini .bdk{top:4%;padding:.22em .3em}.bc.mini .bdc{left:3%}.bc.mini .bdk{right:3%}
.bc .own{top:17%}
.obar i{border-radius:50%!important}

/* ===== 사선 구도(기획지시 2026-11-01 사선구도) ===== */
.bt3{display:block!important;padding:0!important;position:absolute;inset:0}
.bt3>*{position:absolute}
.bt3 .icons{display:flex;gap:5px;align-items:center}
.bt3 .logline{display:flex}.bt3.rev .logline{display:none}
.bt3 .oppc,.bt3 .mec{display:flex;flex-direction:column;gap:var(--g)}
.bt3 .vc{position:relative;border-radius:12%/8.6%;overflow:hidden;flex:none;padding:0;background:#223;border:1px solid var(--line)}
.bt3 .vc .vfa{position:absolute;inset:0}.bt3 .vc .pvc{width:100%!important}.bt3 .vc .pvname{display:none}.bt3 .vc .pvbadge{display:none}
.bt3 .vbot{position:absolute;left:0;right:0;bottom:0;padding:16% 6% 5%;background:linear-gradient(to top,rgba(8,10,22,.95) 55%,rgba(8,10,22,0));display:flex;flex-direction:column;gap:2px}
.bt3 .vbot .nmrow{font-size:11px;gap:3px}.bt3 .vbot .nmrow i{width:12px;height:12px}.bt3 .vbot .hpbar{height:6px;margin:1px 0}.bt3 .vbot .hptx{font-size:10px;gap:4px;white-space:nowrap}
.bt3 .vbot .gauge{height:3px;margin-top:1px}.bt3 .vc .okc{position:absolute;right:4px;top:4px;z-index:3}
.bt3 .mec .act{width:100%;margin:0;padding:0 4px;font-size:11px;border-radius:8px}
.bt3 .opslots,.bt3 .meslots{display:flex;flex-direction:column;gap:4px}.bt3 .opslots{align-items:flex-end}
.bt3 .slots{display:flex;flex-direction:column;gap:18px;margin:0!important}.bt3 .slots .srow{display:flex;gap:4px;align-items:center}.bt3 .slots.opp{align-items:flex-end}
.bt3 .slots .tag{top:-12px}.bt3 .slots.opp .tag{top:50%;left:-6px;transform:translate(-100%,-50%)}
.bt3 .center{left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
.bt3 .center .turn{display:flex;align-items:center;gap:6px}.bt3 .center #phc{display:none}.bt3.rev .center #phc{display:flex}.bt3.rev .center .ring{display:none}
.bt3 .center .cap{min-height:0;font-size:11px;max-width:300px}
.bt3 .ctl{display:flex;flex-direction:column;gap:6px;padding:6px 8px}
.bt3 .recent{margin-top:18px}
.bub{position:absolute;z-index:34;max-width:min(320px,44vw);background:rgba(10,12,26,.95);border:1px solid var(--kc);border-radius:10px;padding:5px 9px;font-size:12px;line-height:1.35;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.bub.bad{color:#ff9a9a}.bub::after{content:"";position:absolute;left:50%;width:8px;height:8px;background:inherit;border:inherit;transform:translateX(-50%) rotate(45deg)}
.bub.me::after{bottom:-5px;border-top:0;border-left:0}.bub.opp::after{top:-5px;border-bottom:0;border-right:0}
.bt3 .zoom{top:50%}
.bt3 .first{bottom:auto;top:calc(var(--topH) + 14px)}
.dimv{position:absolute;inset:0;background:rgba(4,6,14,.62);z-index:30;pointer-events:none;animation:fi .15s}
@keyframes fi{from{opacity:0}}
.bt3 .up{z-index:31}
.bt3 .zoom{position:absolute;left:0;top:0;transform:none;animation:none;z-index:35}
.bc.done{filter:brightness(.55) saturate(.6)}.bc.locked{filter:grayscale(1) brightness(.55)}
.lk{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:max(14px,30cqw);z-index:4;pointer-events:none;text-shadow:0 1px 3px #000}
.lk small{font-size:max(9px,16cqw);font-weight:800;color:#ffb3b3;background:rgba(0,0,0,.6);border-radius:4px;padding:0 3px;margin-top:2px}
.bc.can{box-shadow:0 0 0 2px rgba(255,231,140,.9),0 0 10px 1px rgba(255,214,90,.55)}
.ring.wait{--acc:#7d8296}.ring.wait span{color:#aab0c4}
.cap.warn{font-size:11px;font-weight:600;color:#ffb3b3}
.bt3 .bdg{display:flex;flex-direction:column;gap:2px;height:auto;overflow:visible}.bt3 .bdg .bg{height:auto;min-height:18px;padding:2px 6px;line-height:1.25;white-space:normal;text-overflow:clip;overflow:visible;max-width:none;word-break:keep-all}
/* 턴 시작 배너(전투UX2차 4 + 사용자 요청 2026-11-01: 글자 부각): 띠가 펼쳐지고 글자가 크게 내려앉으며 빛이 훑고 지나감, 1.1초 */
.tban{position:fixed;left:0;right:0;top:50%;transform:translateY(-50%);z-index:60;pointer-events:none;display:flex;flex-direction:column;align-items:center;padding:10px 0 8px}
.tban::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(16,24,70,.92) 22%,rgba(16,24,70,.92) 78%,transparent);border-top:1px solid rgba(255,214,110,.7);border-bottom:1px solid rgba(255,214,110,.7);animation:tbb 1.1s cubic-bezier(.2,.9,.3,1) forwards}
.tban b{position:relative;font-size:clamp(32px,10vh,68px);line-height:1.05;font-weight:900;letter-spacing:4px;white-space:nowrap;color:transparent;background:linear-gradient(100deg,#fff 0 38%,#ffe9a0 46%,#fffbe8 50%,#ffe9a0 54%,#fff 62% 100%);background-size:260% 100%;-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 0 14px rgba(255,210,90,.75)) drop-shadow(0 2px 3px #000);animation:tbt 1.1s cubic-bezier(.2,1.5,.4,1) forwards,tbs 1.1s linear forwards}
.tban small{position:relative;margin-top:2px;font-size:clamp(12px,3.6vh,18px);font-weight:900;letter-spacing:2px;color:#ffb070;text-shadow:0 0 10px rgba(255,120,40,.8),0 1px 2px #000;animation:tbt2 1.1s ease-out forwards}
.tban.rush::before{background:linear-gradient(90deg,transparent,rgba(90,20,20,.92) 22%,rgba(90,20,20,.92) 78%,transparent);border-color:rgba(255,140,80,.85)}
.tban.rush b{background-image:linear-gradient(100deg,#fff 0 38%,#ffc28a 46%,#fff3e0 50%,#ffc28a 54%,#fff 62% 100%);filter:drop-shadow(0 0 16px rgba(255,110,40,.85)) drop-shadow(0 2px 3px #000)}
@keyframes tbb{0%{transform:scaleX(0);opacity:0}16%{transform:scaleX(1);opacity:1}82%{opacity:1}100%{opacity:0;transform:scaleX(1.04)}}
@keyframes tbt{0%{opacity:0;transform:scale(1.9);letter-spacing:26px}20%{opacity:1;transform:scale(1);letter-spacing:4px}30%{transform:scale(1.06)}38%{transform:scale(1)}82%{opacity:1}100%{opacity:0;transform:scale(.97)}}
@keyframes tbs{0%,30%{background-position:100% 0}75%,100%{background-position:0 0}}
@keyframes tbt2{0%,22%{opacity:0;transform:translateY(6px)}36%{opacity:1;transform:none}82%{opacity:1}100%{opacity:0}}
.wpanel{position:absolute;display:flex;flex-direction:column;gap:10px;z-index:5}
.wdet{flex:none;max-height:42%;overflow:auto;background:rgba(14,18,36,.9);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.45}
.wdet p{margin:6px 0}.wlog{position:static!important;flex:1;min-height:0;width:auto!important;max-height:none!important;display:flex;flex-direction:column}
.bt3 .vc .float{top:30%;font-size:max(26px,22cqw);animation:fl2 1.6s forwards;z-index:9}.bt3 .vc .float.crit{font-size:max(32px,28cqw)}
@keyframes fl2{0%{transform:translate(-50%,0) scale(.6);opacity:0}10%{transform:translate(-50%,-4px) scale(1.2);opacity:1}20%{transform:translate(-50%,-6px) scale(1)}80%{opacity:1;transform:translate(-50%,-12px)}100%{opacity:0;transform:translate(-50%,-26px)}}
.bt3 .vc{container-type:inline-size}
.bt3 .vbot .hptx{display:flex;flex-wrap:nowrap;justify-content:space-between;gap:2px;font-size:max(9px,10cqw);font-variant-numeric:tabular-nums;letter-spacing:-.2px;overflow:visible}
.bt3 .vbot .hptx span{white-space:nowrap}.bt3 .vbot .nmrow{font-size:max(10px,11cqw)}.bt3 .vbot .nmrow span{white-space:nowrap;overflow:hidden;text-overflow:clip}
.bt3 .vc .float{font-size:min(40px,max(22px,24cqw))}.bt3 .vc .float.crit{font-size:min(48px,max(26px,30cqw))}
/* ---------- 역동 연출(사용자 요청 2026-11-01): 배경 흐름·캐릭터 숨쉬기·피격·충돌·턴 시작. 클릭 대상(손패·버튼)에는 위치가 계속 움직이는 애니메이션을 걸지 않음 ---------- */
.bt3::before{content:"";position:absolute;inset:-10%;pointer-events:none;z-index:0;opacity:.55;background:radial-gradient(1.5px 1.5px at 12% 22%,#fff,transparent),radial-gradient(1px 1px at 32% 68%,#cfe0ff,transparent),radial-gradient(1.5px 1.5px at 58% 34%,#fff,transparent),radial-gradient(1px 1px at 78% 82%,#ffe7b0,transparent),radial-gradient(1px 1px at 88% 16%,#fff,transparent),radial-gradient(1.5px 1.5px at 44% 88%,#cfe0ff,transparent),radial-gradient(ellipse 50% 40% at 25% 75%,rgba(60,110,255,.16),transparent),radial-gradient(ellipse 50% 40% at 78% 22%,rgba(255,60,120,.14),transparent);background-size:340px 260px,420px 300px,380px 280px,300px 240px,460px 320px,360px 300px,100% 100%,100% 100%;animation:drift 40s linear infinite}
.bt3::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;background:linear-gradient(155deg,transparent 42%,rgba(140,170,255,.07) 48%,rgba(255,255,255,.12) 50%,rgba(255,140,180,.07) 52%,transparent 58%);background-size:300% 300%;animation:sweep 7s ease-in-out infinite}
@keyframes drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-60px,30px,0)}}
@keyframes sweep{0%,100%{background-position:100% 0}50%{background-position:0 100%}}

@keyframes vfl{0%,100%{transform:translateY(0);box-shadow:0 0 14px 2px rgba(80,140,255,.25)}50%{transform:translateY(-4px);box-shadow:0 0 22px 5px rgba(80,140,255,.45)}}
@keyframes vfo{0%,100%{transform:translateY(0);box-shadow:0 0 14px 2px rgba(255,80,130,.22)}50%{transform:translateY(-4px);box-shadow:0 0 22px 5px rgba(255,80,130,.42)}}
.bt3 .vc.hurt{animation:hurt .45s ease-out}.bt3 .vc.hurt::after{content:"";position:absolute;inset:0;background:rgba(255,40,40,.45);mix-blend-mode:screen;animation:fo .45s forwards;pointer-events:none;z-index:8}
@keyframes hurt{0%{transform:translate(0,0)}15%{transform:translate(-6px,2px) rotate(-1.5deg)}30%{transform:translate(5px,-2px) rotate(1deg)}45%{transform:translate(-4px,1px)}60%{transform:translate(3px,0)}100%{transform:none}}
@keyframes fo{to{opacity:0}}
.bt3 .vc.hit{animation:hit .35s}
.bt3{overflow:hidden}
#bt.shk{animation:shk .3s}#bt.shk2{animation:shk2 .42s}
@keyframes shk{0%,100%{transform:none}20%{transform:translate(-3px,2px)}40%{transform:translate(3px,-2px)}60%{transform:translate(-2px,1px)}80%{transform:translate(2px,-1px)}}
@keyframes shk2{0%,100%{transform:none}10%{transform:translate(-8px,4px)}25%{transform:translate(7px,-5px)}40%{transform:translate(-6px,3px)}55%{transform:translate(5px,-2px)}70%{transform:translate(-3px,2px)}85%{transform:translate(2px,-1px)}}
.burst{position:absolute;width:0;height:0;z-index:37;pointer-events:none}
.burst s{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#fff3c4;box-shadow:0 0 10px 3px #ff7a3c;animation:bst .6s ease-out forwards}.burst.big s{width:11px;height:11px;box-shadow:0 0 14px 4px #ffd34d}
@keyframes bst{0%{transform:rotate(var(--a)) translateX(0) scale(1.2);opacity:1}100%{transform:rotate(var(--a)) translateX(var(--d)) scale(.2);opacity:0}}
.vign{position:absolute;inset:0;z-index:38;pointer-events:none;box-shadow:inset 0 0 90px 20px rgba(255,30,40,.55);animation:fo .5s forwards}
.clash{position:absolute;inset:0;z-index:38;pointer-events:none}
.clash i{position:absolute;left:-20%;right:-20%;top:50%;height:6px;background:linear-gradient(90deg,transparent,#8fb4ff 30%,#fff 50%,#ff8fb4 70%,transparent);box-shadow:0 0 18px 4px rgba(255,255,255,.6);transform-origin:center;animation:cl1 .6s ease-out forwards}
.clash i+i{animation-name:cl2}
@keyframes cl1{0%{transform:rotate(-24deg) translateX(-60%) scaleY(.4);opacity:0}35%{opacity:1}100%{transform:rotate(-24deg) translateX(60%) scaleY(1);opacity:0}}
@keyframes cl2{0%{transform:rotate(-24deg) translateX(60%) scaleY(.4);opacity:0}35%{opacity:1}100%{transform:rotate(-24deg) translateX(-60%) scaleY(1);opacity:0}}
.clash b{position:absolute;left:38%;top:50%;transform:translate(-50%,-50%);font-size:clamp(28px,8vh,52px);font-weight:900;letter-spacing:6px;color:#fff;text-shadow:0 0 18px #8fb4ff,0 0 30px #ff8fb4,0 2px 3px #000;animation:clb .9s ease-out forwards}
@keyframes clb{0%{opacity:0;transform:translate(-50%,-50%) scale(2.2)}25%{opacity:1;transform:translate(-50%,-50%) scale(1)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.1)}}
.bt3 .hand.deal .bc{animation:deal .42s cubic-bezier(.2,1.2,.4,1) backwards}
.bt3 .hand.deal .bc:nth-child(2){animation-delay:.06s}.bt3 .hand.deal .bc:nth-child(3){animation-delay:.12s}.bt3 .hand.deal .bc:nth-child(4){animation-delay:.18s}.bt3 .hand.deal .bc:nth-child(5){animation-delay:.24s}.bt3 .hand.deal .bc:nth-child(6){animation-delay:.3s}.bt3 .hand.deal .bc:nth-child(7){animation-delay:.36s}.bt3 .hand.deal .bc:nth-child(n+8){animation-delay:.42s}
@keyframes deal{0%{transform:translate(160px,60px) rotate(18deg) scale(.6);opacity:0}100%{transform:none;opacity:1}}
.bt3 .bc.can{animation:canp 1.8s ease-in-out infinite}
@keyframes canp{0%,100%{box-shadow:0 0 0 2px rgba(255,231,140,.85),0 0 8px 1px rgba(255,214,90,.45)}50%{box-shadow:0 0 0 2px rgba(255,240,170,1),0 0 16px 4px rgba(255,214,90,.8)}}
.bt3 .confirm.go{animation:gop 1.2s ease-in-out infinite}
@keyframes gop{0%,100%{box-shadow:0 0 0 0 rgba(90,150,255,.0),0 0 10px rgba(90,150,255,.5)}50%{box-shadow:0 0 0 4px rgba(90,150,255,.35),0 0 22px rgba(120,170,255,.9)}}
.bt3 .orb::after{content:"";position:absolute;right:50%;top:50%;width:46px;height:6px;transform:translateY(-50%);border-radius:3px;background:linear-gradient(90deg,transparent,var(--kc));filter:blur(2px);opacity:.8}
.tban .tsw{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(255,225,140,.95);box-shadow:0 0 18px rgba(255,210,100,.8);animation:tsw .75s .14s ease-out both}.tban .tsw.t2{animation-delay:.26s;border-width:2px}
@keyframes tsw{0%{transform:scale(.2);opacity:1}100%{transform:scale(10,3.2);opacity:0}}
.tban em{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#fff 45%,#ffe39a 55%,transparent);opacity:0;animation:tst .55s ease-out both}
.tban em:nth-of-type(1){top:12%;animation-delay:.04s}.tban em:nth-of-type(2){top:52%;animation-delay:.11s;height:3px}.tban em:nth-of-type(3){top:88%;animation-delay:.18s}
@keyframes tst{0%{transform:translateX(-70%) scaleX(.3);opacity:0}30%{opacity:1}100%{transform:translateX(70%) scaleX(1);opacity:0}}
.tban s{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff1c2;box-shadow:0 0 8px 2px #ffb84d;opacity:0;animation:tsp .7s .2s ease-out both}
.tban.rush s{background:#ffd0b0;box-shadow:0 0 8px 2px #ff6a2a}
@keyframes tsp{0%{opacity:1;transform:rotate(var(--a)) translateX(0) scale(1.3)}100%{opacity:0;transform:rotate(var(--a)) translateX(var(--d)) scale(.3)}}
.tflash{position:absolute;inset:0;z-index:39;pointer-events:none;background:radial-gradient(ellipse at 50% 42%,rgba(255,244,210,.45),transparent 62%);animation:fo .45s ease-out forwards}.tflash.rush{background:radial-gradient(ellipse at 50% 42%,rgba(255,120,60,.5),transparent 62%)}
@media (prefers-reduced-motion:reduce){.bt3::before,.bt3::after,.bt3 .vc,.bt3 .bc.can,.bt3 .confirm.go,.bt3 .ring.red{animation:none}#bt.shk,#bt.shk2{animation:none}}
.pvc.full .pvwin{left:0;top:0;width:100%;height:100%}
/* ---------- 턴 타이머(사용자 요청 2026-11-02): 전투판 가운데, 게임식 링 — 남은 비율 색(초록→노랑→빨강), 바깥 회전 눈금, 숫자 바뀔 때 튐, 턴 시작 때 회전하며 등장, 10초 박동·5초 빠른 박동 ---------- */
.bt3 .center{z-index:6}
.bt3 .ring{width:clamp(58px,13vh,84px);height:clamp(58px,13vh,84px);font-size:clamp(20px,5vh,30px);--acc:hsl(var(--hue,120),85%,58%);background:conic-gradient(from 0deg,var(--acc) calc(var(--p,1)*360deg),rgba(255,255,255,.08) 0);box-shadow:0 0 18px 2px color-mix(in srgb,var(--acc) 55%,transparent),inset 0 0 10px rgba(0,0,0,.6)}
.bt3 .ring.enter{animation:rin .7s .55s cubic-bezier(.2,1.6,.4,1) backwards}
.bt3 .ring::before{inset:6px;background:radial-gradient(circle at 50% 35%,#222a4a,#0c1024 70%);box-shadow:inset 0 2px 6px rgba(255,255,255,.08)}
.bt3 .ring::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:2px dashed color-mix(in srgb,var(--acc) 70%,transparent);opacity:.75;animation:rspin 8s linear infinite;pointer-events:none}
.bt3 .ring span{font-weight:900;text-shadow:0 0 10px color-mix(in srgb,var(--acc) 80%,transparent),0 2px 2px #000;color:#fff;font-variant-numeric:tabular-nums}
.bt3 .ring span.tk{animation:tk .35s cubic-bezier(.2,1.8,.4,1)}
@keyframes tk{0%{transform:scale(1.45);filter:brightness(1.8)}100%{transform:scale(1)}}
@keyframes rspin{to{transform:rotate(360deg)}}
@keyframes rin{0%{transform:scale(0) rotate(-200deg);opacity:0}70%{transform:scale(1.15) rotate(10deg);opacity:1}100%{transform:none}}
.bt3 .ring.red{--acc:#ff4d5e;animation:rbeat 1s ease-in-out infinite}.bt3 .ring.red::after{animation-duration:2s}
.bt3 .ring.crit5{animation:rbeat .5s ease-in-out infinite}.bt3 .ring.crit5::after{animation-duration:1s;border-style:solid}
@keyframes rbeat{0%,100%{transform:scale(1);box-shadow:0 0 14px 2px rgba(255,77,94,.5)}15%{transform:scale(1.14);box-shadow:0 0 28px 8px rgba(255,77,94,.9)}30%{transform:scale(1)}}
.bt3 .ring.wait{--acc:#7d8296;animation:none}.bt3 .ring.wait::after{animation-duration:16s;opacity:.4}
.bt3 .center .cap{font-weight:800;letter-spacing:.5px;text-shadow:0 1px 3px #000}
/* 프로필 효과 글자: 전투판 위(잘림 없음) */
.bt3 .float.fx{position:absolute;transform:translateX(-50%);z-index:38;white-space:nowrap;pointer-events:none;font-weight:900;text-shadow:0 2px 4px #000,0 0 3px #000,0 0 12px rgba(0,0,0,.6);animation:fl3 1.6s forwards}
@keyframes fl3{0%{transform:translate(-50%,0) scale(.5);opacity:0}10%{transform:translate(-50%,-4px) scale(1.2);opacity:1}20%{transform:translate(-50%,-6px) scale(1)}80%{opacity:1;transform:translate(-50%,-14px)}100%{opacity:0;transform:translate(-50%,-28px)}}
@media (prefers-reduced-motion:reduce){.bt3 .ring,.bt3 .ring::after,.bt3 .ring.red,.bt3 .ring.crit5{animation:none}}
.ko{position:absolute;inset:0;z-index:45;pointer-events:none;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 50%,rgba(255,40,40,.25),rgba(0,0,0,.55) 70%);animation:fi .2s}
.ko b{font-size:clamp(48px,16vh,120px);font-weight:900;letter-spacing:8px;color:#fff;text-shadow:0 0 24px #ff3b3b,0 0 48px #ff8a3c,0 4px 6px #000;animation:kob .9s cubic-bezier(.2,1.6,.4,1) both}
@keyframes kob{0%{transform:scale(3);opacity:0}30%{transform:scale(.9);opacity:1}45%{transform:scale(1.05)}100%{transform:scale(1)}}
.bt3 .vc.down{filter:grayscale(1) brightness(.5);animation:none;transition:filter .3s}
.bt3.lefty .slots.opp .tag{left:auto;right:-6px;transform:translate(100%,-50%)}  /* 왼손 모드: '지난 턴' 표시를 프로필 반대쪽으로 */
/* ===== 전투 화면 Figma 시안(기획지시 2026-11-05 전투화면시안반영·타이머버튼). 수치는 시안 788×360 설계 단위(px), #stg가 화면 배율로 확대 ===== */
.bt4{--nv:#1e2866;--nvb:#4152b5;--nvr:rgba(20,27,74,.74);font-family:Pretendard,'Noto Sans KR',system-ui,sans-serif}
.bt4 #stg{position:absolute;left:0;top:0;transform-origin:0 0;z-index:1}
.bt4 #stg>*{position:absolute}
.bt4 .hdr{display:flex;align-items:center;gap:8px;z-index:8}
.bt4 .ib4{width:32px;height:32px;padding:0;border-radius:8px;background:var(--nvr);border:1px solid var(--nv);display:grid;place-items:center;flex:none}
.bt4 .ib4.on{border-color:#f5b83d}
.bt4 .pills{display:flex;gap:4px;align-items:center;margin-left:8px;height:24px;min-width:0}
.bt4 .kp{position:relative;height:24px;min-width:34px;padding:0 6px;border-radius:999px;background:var(--nv);border:1px solid var(--nv);font-size:10px;line-height:12px;font-weight:500;color:#f4f6ff;display:flex;align-items:center;justify-content:center;white-space:nowrap;flex:none;transition:background .2s,box-shadow .2s,transform .2s;cursor:help}
.bt4 .kp.tp{background:#ff4056;border-color:#ff4056;cursor:default}
.bt4 .kp.on{background:color-mix(in srgb,var(--kc) 45%,var(--nv));border-color:var(--kc);box-shadow:0 0 8px color-mix(in srgb,var(--kc) 55%,transparent)}
.bt4 .kp.now{background:#f5b83d;border-color:#ffd97a;color:#070a1c;box-shadow:0 0 12px rgba(245,184,61,.9);transform:scale(1.08)}
.bt4 .kp em{position:absolute;left:50%;transform:translateX(-50%);width:14px;height:10px;border-radius:999px;background:#fff;color:#5f6ba8;font-style:normal;font-size:8px;font-weight:700;line-height:10px;text-align:center}
.bt4 .kp .po{top:-6px}.bt4 .kp .pm{top:18px}
.bt4 .kp .pm.pop{animation:kpop .45s cubic-bezier(.3,1.8,.5,1)}
@keyframes kpop{0%{transform:translateX(-50%) scale(.3)}60%{transform:translateX(-50%) scale(1.6)}100%{transform:translateX(-50%) scale(1)}}
.bt4 .logb{margin-left:auto;height:22px;padding:0 6px;border-radius:999px;background:var(--nv);border:1px solid var(--nvb);font-size:10px;line-height:12px;color:#f4f6ff;white-space:nowrap;flex:none}
.bt4 .logb.on{border-color:#f5b83d}
.bt4 .center{transform:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none;z-index:6}
.bt4 .center #phc{display:flex;flex-wrap:wrap;justify-content:center;gap:3px}
.bt4 .obar i{min-width:20px;height:20px;font-size:10px;border-width:1.5px}
.bt4 .center .cap{font-size:11px;max-width:100%;min-height:0}
/* 프로필 */
.bt4 .oppc,.bt4 .mec{display:flex;flex-direction:column;gap:4px}
.bt4 .vc{border:0;border-radius:0;background:none;overflow:visible;padding:0;flex:none;container-type:normal}
.bt4 .vc .pfill{position:absolute;inset:6% 5.36% 5.11% 5.36%;overflow:hidden}
.bt4 .vc .pbg,.bt4 .vc .part{position:absolute;inset:0;background-repeat:no-repeat}
.bt4 .vc .vfa{position:absolute;inset:0}
.bt4 .vc .pfr{position:absolute;inset:0;background-size:100% 100%;pointer-events:none}
.bt4 .vc .pfr.nof{inset:3%;border:3px solid #9aa3c4;border-radius:6px}
.bt4 .vc .pcont{position:absolute;inset:10% 5.36% 5.11% 5.36%;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}
.bt4 .ptop{display:flex;justify-content:space-between;align-items:center;padding:0 10px}.bt4 .oppc .ptop{padding:0 8px}
.bt4 .pfac{width:16px;height:16px;background:center/contain no-repeat}
.bt4 .okb{background:rgba(255,47,154,.9);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:2px 4px;font-size:8px;font-weight:700;color:#fff;line-height:1.2;animation:okin .3s cubic-bezier(.3,1.8,.5,1)}
@keyframes okin{from{transform:scale(.3);opacity:0}}
.bt4 .pst{background:linear-gradient(180deg,rgba(0,0,0,0),#000);padding:8px 10px;display:flex;flex-direction:column;gap:2px}.bt4 .oppc .pst{padding:8px}
.bt4 .pnm{font-size:12px;line-height:16px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt4 .vc .hpbar{height:6px;border-radius:8px;background:#fff;margin:0}
.bt4 .vc .hpbar .hp{background:#00bc7d}
.bt4 .vc .hptx{font-size:10px;line-height:16px;font-weight:500;color:#fff;display:flex;justify-content:space-between;gap:2px;white-space:nowrap}
.bt4 .vc .hptx span+span{color:#7fc8ff}
.bt4 .bdg{display:flex;flex-direction:row;gap:2px;height:16px;align-items:center;overflow:visible}
.bt4 .oppc .bdg{justify-content:flex-end}
.bt4 .bdg .bf{position:relative;width:16px;height:16px;border-radius:4px;background:var(--bc) center/cover no-repeat;font-style:normal;font-size:9px;font-weight:800;color:#0b0e1c;display:grid;place-items:center;cursor:help;flex:none}
.bt4 .bdg .bf[style*="url"]{background-color:transparent}
.bt4 .bdg .bf.more::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.4);border-radius:4px}
.bt4 .bdg .bf b{position:relative;font-size:8px;color:#fff;line-height:16px}
.bt4 .bdg .bf.flash{animation:bfl .5s 3}
/* 슬롯(뒷면 ↔ 앞면 뒤집기) */
.bt4 .opslots,.bt4 .meslots{display:flex;flex-direction:column;gap:8px}.bt4 .opslots{align-items:flex-end}.bt4.lefty .opslots{align-items:flex-start}
.bt4 .slots{display:flex;flex-direction:row;align-items:center;gap:0}
.bt4 .slot{width:48px;height:67px;border:0;border-radius:4px;display:block;perspective:420px;flex:none;aspect-ratio:auto}
.bt4 .slot .fl{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .45s cubic-bezier(.34,1.56,.64,1)}
.bt4 .slot .fl.flb{transform:rotateY(180deg)}
.bt4 .slot .cb,.bt4 .slot .ff{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:4px}
.bt4 .slot .cb{transform:rotateY(180deg);background-color:#223;background-size:cover;background-position:center;box-shadow:0 4px 10px rgba(0,0,0,.45)}
.bt4 .slot .ff .bc{width:48px!important;--w:48px;border-radius:4px}
.bt4 .slot .ff .cell{inset:0;border-radius:4px}
.bt4 .slot .bc .txt{display:none}
.bt4 .slot .fl.flin{animation:flin .5s cubic-bezier(.34,1.56,.64,1) backwards}
@keyframes flin{0%{transform:rotateY(180deg)}100%{transform:rotateY(0)}}
.bt4 .slot.mine.fill{cursor:pointer}
.bt4 .crt{flex:none;display:block}
/* 원형 버튼(액티브·폭주·스펠·에너지) */
.bt4 .cirs{display:flex;gap:4px;flex:none;align-items:center}
.bt4 .ops{gap:2px}
.bt4 .cir{position:relative;width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.16);padding:0;margin:0;background:#141a3a center/cover no-repeat;display:grid;place-items:center;overflow:hidden;flex:none;color:#fff;font-size:10px;line-height:12px;font-weight:500;text-align:center;font-family:inherit}
.bt4 .cir:disabled{opacity:1;cursor:default}
.bt4 .cir>s{position:absolute;inset:0;background:rgba(0,0,0,.64);text-decoration:none}
.bt4 .cir>b{position:relative;font-weight:500}
.bt4 .cir .cf{position:absolute;inset:0;background-repeat:no-repeat}
.bt4 .cir.ac.ready{border-color:#ffd97a;box-shadow:0 0 0 2px rgba(255,217,122,.55),0 0 14px rgba(255,200,80,.9);animation:glow 1.2s infinite alternate}
.bt4 .cir.ac.ready b{font-weight:800;text-shadow:0 1px 3px #000}
.bt4 .cir.on{outline:2px solid #ffd97a;outline-offset:1px}
.bt4 .cir.ac.lock{filter:grayscale(1)}
.bt4 .cir.spc4.cd{filter:grayscale(1) brightness(.65)}
.bt4 .cir.spc4 b{position:absolute;inset:0;display:grid;place-items:center;font-size:14px;font-weight:800;background:rgba(0,0,0,.45)}
.bt4 .cir.spc4 i{font-style:normal;font-size:10px}
.bt4 .cir.ru{background:radial-gradient(circle at 50% 30%,#4a2a4a,#160f22)}
.bt4 .cir.ru>s{background:rgba(0,0,0,.3)}
.bt4 .cir.ru.on{background:radial-gradient(circle at 50% 30%,#ff6a3c,#7a1530);border-color:#ff8a6a;animation:glow 1s infinite alternate}
.bt4 .cir.en{background:var(--nv);border-color:var(--nvb);font-size:14px;line-height:20px;font-weight:700}
.bt4 .ops .cir{width:24px;height:24px}.bt4 .ops .cir.en{font-size:10px;line-height:12px;font-weight:500}.bt4 .ops .cir.spc4 b{font-size:10px}
/* 아래 줄 버튼 */
.bt4 .brow{display:flex;flex-direction:row;align-items:center;gap:8px;padding:0;background:none;border:0;backdrop-filter:none;border-radius:0}
.bt4.lefty .brow{flex-direction:row-reverse}
.bt4 .b2{height:40px;width:96px;min-width:96px;flex:none;padding:0 8px;border-radius:8px;background:var(--nv);border:1px solid var(--nvb);font-size:14px;line-height:20px;font-weight:700;color:#f4f6ff;white-space:nowrap}
.bt4 .b1{flex:1;min-width:96px;height:40px;padding:0 10px;border-radius:8px;background:#f5b93a;border:1px solid #ffd97a;font-size:14px;line-height:20px;font-weight:700;color:#070a1c;white-space:nowrap;transition:background .2s,color .2s}
.bt4 .b1.red{background:#ff4d5e;border-color:#ff8a95;color:#fff}
.bt4 .b1:disabled{background:#4a4f66;border-color:#5f6480;color:#c9cde0;opacity:1}
.bt4 .b1.skip{background:var(--nv);border-color:var(--nvb);color:#f4f6ff}
.bt4 .confirm.go{animation:gop4 1.2s ease-in-out infinite}
@keyframes gop4{0%,100%{box-shadow:0 0 6px rgba(255,217,122,.4)}50%{box-shadow:0 0 0 3px rgba(255,217,122,.35),0 0 18px rgba(255,200,80,.85)}}
button.confirm.beat{animation:obeat .5s ease-in-out infinite}
@keyframes obeat{0%,100%{transform:scale(1);box-shadow:0 0 0 rgba(255,77,94,0)}20%{transform:scale(1.04);box-shadow:0 0 16px 4px rgba(255,77,94,.85)}}
/* 손패(시안 72×101, 간격 2 — 넘치면 겹침, 스크롤 없음) */
.bt4 .hand{display:flex;align-items:flex-end;justify-content:flex-start;padding:8px 0 0;overflow:visible;min-width:0}
.bt.bt4 .hand .bc+.bc{margin-left:var(--ov,2px)}
.bt4 .bc{border-radius:4px}
.bt4 .bc .bdc,.bt4 .bc .bdk{top:9.9%;font-size:11.1cqw;line-height:1.25;font-weight:700;padding:2.8cqw 5.5cqw;border-radius:999px}
.bt4 .bc .bdc{left:11.1cqw;background:#1e2866;box-shadow:none;border:1px solid #4152b5;min-width:22cqw;text-align:center;padding:2.8cqw 1cqw;color:#f4f6ff}
.bt4 .bc .bdk{right:11.1cqw;color:#fff;border:1px solid rgba(255,255,255,.16)}
.bt4 .bc.face2 .shade{height:46%;background:linear-gradient(to bottom,rgba(0,0,0,0),#000)}
.bt4 .bc.face2 .txt{top:auto;bottom:0;padding:0 11.1cqw 13.9cqw;display:flex;flex-direction:column;align-items:stretch;gap:2.8cqw}
.bt4 .bc.face2 .txt .nm{font-size:13.9cqw;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt4 .bc.face2 .sht{font-size:11.1cqw;font-weight:500;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.92}
.bt4 .bc .own{top:30%;left:11.1cqw;font-size:9cqw}
/* 설정·감정표현·전투로그 */
.bt4 .menu{min-width:110px;padding:8px;gap:0;border-radius:8px;background:rgba(7,10,28,.96);border:1px solid var(--nv);z-index:40;display:flex;flex-direction:column}
.bt4 .menu button{background:none;border:0;border-radius:4px;font-size:12px;line-height:16px;padding:7px 4px;text-align:left;color:#f4f6ff;white-space:nowrap}
.bt4 .menu button:hover{background:rgba(65,82,181,.25)}
.bt4 .menu .mcl,.bt4 .log .lcl{margin-top:6px;text-align:center;background:var(--nv);border:1px solid var(--nvb);border-radius:6px;font-weight:700;font-size:13px;padding:6px;color:#f4f6ff}
.bt4 .log{left:auto;right:var(--pr);top:calc(var(--y0) + 40px);bottom:auto;width:238px;max-height:calc(var(--hd) - var(--y0) - 56px);padding:8px;background:rgba(7,10,28,.96);border:1px solid var(--nv);border-radius:8px;font-size:12px;line-height:16px;display:flex;flex-direction:column;gap:4px;white-space:normal;overflow:hidden;z-index:40}
.bt4 .log .ltabs{display:flex;flex-wrap:wrap;gap:2px}.bt4 .log .ltabs button{padding:1px 6px;font-size:10px;border-radius:4px}
.bt4 .log .lbody>div{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.bt4 .log .lnav{display:flex;justify-content:space-between;align-items:center}.bt4 .log .lnav button{padding:2px 8px;font-size:11px}
.bt4 .emp4{position:absolute;display:flex;gap:6px;align-items:center;padding:6px;border-radius:8px;background:rgba(7,10,28,.96);border:1px solid var(--nv);z-index:40}
.bt4 .emp4 button{width:34px;height:34px;padding:0;font-size:19px;border-radius:8px;background:var(--nv);border:1px solid var(--nvb)}
.bt4 .emp4 small{font-size:10px;color:#9aa0b8;white-space:nowrap}
.bt4 .emp4 .mute{width:auto;font-size:10px;padding:0 6px;height:24px}
.bt4 .emb{border-radius:8px;background:var(--nvr);border:1px solid var(--nv);display:grid;place-items:center;font-size:20px;z-index:20;pointer-events:none;animation:emp 2.6s forwards}
@keyframes emp{0%{transform:scale(0)}12%{transform:scale(1.25)}20%{transform:scale(1)}85%{opacity:1}100%{opacity:0}}
/* 폭주 중: 가장자리 붉은 박동 + 불씨 */
.bt4 .redge{inset:0;pointer-events:none;z-index:0;box-shadow:inset 0 0 40px 6px rgba(255,40,60,.45);animation:redg 1.6s ease-in-out infinite;overflow:hidden}
@keyframes redg{50%{box-shadow:inset 0 0 70px 14px rgba(255,40,60,.7)}}
.bt4 .redge s{position:absolute;bottom:-6px;width:4px;height:4px;border-radius:50%;background:#ffb070;box-shadow:0 0 6px 2px #ff5a2a;animation:embr 3s linear infinite}
@keyframes embr{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(18px,-260px);opacity:0}}
.bt4 .first{top:18%;bottom:auto}
.bt4 .guide{z-index:auto;background:none}.bt4 .guide::before{content:"";position:absolute;inset:0;background:rgba(6,8,20,.55);z-index:45}.bt4 .guide.bubble::before{display:none}.bt4 .guide .gc{position:relative;z-index:47}  /* 강조(.hl 46)가 어둠 위·안내 카드 아래 */.bt4 .manual{top:44%;bottom:auto}
/* 턴 시작(시안): 어둡게 + "n / Turn", 폭주 전 턴 빨간 알약, 폭주 턴 빨강→보라 + 양쪽 전신 */
.tban.t4{inset:0;top:0;transform:none;padding:0;display:grid;place-items:center;background:rgba(6,8,20,.55);animation:t4in var(--td,1.1s) ease-out forwards}
.tban.t4::before{display:none}
.tban.t4 .tbx{position:relative;display:flex;flex-direction:column;align-items:center;z-index:2}
.tban.t4 b{font-size:clamp(34px,12vh,64px);line-height:1;letter-spacing:0;font-weight:800;color:#fff;background:none;-webkit-background-clip:border-box;background-clip:border-box;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));animation:t4n .5s cubic-bezier(.2,1.6,.4,1) both}
.tban.t4 .tbx>span{font-size:clamp(24px,8.5vh,44px);font-weight:800;color:#fff;line-height:1.15;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));animation:t4n .5s .06s cubic-bezier(.2,1.6,.4,1) both}
.tban.t4 .tpill{margin-top:clamp(10px,4vh,22px);background:#ff4d5e;color:#fff;border-radius:999px;padding:.35em 1.1em;font-size:clamp(12px,4.2vh,18px);font-weight:500;white-space:nowrap;animation:t4p .45s .18s cubic-bezier(.2,1.6,.4,1) both}
.tban.t4 .tpill.blue{background:#1e2866;border:1px solid #4152b5}
.tban.t4.rush{background:linear-gradient(180deg,rgba(255,90,90,.95),rgba(177,92,207,.95))}
.tban.t4.rush .tpill{background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.5)}
.tban.t4 .ta{position:absolute;bottom:0;top:4%;width:34%;background:bottom center/contain no-repeat;z-index:1;animation:t4a .6s ease-out both}
.tban.t4 .ta.l{left:6%}.tban.t4 .ta.r{right:6%;animation-name:t4b}
@keyframes t4in{0%{opacity:0}10%{opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes t4n{0%{opacity:0;transform:scale(1.8)}100%{opacity:1;transform:none}}
@keyframes t4p{0%{opacity:0;transform:translateY(8px) scale(.8)}100%{opacity:1;transform:none}}
@keyframes t4a{0%{opacity:0;transform:translateX(-30%)}100%{opacity:1;transform:none}}
@keyframes t4b{0%{opacity:0;transform:translateX(30%)}100%{opacity:1;transform:none}}
/* 액티브 스킬 연출(시안 캐릭터 스킬) */
.scut{position:fixed;inset:0;z-index:58;pointer-events:none;overflow:hidden;animation:t4in var(--d,1.7s) ease-out forwards}
.scut .sbg{position:absolute;inset:0;background:linear-gradient(180deg,var(--c1),var(--c2))}
.scut.over .sbg{opacity:.72}
.scut .sln{position:absolute;inset:-20%;background:repeating-linear-gradient(100deg,transparent 0 22px,rgba(255,255,255,.16) 22px 24px,transparent 24px 61px);animation:sln .35s linear infinite;mix-blend-mode:screen}
@keyframes sln{to{transform:translateX(-61px)}}
.scut .sart{position:absolute;left:3%;top:0;bottom:0;width:48%;background:bottom center/contain no-repeat;animation:sart var(--d,1.7s) cubic-bezier(.2,1.2,.3,1) both;filter:drop-shadow(0 0 24px rgba(0,0,0,.45))}
@keyframes sart{0%{transform:translateX(-40%) scale(1.15);opacity:0}18%{transform:none;opacity:1}100%{transform:translateX(2%) scale(1.03)}}
.scut .stx{position:absolute;left:53%;right:4%;top:50%;transform:translateY(-50%);color:#fff;animation:stx var(--d,1.7s) cubic-bezier(.2,1.2,.3,1) both}
.scut .stx small{display:block;font-size:clamp(11px,3.4vh,15px);opacity:.85;font-weight:700}
.scut .stx b{display:block;font-size:clamp(26px,9vh,44px);font-weight:800;line-height:1.15;text-shadow:0 2px 10px rgba(0,0,0,.45)}
.scut .stx p{margin:clamp(8px,3vh,16px) 0 0;font-size:clamp(13px,4.4vh,19px);font-weight:700;line-height:1.4;text-shadow:0 1px 6px rgba(0,0,0,.5)}
@keyframes stx{0%{transform:translate(30%,-50%);opacity:0}22%{transform:translate(0,-50%);opacity:1}100%{transform:translate(-2%,-50%)}}
.scut .sfl{position:absolute;inset:0;background:#fff;animation:sfl .35s ease-out forwards}
@keyframes sfl{0%{opacity:.9}100%{opacity:0}}
.scut s{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 10px 3px var(--c1);animation:spt 1.2s ease-out both}
@keyframes spt{0%{opacity:0;transform:translate(0,0) scale(.4)}20%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.2)}}
/* 동작 줄이기: 흔들림·입자·박동 끄고 색 변화만 */
body.rmo .scut .sln,body.rmo .scut s,body.rmo .scut .sfl,body.rmo .tban s,body.rmo .tban .tsw,body.rmo .redge s{display:none}
body.rmo .scut .sart,body.rmo .scut .stx,body.rmo .bt4 .redge,body.rmo .bt3 .vc,body.rmo .bt3 .bc.can,body.rmo .bt4 .confirm.go,body.rmo button.confirm.beat,body.rmo .bt4 .cir.ac.ready,body.rmo .bt4 .cir.ru.on,body.rmo .bt3::before,body.rmo .bt3::after,body.rmo .tban.t4 b,body.rmo .tban.t4 .tbx>span{animation:none}
body.rmo #bt.shk,body.rmo #bt.shk2{animation:none}
/* 픽·스펠·덱(전투 시안 따라): 남색 알약·골드 확정 버튼·남색 패널 */
.pk3 .top .chip{background:#1e2866;border-color:#1e2866;color:#f4f6ff;border-radius:999px}
.pk3 .top .chip.on{background:#ff4056;border-color:#ff4056;color:#fff}
.pk3 .pbar button{border-radius:8px;background:#1e2866;border:1px solid #4152b5;color:#f4f6ff;font-weight:700}
.pk3 .pbar button.pri.confirm{background:#f5b93a;border-color:#ffd97a;color:#070a1c}
.pk3 .pbar button.pri.confirm.red{background:#ff4d5e;border-color:#ff8a95;color:#fff}
.pk3 .pbar button.pri.confirm:disabled{background:#4a4f66;border-color:#5f6480;color:#c9cde0;opacity:1}
.pk3 .pband{background:rgba(20,27,74,.74);border:1px solid #1e2866;border-radius:8px}
.pk3 .lab2{display:inline-block;align-self:center;background:#1e2866;border:1px solid #4152b5;border-radius:999px;padding:1px 10px;font-size:11px;color:#f4f6ff}
.lo3 .tab2{border-radius:999px;background:#1e2866;border-color:#4152b5}.lo3 .tab2.on{background:#f5b93a;border-color:#ffd97a;color:#070a1c;outline:0}
.lo3 .spb2.on{outline-color:#f5b83d}

/* ----- 사용자 수정 요청(2026-11-05 2차) ----- */
.bt4 .vc{animation:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;background:none}
.bt4 .bc.can{animation:none;box-shadow:0 4px 10px rgba(0,0,0,.45)}
.bt4 .hand .bc.cant,.bt4 .hand .bc.dim,.bt4 .hand .bc.lock{filter:grayscale(1) brightness(.6);opacity:1}
.bt4 .ib4 svg{display:block}
.scut{animation:t4in var(--d,2s) ease-out forwards}
.scut .sbg{background:linear-gradient(180deg,rgba(0,0,0,0),#000),linear-gradient(0deg,var(--c1),var(--c1)),#0d1020}
.scut.over .sbg{opacity:1;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.88)),linear-gradient(0deg,var(--c1),var(--c1))}
.scut .sbox{position:absolute;left:50%;top:50%;width:calc(788px*var(--k));height:calc(360px*var(--k));transform:translate(-50%,-50%)}
.scut .sart{position:absolute;left:calc(60px*var(--k));top:calc(40px*var(--k));bottom:auto;width:calc(320px*var(--k));height:calc(569px*var(--k));background:top center/100% 100% no-repeat;transform-origin:50% 45%;filter:none;animation:sin .45s cubic-bezier(.2,1.2,.3,1) both,sbr 2.4s .45s ease-in-out infinite}
@keyframes sin{0%{opacity:0;transform:translateX(-12%)}100%{opacity:1;transform:none}}
@keyframes sbr{0%,100%{transform:scale(1) translateY(0)}50%{transform:scale(1.018) translateY(-.8%)}}
.scut .stx{position:absolute;left:calc(420px*var(--k));right:calc(40px*var(--k));top:calc(40px*var(--k));bottom:0;transform:none;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:calc(16px*var(--k));color:#fff;font-family:'Noto Sans KR',Pretendard,system-ui,sans-serif;animation:stx2 .5s .1s cubic-bezier(.2,1.2,.3,1) both}
.scut .stx b{font-size:calc(40px*var(--k));line-height:1.2;font-weight:700;text-shadow:none}
.scut .stx p{margin:0;font-size:calc(20px*var(--k));line-height:1.4;font-weight:700;word-break:keep-all;text-shadow:none}
@keyframes stx2{0%{opacity:0;transform:translateX(10%)}100%{opacity:1;transform:none}}
.scut .sskip{position:absolute;right:max(calc(60px*var(--k)),env(safe-area-inset-right));bottom:max(calc(16px*var(--k)),env(safe-area-inset-bottom));pointer-events:auto;height:calc(32px*var(--k));padding:0 calc(14px*var(--k));border-radius:999px;background:rgba(7,10,28,.72);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:calc(13px*var(--k));font-weight:700;z-index:3}
body.rmo .scut .sart{animation:none}
.cdm{position:fixed;inset:0;z-index:62;background:rgba(4,6,14,.8);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(10px*var(--k));animation:fi .15s;cursor:pointer}
.cdm .cdw{display:flex;align-items:center;gap:calc(40px*var(--k));padding:0 max(calc(60px*var(--k)),env(safe-area-inset-left));max-width:100%}
.cdm .cdl .bc{box-shadow:0 12px 40px rgba(0,0,0,.7);animation:cdin .3s cubic-bezier(.2,1.4,.4,1) both}
@keyframes cdin{0%{transform:scale(.6);opacity:0}100%{transform:none;opacity:1}}
.cdm .cdr{display:flex;flex-direction:column;gap:calc(10px*var(--k));color:#fff;max-width:calc(360px*var(--k));animation:stx2 .3s .05s ease-out both}
.cdm .cdr small{font-size:calc(12px*var(--k));color:#c9cde0;font-weight:500}
.cdm .cdr b{font-size:calc(32px*var(--k));line-height:1.2;font-weight:700}
.cdm .cdr p{margin:0;font-size:calc(17px*var(--k));line-height:1.45;font-weight:500;word-break:keep-all}
.cdm .cdr .aff{font-size:calc(13px*var(--k));color:#ffd97a}
.cdm .cdx{font-size:calc(11px*var(--k));color:#9aa0b8}

/* ----- 사용자 수정 요청(2026-11-05 3차): 프로필 오버레이는 테두리 뒤, 게임식 숫자, 역동 효과 ----- */
.bt4 .vc .pcont.pbot{inset:6% 5.36% 5.11% 5.36%;justify-content:flex-end}
.bt4 .vc .pcont.ptopw{justify-content:flex-start}
.bt4 .oppc .vc .hptx{font-size:8px;letter-spacing:-.2px}
.bt4 .hand .bc.picked{box-shadow:0 10px 18px -6px rgba(0,0,0,.7)}
.bt4 .hand .bc{transition:transform .18s cubic-bezier(.3,1.6,.5,1),filter .15s,box-shadow .18s}
@media (hover:hover){.bt4 .hand .bc:not(.cant):not(.lock):not(.dim):hover{transform:translateY(-6%) scale(1.04);box-shadow:0 14px 24px -8px rgba(0,0,0,.8);z-index:6}.bt4 .hand .bc.picked:hover{transform:translateY(-9%) scale(1.04)}}
.bt4 button:not(:disabled):active{transform:scale(.94)}
.bt4 .vc::after{content:"";position:absolute;inset:6% 5.36% 5.11%;background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,.2) 50%,transparent 58%);background-size:260% 100%;background-position:120% 0;animation:shine 5s ease-in-out infinite;pointer-events:none;z-index:2;mix-blend-mode:screen}
.bt4 .oppc .vc::after{animation-delay:-2.5s}
@keyframes shine{0%,62%{background-position:120% 0}100%{background-position:-20% 0}}
.bt4 .b1{position:relative;overflow:hidden}
.bt4 .b1:not(:disabled)::after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:30%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-18deg);animation:bsh 2.8s ease-in-out infinite;pointer-events:none}
@keyframes bsh{0%,55%{left:-40%}100%{left:130%}}
.bt4 .slot .fl.flin .ff{animation:fglow .8s ease-out}
@keyframes fglow{0%,40%{box-shadow:0 0 0 0 rgba(255,217,122,0)}60%{box-shadow:0 0 18px 5px rgba(255,217,122,.95)}100%{box-shadow:0 0 0 0 rgba(255,217,122,0)}}
.bt4 .kp.on{animation:kglow 1.8s ease-in-out infinite}
@keyframes kglow{50%{box-shadow:0 0 14px 2px color-mix(in srgb,var(--kc) 75%,transparent)}}
.bt4 .kp .pm.pop::after{content:"";position:absolute;inset:-4px;border-radius:999px;border:2px solid #fff;animation:kring .5s ease-out forwards}
@keyframes kring{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.9);opacity:0}}
.bt4 .vc .hpbar.fl::after{content:"";position:absolute;inset:0;background:#fff;animation:fo .35s forwards}
.bt4 .cir.en.eng{animation:enp 2.4s ease-in-out infinite}
@keyframes enp{50%{box-shadow:0 0 12px 2px rgba(90,140,255,.7)}}
.bt4 .slots.opp .slot:not(.fill) .cb{animation:bkp 3s ease-in-out infinite}
.bt4 .slots.opp .slot:nth-of-type(2) .cb{animation-delay:-1s}.bt4 .slots.opp .slot:nth-of-type(3) .cb{animation-delay:-2s}
@keyframes bkp{50%{filter:brightness(1.25)}}
/* 피해·회복 숫자(게임식): 굵은 기울임 + 세로 그라데이션 + 외곽선 + 튀어나와 흔들리고 떠오름 */
.bt4 .float.fx{font-family:'Arial Black','Segoe UI Black','Noto Sans KR',Impact,sans-serif;font-style:italic;font-weight:900;letter-spacing:-.02em;line-height:1;text-shadow:none;color:transparent;-webkit-background-clip:text;background-clip:text;background-image:linear-gradient(180deg,#fff 0 40%,#ffd2c4 55%,#ff5a3c 100%);--o:#3a0808;filter:drop-shadow(1.5px 0 0 var(--o)) drop-shadow(-1.5px 0 0 var(--o)) drop-shadow(0 1.5px 0 var(--o)) drop-shadow(0 -1.5px 0 var(--o)) drop-shadow(0 3px 0 var(--o)) drop-shadow(0 6px 8px rgba(0,0,0,.55));animation:dmg4 1.6s cubic-bezier(.2,1.5,.4,1) forwards}
.bt4 .float.fx.crit{background-image:linear-gradient(180deg,#fffbe0 0 30%,#ffd23c 55%,#ff7a00 100%);--o:#4a1600;animation-name:dmg4c}
.bt4 .float.fx.crit::before{content:"CRITICAL";display:block;text-align:center;font-size:.4em;letter-spacing:.08em;margin-bottom:.05em}
.bt4 .float.fx.heal{background-image:linear-gradient(180deg,#f0fff4 0 35%,#7dffa6 60%,#14b85a 100%);--o:#04361a}
.bt4 .float.fx.abs{background-image:linear-gradient(180deg,#f0f8ff 0 35%,#8fd0ff 60%,#2b7fff 100%);--o:#06204a}
.bt4 .float.fx.burn{background-image:linear-gradient(180deg,#fff4d0 0 30%,#ffa040 60%,#ff4a10 100%);--o:#4a1000}
@keyframes dmg4{0%{opacity:0;transform:translate(calc(-50% + var(--x)),0) scale(2.4) rotate(var(--r))}10%{opacity:1;transform:translate(calc(-50% + var(--x)),0) scale(.85) rotate(var(--r))}18%{transform:translate(calc(-50% + var(--x)),-4px) scale(1.12) rotate(var(--r))}26%{transform:translate(calc(-50% + var(--x)),-6px) scale(1) rotate(var(--r))}72%{opacity:1;transform:translate(calc(-50% + var(--x)),-14px) scale(1) rotate(var(--r))}100%{opacity:0;transform:translate(calc(-50% + var(--x)),-42px) scale(.9) rotate(var(--r))}}
@keyframes dmg4c{0%{opacity:0;transform:translate(calc(-50% + var(--x)),0) scale(3.2) rotate(var(--r))}10%{opacity:1;transform:translate(calc(-50% + var(--x)),0) scale(.8) rotate(var(--r))}16%{transform:translate(calc(-50% + var(--x) - 6px),-4px) scale(1.25) rotate(calc(var(--r) - 6deg))}22%{transform:translate(calc(-50% + var(--x) + 6px),-5px) scale(1.15) rotate(calc(var(--r) + 6deg))}28%{transform:translate(calc(-50% + var(--x) - 3px),-6px) scale(1.1) rotate(var(--r))}75%{opacity:1;transform:translate(calc(-50% + var(--x)),-16px) scale(1.1) rotate(var(--r))}100%{opacity:0;transform:translate(calc(-50% + var(--x)),-46px) scale(1) rotate(var(--r))}}
body.rmo .bt4 .vc::after,body.rmo .bt4 .b1::after,body.rmo .bt4 .kp.on,body.rmo .bt4 .cir.en.eng,body.rmo .bt4 .slots.opp .slot .cb{animation:none}
body.rmo .bt4 .float.fx{animation:fl3 1.6s forwards}

/* ----- 4차: 카드 모서리가 테두리 밖으로 삐져나오지 않게(테두리 이미지와 같은 둥글기), 기울인 숫자 오른쪽 잘림 방지 ----- */
.bt4 .bc,.bt4 .slot .ff .bc,.bt4 .slot .cb,.bt4 .slot .ff,.bt4 .slot .ff .cell{border-radius:8%/5.7%}
.bt4 .slot{border-radius:8%/5.7%}
.bt4 .vc .pfill,.bt4 .vc .pcont.pbot{border-radius:9%/6.6%;overflow:hidden}
.bt4 .vc::after{border-radius:9%/6.6%}
.bt4 .float.fx{padding:.06em .22em .1em .12em}

/* ----- 성능(발열·지연, 2026-11-05): 계속 도는 효과는 transform·opacity만(화면 다시 칠하기 없음) ----- */
html,body{touch-action:manipulation}
.bt3.bt4::after{left:-100%;right:auto;width:300%;background-size:100% 100%;animation:sweep4 8s ease-in-out infinite;will-change:transform}
@keyframes sweep4{0%,100%{transform:translateX(-30%)}50%{transform:translateX(30%)}}
.bt4 .vc::after{content:none;animation:none}
.bt4 .vc .pfill::after{content:"";position:absolute;top:0;bottom:0;left:0;width:60%;background:linear-gradient(105deg,transparent,rgba(255,255,255,.18),transparent);transform:translateX(-130%);animation:shine4 5s ease-in-out infinite;pointer-events:none;z-index:1;will-change:transform}
.bt4 .oppc .vc .pfill::after{animation-delay:-2.5s}
@keyframes shine4{0%,62%{transform:translateX(-130%)}100%{transform:translateX(260%)}}
.bt4 .b1:not(:disabled)::after{left:0;width:30%;transform:translateX(-140%) skewX(-18deg);animation:bsh4 2.8s ease-in-out infinite;will-change:transform}
@keyframes bsh4{0%,55%{transform:translateX(-140%) skewX(-18deg)}100%{transform:translateX(440%) skewX(-18deg)}}
.bt4 .kp.on{animation:none}
.bt4 .kp.on::before{content:"";position:absolute;inset:-3px;border-radius:999px;box-shadow:0 0 12px 2px var(--kc);opacity:.3;animation:kgl4 1.8s ease-in-out infinite;pointer-events:none}
@keyframes kgl4{50%{opacity:1}}
.bt4 .cir.en.eng,.bt4 .slots.opp .slot .cb,.bt4 .confirm.go{animation:none}
.bt4 .cir.ac.ready,.bt4 .cir.ru.on{animation:cpl 1.4s ease-in-out infinite}
@keyframes cpl{50%{transform:scale(1.06)}}
.bt4 .redge{box-shadow:inset 0 0 60px 12px rgba(255,40,60,.65);animation:redg4 1.6s ease-in-out infinite;will-change:opacity}
@keyframes redg4{0%,100%{opacity:.55}50%{opacity:1}}
body.rmo .bt4 .vc .pfill::after,body.rmo .bt4 .kp.on::before,body.rmo .bt4 .cir.ac.ready,body.rmo .bt4 .cir.ru.on,body.rmo .bt3.bt4::after{animation:none}

/* ----- 스펠 카드(전투카드와 같은 UI, 에너지 뱃지 없음, 아이콘은 카드 안을 꽉 채우고 좌우 잘림) ----- */
.bc.spcard .art{background-size:cover;background-position:center}
.bc.spcard .usd{position:absolute;right:6%;bottom:30%;font-style:normal;font-size:max(8px,9cqw);font-weight:800;background:#2b8a4b;border-radius:99px;padding:0 5px;z-index:3}
.bt4 .slot .bc.face2 .txt{display:none}

/* ----- 5차(2026-11-05): 프로필 그림 창 = 등급 프레임 안쪽(BO 카드 미리보기와 같은 비율), 폭주 오른쪽 끝, 턴 시작 글자 게임식, 액티브 가능 테두리 빛, 데스크톱 성능 ----- */
.hand .bc:hover{transform:none}.hand .bc.picked:hover{transform:translateY(-7%)}
.bt4 .vc .pfill,.bt4 .vc .pcont.pbot{inset:5.13% 6.9%;border-radius:6%/4.3%}
.bt4 .vc .pcont.ptopw{inset:9% 6.9% 5.13%}
.bt4 .ptop{padding:0 8px}.bt4 .pst{padding:6px 8px}
.bt4 .brow .rz{margin-left:0}
.bt3.bt4::after{display:none}
.bt4 .vc .pfill::after,.bt4 .b1:not(:disabled)::after,.bt4 .redge{will-change:auto}
/* 액티브 사용 가능: 테두리를 따라 도는 빛(로딩 바처럼) */
.bt4 .cir.ac.ready{animation:none;overflow:visible}
.bt4 .cir.ac.ready .cf,.bt4 .cir.ac.ready>s{border-radius:999px}
.bt4 .cir.ac.ready .cf{overflow:hidden}
.bt4 .cir.ac.ready::before{content:"";position:absolute;inset:-3px;border-radius:999px;background:conic-gradient(from 0deg,rgba(255,217,122,0) 0 55%,rgba(255,240,180,.95) 80%,#fff 88%,rgba(255,190,60,0) 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));animation:acspin 1.1s linear infinite;pointer-events:none;z-index:2}
.bt4 .cir.ac.ready::after{content:"";position:absolute;inset:-3px;border-radius:999px;box-shadow:0 0 10px 2px rgba(255,200,80,.75);pointer-events:none}
@keyframes acspin{to{transform:rotate(360deg)}}
body.rmo .bt4 .cir.ac.ready::before{animation:none}
/* 턴 시작 글자: 피해 숫자처럼 굵은 기울임 + 그라데이션 + 외곽선, 사선으로 */
.tban.t4 .tbx{transform:rotate(-6deg)}
.tban.t4 b,.tban.t4 .tbx>span{font-family:'Arial Black','Segoe UI Black','Noto Sans KR',Impact,sans-serif;font-style:italic;font-weight:900;letter-spacing:-.01em;padding:0 .2em .05em .1em;color:transparent;-webkit-background-clip:text;background-clip:text;background-image:linear-gradient(180deg,#fff 0 38%,#ffe9a6 58%,#ffb020 100%);--o:#2a1600;filter:drop-shadow(2px 0 0 var(--o)) drop-shadow(-2px 0 0 var(--o)) drop-shadow(0 2px 0 var(--o)) drop-shadow(0 -2px 0 var(--o)) drop-shadow(0 4px 0 var(--o)) drop-shadow(0 8px 12px rgba(0,0,0,.55))}
.tban.t4 b{font-size:clamp(44px,17vh,96px);line-height:.95}
.tban.t4 .tbx>span{font-size:clamp(26px,9.5vh,52px);margin-top:-.05em}
.tban.t4.rush b,.tban.t4.rush .tbx>span{background-image:linear-gradient(180deg,#fff 0 35%,#ffc2b0 58%,#ff4a3c 100%);--o:#3a0606}

/* 감정표현 그림 애니메이션(투명 배경) */
.emi{width:100%;height:100%;display:block;object-fit:contain;pointer-events:none}
.bt4 .emb{background:none;border:0;font-size:0;overflow:visible}
.bt4 .emb .emi{filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}
.bt4 .emb .em-HELLO{animation:emWave .5s ease-in-out 4 alternate;transform-origin:70% 85%}
.bt4 .emb .em-NICE{animation:emBounce .55s cubic-bezier(.3,1.6,.5,1) 3}
.bt4 .emb .em-OOPS{animation:emShake .3s ease-in-out 6}
.bt4 .emb .em-THINK{animation:emTilt 1.1s ease-in-out 2 alternate;transform-origin:50% 90%}
@keyframes emWave{0%{transform:rotate(-14deg)}100%{transform:rotate(16deg)}}
@keyframes emBounce{0%,100%{transform:translateY(0) scale(1)}40%{transform:translateY(-22%) scale(1.08,.95)}70%{transform:translateY(0) scale(1.06,.9)}}
@keyframes emShake{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-8%) rotate(-6deg)}75%{transform:translateX(8%) rotate(6deg)}}
@keyframes emTilt{0%{transform:rotate(-8deg) translateY(0)}100%{transform:rotate(10deg) translateY(-6%)}}
.bt4 .emp4 button{padding:3px}
.bt4 .emp4 button .emi{transition:transform .15s}.bt4 .emp4 button:hover .emi{transform:scale(1.15) rotate(-6deg)}
body.rmo .bt4 .emb .emi{animation:none}

/* 카드 테두리(CARD_FRAME) 밖으로 배경·그림이 삐져나오지 않게: 프레임이 있는 카드는 안쪽 층을 테두리 두께만큼 들여서 자르고, 카드 자체 바탕·그림자는 없앰 */
.bc:has(>.frm){background:transparent}
.bc:has(>.frm)>.l:not(.frm){inset:2.8% 3.4%;border-radius:7%/5%;overflow:hidden}
.bt4 .vc>.wait{left:50%;top:-4px;transform:translateX(-50%);z-index:6;font-size:10px;padding:1px 8px;box-shadow:0 2px 6px rgba(0,0,0,.5);white-space:nowrap}
.bc:has(>.frm)>.l.shade{top:auto;bottom:2.8%}

/* ----- 7차(2026-11-05) ----- */
/* 설정 메뉴: 항목이 많아 닫기가 안 보이던 것 → 두 줄 격자 + 닫기는 맨 아래 전체 폭 */
.bt4 .menu.m4{display:grid;grid-template-columns:1fr 1fr;column-gap:4px;max-height:calc(var(--hd) - var(--y0) - 48px)}
.bt4 .menu.m4 button{padding:6px 6px}
.bt4 .menu.m4 .mcl{grid-column:1 / -1}
/* 공개: 가운데 큰 글자(턴 시작과 같은 효과) + 뒤 흐림 + 글리치 */
.rvl{position:fixed;inset:0;z-index:59;pointer-events:none;display:grid;place-items:center;background:rgba(6,8,20,.35);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:t4in var(--d,.9s) ease-out forwards}
.rvl .rvx{transform:rotate(-6deg)}
.rvl b{position:relative;display:block;font-family:'Arial Black','Segoe UI Black','Noto Sans KR',Impact,sans-serif;font-style:italic;font-weight:900;font-size:clamp(46px,18vh,104px);line-height:1;padding:0 .2em .05em .1em;color:transparent;-webkit-background-clip:text;background-clip:text;background-image:linear-gradient(180deg,#fff 0 38%,#cfe6ff 58%,#5aa8ff 100%);--o:#06163a;filter:drop-shadow(2px 0 0 var(--o)) drop-shadow(-2px 0 0 var(--o)) drop-shadow(0 2px 0 var(--o)) drop-shadow(0 -2px 0 var(--o)) drop-shadow(0 4px 0 var(--o)) drop-shadow(0 8px 12px rgba(0,0,0,.55));animation:t4n .45s cubic-bezier(.2,1.6,.4,1) both}
.rvl b::before,.rvl b::after{content:attr(data-t);position:absolute;left:0;top:0;padding:inherit;-webkit-background-clip:text;background-clip:text;color:transparent;opacity:.8}
.rvl b::before{background-image:linear-gradient(#ff3b6b,#ff3b6b);animation:gl1 .9s steps(1) infinite}
.rvl b::after{background-image:linear-gradient(#3bf0ff,#3bf0ff);animation:gl2 .9s steps(1) infinite}
@keyframes gl1{0%{transform:translate(-5px,0);clip-path:inset(10% 0 70% 0)}20%{transform:translate(4px,0);clip-path:inset(55% 0 20% 0)}40%{transform:translate(-3px,0);clip-path:inset(30% 0 45% 0)}60%{transform:translate(5px,0);clip-path:inset(75% 0 5% 0)}80%{transform:translate(0,0);clip-path:inset(100% 0 0 0)}100%{clip-path:inset(100% 0 0 0)}}
@keyframes gl2{0%{transform:translate(5px,0);clip-path:inset(60% 0 15% 0)}20%{transform:translate(-4px,0);clip-path:inset(5% 0 75% 0)}40%{transform:translate(3px,0);clip-path:inset(40% 0 35% 0)}60%{transform:translate(-5px,0);clip-path:inset(20% 0 60% 0)}80%{transform:translate(0,0);clip-path:inset(100% 0 0 0)}100%{clip-path:inset(100% 0 0 0)}}
.rvl.rmo b::before,.rvl.rmo b::after{display:none}
.rvl.rmo{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(6,8,20,.55)}
/* 결과 화면 캐릭터 숨쉬기 */
.res3 .rimg{transform-origin:50% 40%;animation:sbr 3.2s ease-in-out infinite}
body.rmo .res3 .rimg{animation:none}
/* 액티브 연출 속성 효과(고급스럽게: 빛 번짐·깊이감, 과한 원색 피함) */
.scut .em{position:absolute;bottom:-12px;border-radius:50%;background:radial-gradient(circle,#fff6d0 0,#ffb347 40%,rgba(255,90,30,.0) 72%);box-shadow:0 0 10px 3px rgba(255,120,40,.55);mix-blend-mode:screen;animation:emRise 2s linear infinite}
@keyframes emRise{0%{transform:translate(0,0) scale(1);opacity:0}10%{opacity:1}60%{opacity:.9}100%{transform:translate(var(--dx),-105vh) scale(.4);opacity:0}}
.scut .fglow{position:absolute;left:-10%;right:-10%;bottom:-20%;height:60%;background:radial-gradient(ellipse at 50% 100%,rgba(255,120,40,.55),rgba(255,60,20,.15) 45%,transparent 70%);mix-blend-mode:screen;animation:fgl 0.9s ease-in-out infinite alternate}
@keyframes fgl{0%{opacity:.65;transform:scaleY(.95)}100%{opacity:1;transform:scaleY(1.05)}}
.scut .bu{position:absolute;bottom:-30px;border-radius:50%;border:1.5px solid rgba(220,245,255,.75);background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.85) 0 12%,rgba(160,220,255,.12) 30%,rgba(120,200,255,.05) 70%);box-shadow:inset 0 0 6px rgba(160,220,255,.5),0 0 8px rgba(120,200,255,.35);animation:buRise 2.6s ease-in infinite}
@keyframes buRise{0%{transform:translate(0,0);opacity:0}15%{opacity:.95}50%{transform:translate(var(--dx),-55vh)}100%{transform:translate(calc(var(--dx) * -1),-110vh);opacity:0}}
.scut .caus{position:absolute;inset:-20%;background:radial-gradient(ellipse 18% 9% at 30% 40%,rgba(200,240,255,.18),transparent 70%),radial-gradient(ellipse 22% 10% at 70% 60%,rgba(200,240,255,.14),transparent 70%),radial-gradient(ellipse 15% 8% at 50% 80%,rgba(200,240,255,.12),transparent 70%);mix-blend-mode:screen;animation:caus 3s ease-in-out infinite alternate}
@keyframes caus{0%{transform:translate(-3%,0) scale(1)}100%{transform:translate(3%,-2%) scale(1.08)}}
.scut .gs{position:absolute;left:-30%;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(235,255,225,.85),transparent);transform:rotate(var(--rot));box-shadow:0 0 6px rgba(200,255,190,.5);animation:gsMove .9s linear infinite}
@keyframes gsMove{0%{transform:translateX(0) rotate(var(--rot));opacity:0}15%{opacity:1}100%{transform:translateX(160vw) rotate(var(--rot));opacity:0}}
.scut .lf{position:absolute;left:-5%;width:10px;height:6px;border-radius:70% 0 70% 0;background:linear-gradient(135deg,#d8ffb0,#5fbf5a);box-shadow:0 0 6px rgba(190,255,160,.45);animation:lfMove 1.5s linear infinite}
@keyframes lfMove{0%{transform:translate(0,0) rotate(0);opacity:0}10%{opacity:1}100%{transform:translate(115vw,-12vh) rotate(var(--rs));opacity:0}}
body.rmo .scut .em,body.rmo .scut .bu,body.rmo .scut .gs,body.rmo .scut .lf,body.rmo .scut .fglow,body.rmo .scut .caus{display:none}

button.busy{cursor:progress}
button.busy::before{content:"";display:inline-block;width:.85em;height:.85em;margin-right:.45em;vertical-align:-.1em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:bspin .7s linear infinite}
@keyframes bspin{to{transform:rotate(360deg)}}
.bt4 .b1:disabled.busy{color:#fff}
/* 픽·스펠덱: 닉네임 뱃지가 카드(등급 테두리) 위로 */
.pk3 .lab2{position:relative;z-index:6}
.bc.accard .art{background-size:cover;background-position:center}

/* 패시브 보기 */
.scut.pview{animation:fi .2s ease-out both;pointer-events:auto;cursor:pointer;z-index:61}
.pview .paura{position:absolute;left:calc(40px*var(--k));top:calc(10px*var(--k));width:calc(360px*var(--k));height:calc(340px*var(--k));background:radial-gradient(ellipse at 50% 55%,var(--c1) 0,rgba(255,255,255,.08) 38%,transparent 66%);filter:blur(6px);animation:paur 2.6s ease-in-out infinite alternate;pointer-events:none}
@keyframes paur{0%{opacity:.55;transform:scale(.96)}100%{opacity:1;transform:scale(1.05)}}
.pview .pfx{position:absolute;left:calc(40px*var(--k));width:calc(360px*var(--k));top:0;bottom:0;overflow:hidden;pointer-events:none;-webkit-mask:radial-gradient(ellipse 60% 65% at 50% 55%,#000 55%,transparent 100%);mask:radial-gradient(ellipse 60% 65% at 50% 55%,#000 55%,transparent 100%)}
.pview .pfx .em,.pview .pfx .bu{bottom:-12px}
.pview .pfx .gs{left:-40%}
.pview .sart.pfull{left:calc(60px*var(--k) + 72px*var(--k));top:calc(24px*var(--k));width:calc(175.5px*var(--k));height:calc(312px*var(--k));background-size:contain;background-position:center bottom}
.pview .stx small{display:block;font-size:calc(12px*var(--k));opacity:.85;font-weight:700}
.pview .stx .pact{margin-top:calc(6px*var(--k));font-size:calc(13px*var(--k));line-height:1.45;font-weight:500;opacity:.85;word-break:keep-all;padding-top:calc(8px*var(--k));border-top:1px solid rgba(255,255,255,.25)}
.pview .stx .pact b{display:inline;font-size:inherit;line-height:inherit;font-weight:800}
.pview .phint{position:absolute;right:max(calc(60px*var(--k)),env(safe-area-inset-right));bottom:max(calc(16px*var(--k)),env(safe-area-inset-bottom));font-size:calc(12px*var(--k));color:rgba(255,255,255,.7)}
.bt4 .vc.pf{cursor:pointer}
body.rmo .pview .paura{animation:none}

/* ----- 공개 설명·말풍선·툴팁 정리(2026-11-06): 크기 고정, 테두리 없음, 같은 모양 ----- */
.zw.zh{flex-direction:row;align-items:stretch;gap:12px;max-width:none;border:0;border-radius:12px;padding:10px;background:linear-gradient(180deg,rgba(20,25,56,.97),rgba(8,10,24,.97));box-shadow:0 14px 34px rgba(0,0,0,.65)}
.zh .zc{flex:none;display:flex;align-items:center}
.zh .zc .bc{box-shadow:none}
.zh .zx{width:190px;flex:none;display:flex;flex-direction:column;gap:6px;text-align:left;min-width:0}
.zh .zt{display:flex;gap:5px;align-items:center;font-weight:700}
.zh .zt span,.zh .zt em{font-size:10px;font-style:normal;line-height:1;padding:4px 7px;border-radius:99px;margin:0;color:#fff}
.zh .zt span{background:#2b5fd0}.zw.zh.opp .zt span{background:#b23a63}
.zh .zt em{background:var(--kc,#4152b5)}
.zh b{font-size:16px;font-weight:800;line-height:1.25;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zh p{margin:0;font-size:13px;line-height:1.5;text-align:left;color:#dfe3f5;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;word-break:keep-all}
.bc.lit,.bt4 .bc.lit,.cell.lit{box-shadow:none!important;filter:brightness(1.15)}
.bub{width:250px;max-width:60vw;border:0;border-radius:8px;padding:7px 10px;font-size:12px;line-height:1.45;background:rgba(10,13,32,.96);box-shadow:0 8px 22px rgba(0,0,0,.55)}
.bub::after{border:0}
.first{width:420px;max-width:90vw;border:0;border-radius:8px;padding:8px 12px;line-height:1.5;text-align:left;background:rgba(10,13,32,.96);box-shadow:0 8px 22px rgba(0,0,0,.55);word-break:keep-all}
.tip{width:220px;max-width:80vw;border:0;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;background:rgba(10,13,32,.97);box-shadow:0 8px 22px rgba(0,0,0,.55);word-break:keep-all}

/* 공개 연출 영어 단계 칩·K.O.(상세 01, 기획지시 11-05) */
.phk{align-self:center;font-size:13px;font-weight:900;letter-spacing:.12em;padding:3px 12px;border-radius:99px;background:rgba(255,214,90,.16);color:#ffd65a;font-family:system-ui,sans-serif;font-style:italic}
.phk.pop{animation:phk .35s cubic-bezier(.2,1.5,.4,1)}
@keyframes phk{0%{transform:scale(1.6);opacity:0}100%{transform:none;opacity:1}}
.koflash{position:absolute;inset:0;z-index:46;pointer-events:none;background:#fff;animation:kofl .45s ease-out forwards}
@keyframes kofl{0%{opacity:.85}100%{opacity:0}}
#bt.koing{pointer-events:none}
.bt3 .vc.down{rotate:-5deg;translate:0 8px;transition:filter .4s,rotate .6s cubic-bezier(.5,0,.6,1.4),translate .6s}

/* 상태 상세(카드 상세 .cdm과 같은 틀) */
.stm .sti{display:grid;place-items:center;width:calc(40px*var(--k));height:calc(40px*var(--k));border-radius:calc(10px*var(--k));background:var(--bc) center/cover no-repeat;color:#0b0e1c;font-style:normal;font-weight:800;font-size:calc(18px*var(--k));flex:none}
.stm .sti.big{width:calc(150px*var(--k));height:calc(150px*var(--k));border-radius:calc(28px*var(--k));font-size:calc(64px*var(--k));box-shadow:0 12px 40px rgba(0,0,0,.7);animation:cdin .3s cubic-bezier(.2,1.4,.4,1) both}
.stm .cdr{max-height:80vh;overflow:auto}
.stm .stb{display:flex;gap:calc(12px*var(--k));align-items:flex-start}
.stm .stb>div{display:flex;flex-direction:column;gap:calc(6px*var(--k))}
.stm .stb b{font-size:calc(28px*var(--k))}

/* 스킬 연출 미리 보기(설정): 화면 전체 탭 = 닫기, 위 오른쪽 방식 전환·닫기는 항상 보임 */
.skpv{position:fixed;inset:0;z-index:59;cursor:pointer}
.skpb{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));display:flex;gap:6px}
.skpb button{height:32px;padding:0 14px;border-radius:99px;border:0;background:rgba(10,13,32,.85);color:#cfd5ee;font-weight:700;font-size:13px}
.skpb button.on{background:#2b5fd0;color:#fff}.skpb .skx{background:#fff;color:#111}
body:has(.skpv) .scut .sskip{display:none}

/* ===== 배너·라벨 폰트 통일과 임팩트 연출(기획지시 2026-11-06 배너폰트·임팩트) =====
   폰트: 턴 시작 배너와 같은 굵은 사선 글꼴(REVEAL!, K.O., 폭주 시작, 6턴 예고·폭주 문구, 단계 칩, 도장·잠금 라벨). 피해·회복 숫자는 기존 숫자 글꼴 */
.tban.t4 .tpill,.ko b,.banner.ib b,.phk,.ilab{font-family:'Arial Black','Segoe UI Black','Noto Sans KR',Impact,sans-serif;font-style:italic;font-weight:900;letter-spacing:-.01em}
.ko b,.banner.ib b,.phk,.stamp.ilab{color:transparent;-webkit-background-clip:text;background-clip:text;padding:0 .2em .05em .1em;
 background-image:linear-gradient(100deg,transparent 0 40%,rgba(255,255,255,.95) 50%,transparent 60% 100%),linear-gradient(180deg,#fff 0 38%,#ffe9a6 58%,#ffb020 100%);background-size:300% 100%,100% 100%;background-position:150% 0,0 0;background-repeat:no-repeat;--o:#2a1600;
 filter:drop-shadow(1.5px 0 0 var(--o)) drop-shadow(-1.5px 0 0 var(--o)) drop-shadow(0 1.5px 0 var(--o)) drop-shadow(0 -1.5px 0 var(--o)) drop-shadow(0 4px 8px rgba(0,0,0,.5))}
.tban.t4 b,.tban.t4 .tbx>span{background-image:linear-gradient(100deg,transparent 0 40%,rgba(255,255,255,.95) 50%,transparent 60% 100%),linear-gradient(180deg,#fff 0 38%,#ffe9a6 58%,#ffb020 100%);background-size:300% 100%,100% 100%;background-position:150% 0,0 0;background-repeat:no-repeat;animation:igl var(--td,1.1s) linear both}
.tban.t4.rush b,.tban.t4.rush .tbx>span{background-image:linear-gradient(100deg,transparent 0 40%,rgba(255,255,255,.95) 50%,transparent 60% 100%),linear-gradient(180deg,#fff 0 35%,#ffc2b0 58%,#ff4a3c 100%)}
@keyframes igl{0%,26%{background-position:150% 0,0 0}52%,100%{background-position:-50% 0,0 0}}  /* 안착 뒤 광택 한 번 */
/* 1) 사선 슬라이드·확대 2.2→1(0.18초, 약한 튕김) → 유지 → 사선으로 사라짐 */
.tban.t4 .tbx{animation:imp var(--td,1.1s) linear both}
@keyframes imp{0%{opacity:0;transform:translate(-26vw,14vh) rotate(-6deg) scale(2.2);animation-timing-function:cubic-bezier(.3,.7,.4,1)}
 16%{opacity:1;transform:rotate(-6deg) scale(.93)}21%{transform:rotate(-6deg) scale(1.04)}26%{transform:rotate(-6deg) scale(1)}
 84%{opacity:1;transform:rotate(-6deg) scale(1);animation-timing-function:cubic-bezier(.5,0,.8,.4)}100%{opacity:0;transform:translate(22vw,-12vh) rotate(-6deg) scale(.96)}}
.tban.t4 .tpill{animation:none}
/* 2) 안착 순간: 충격파 링 + 흰 섬광 0.08초 + 테두리 광채 + 파편 */
.tban.t4 .tsw{z-index:1;animation:tsw .7s ease-out both;animation-delay:calc(var(--td,1.1s)*.16)}
.tban.t4 .tsw.t2{animation-delay:calc(var(--td,1.1s)*.16 + .08s)}
.ifl{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:3;animation:ifl .08s linear both;animation-delay:calc(var(--td,1.1s)*.16)}
@keyframes ifl{0%{opacity:.75}100%{opacity:0}}
.tban.t4 s{z-index:1;animation-delay:calc(var(--td,1.1s)*.16)}
.tban.t4 .tbx::after{content:"";position:absolute;inset:-30% -40%;z-index:-1;background:radial-gradient(closest-side,var(--gc,rgba(255,220,130,.55)),transparent);opacity:0;animation:iglow var(--td,1.1s) linear both;pointer-events:none}
.tban.t4.rush .tbx::after{--gc:rgba(255,150,90,.6)}
@keyframes iglow{0%,15%{opacity:0}18%{opacity:1}50%,100%{opacity:0}}
/* 폭주 시작(공개 중): 중간 강도, 붉은 글자 + 링 + 섬광, 가장자리 붉은 박동은 기존 */
.banner.ib{background:none;border:0;padding:0;font-size:clamp(26px,9vh,52px);overflow:visible;z-index:44;animation:none}
.banner.ib b{display:block;transform:rotate(-6deg);animation:imp var(--td,1.3s) linear both,igl var(--td,1.3s) linear both}
.banner.ib.rush b{background-image:linear-gradient(100deg,transparent 0 40%,rgba(255,255,255,.95) 50%,transparent 60% 100%),linear-gradient(180deg,#fff 0 35%,#ffc2b0 58%,#ff4a3c 100%);--o:#3a0606}
.banner.ib .tsw{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(255,140,90,.95);animation:tsw .7s ease-out both;animation-delay:calc(var(--td,1.3s)*.16)}
.banner.ib .ifl{position:fixed;opacity:0}
/* 3) K.O. 최고: 3배 내리꽂기 → 히트스톱 0.1초 → 튕김 → 떨림, 섬광·균열선·금빛 파편 */
.ko b{font-size:clamp(56px,20vh,140px);letter-spacing:0;line-height:1;text-shadow:none;transform:rotate(-6deg);animation:kos var(--td,1.5s) linear both,igl var(--td,1.5s) linear both}
@keyframes kos{0%{opacity:0;transform:rotate(-6deg) scale(3);animation-timing-function:cubic-bezier(.5,0,1,.6)}
 12%{opacity:1;transform:rotate(-6deg) scale(.9)}18.7%{transform:rotate(-6deg) scale(.9)}24%{transform:rotate(-6deg) scale(1.08)}30%{transform:rotate(-6deg) scale(1)}
 33%{transform:rotate(-6deg) translate(2px,-1px)}36%{transform:rotate(-6deg) translate(-2px,1px)}39%{transform:rotate(-6deg) translate(1px,1px)}42%,100%{opacity:1;transform:rotate(-6deg)}}
.ko .tsw{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:4px solid rgba(255,214,110,.95);box-shadow:0 0 24px rgba(255,200,80,.9);animation:tsw .8s ease-out both;animation-delay:calc(var(--td,1.5s)*.12)}
.ko .tsw.t2{animation-delay:calc(var(--td,1.5s)*.12 + .1s);border-width:2px}
.ko s{position:absolute;left:50%;top:50%;width:7px;height:7px;margin:-3.5px;border-radius:2px;background:#ffe08a;box-shadow:0 0 10px 2px #ffb020;opacity:0;animation:tsp .8s ease-out both;animation-delay:calc(var(--td,1.5s)*.12)}
.ko .crk{position:absolute;inset:0;opacity:0;pointer-events:none;background:
 linear-gradient(32deg,transparent 49.6%,rgba(255,240,200,.85) 50%,transparent 50.4%) 50% 50%/46% 40% no-repeat,
 linear-gradient(-58deg,transparent 49.6%,rgba(255,240,200,.75) 50%,transparent 50.4%) 50% 50%/30% 52% no-repeat,
 linear-gradient(112deg,transparent 49.7%,rgba(255,240,200,.7) 50%,transparent 50.3%) 50% 50%/60% 22% no-repeat;animation:crk var(--td,1.5s) linear both}
@keyframes crk{0%,11%{opacity:0}13%{opacity:1}70%{opacity:.6}100%{opacity:0}}
/* 4) 칩·도장·라벨: 약하게(펀치 확대 + 작은 섬광, 입자 없음), 무음 */
.phk{background-color:transparent;border:0;font-size:15px;letter-spacing:.02em;padding:0 .3em}
.phk.pop{animation:ipunch .3s cubic-bezier(.2,1.5,.4,1),igl 1s linear both}
.stamp.ilab{border-color:#ffb020;background-color:transparent;inset:34% -10% auto;font-size:15cqw;animation:ipunch .28s cubic-bezier(.2,1.5,.4,1) both}
.lk small.ilab{background:rgba(0,0,0,.65);color:#ffd27a;font-size:max(9px,15cqw);animation:ipunch .28s cubic-bezier(.2,1.5,.4,1) both}
@keyframes ipunch{0%{transform:scale(1.7);filter:brightness(2.2)}60%{filter:brightness(1.4)}100%{transform:none;filter:none}}
.stamp.ilab{transform:rotate(-8deg)}
.tban.t4 .tpill{font-weight:900;letter-spacing:0}
/* 5) 동작 줄이기: 흔들림·입자·섬광·균열 끔, 확대 + 페이드만(폰트·기울기 유지) */
body.rmo .tban.t4 .tbx,body.rmo .banner.ib b{animation:imprm var(--td,1.1s) ease-out both}
body.rmo .ko b{animation:imprm var(--td,1.5s) ease-out both}
@keyframes imprm{0%{opacity:0;transform:rotate(-6deg) scale(1.4)}16%,84%{opacity:1;transform:rotate(-6deg) scale(1)}100%{opacity:0;transform:rotate(-6deg)}}
body.rmo .ifl,body.rmo .tsw,body.rmo .ko .crk,body.rmo .ko s,body.rmo .tban.t4 .tbx::after,body.rmo .koflash{display:none}
</style></head><body><div id="app"></div><div id="rot"><i>📱</i><b>가로로 돌려 주세요</b><span class="mu small">전투 화면은 가로 전용이에요</span></div>
<script>
var S={tok:null,data:null,A:null,ws:null,st:null,prev:null,sel:{cards:[],spell:null,active:false},selTurn:0,diff:localStorage.getItem('play_diff')||'normal',anim:null,pending:null,load:null,off:0,showLog:false,hist:[],spd:localStorage.getItem('play_spd')==='2',lastOpp:null,lastTurn:0,rspd:(function(){try{return localStorage.getItem('play_rspd')||'normal'}catch(e){return 'normal'}})(),manual:(function(){try{return localStorage.getItem('play_manual')==='1'}catch(e){return false}})(),hlog:{},lefty:(function(){try{return localStorage.getItem('play_lefty')==='1'}catch(e){return false}})()};
var KIND_KO={immune:'면역',defense:'방어',counter:'반격',silence:'침묵',disrupt:'방해',skill:'스킬',attack:'공격'};
var KIND_SLOT={immune:'IMMUNE',defense:'DEFENSE',counter:'COUNTER',silence:'SILENCE',disrupt:'DISRUPT',skill:'SKILL',attack:'ATTACK'};
var KIND_ORD={attack:0,defense:1,counter:2,silence:3,disrupt:4,skill:5,immune:6};
var FAC={'불':'FIRE','물':'WATER','바람':'WIND'};
var ST={burn:['작열','BURN'],mark:['표식','MARK'],weak:['약화','WEAKEN'],activeSeal:['액티브 봉인','SILENCE'],skillBlock:['스킬 봉쇄','SKILL_LOCK'],energyDown:['에너지 감소','ENERGY_DOWN'],immune:['면역','IMMUNE'],healBoost:['회복 증가',''],spdUp:['속도 증가',''],inferno:['업화','ATK_UP'],greatTide:['대조류','TIDE'],noCarry:['실드 이월 불가',''],handSeal:['손패 봉인','HAND_SEAL'],tide:['조류','TIDE']};
var ERR={emote_limit:'이번 판 감정표현을 다 썼어요(판당 10회)',emote_cooldown:'감정표현은 3초에 한 번',emote_not_equipped:'장착하지 않은 감정표현이에요',surrender_too_early:'항복은 4턴부터 할 수 있어요',timebank_used:'타임뱅크는 판당 1회예요',turn_mismatch:'이미 지난 턴이에요'};
/* 상성(총괄 6장): 공격 → 면역 → 침묵 → 스킬 → 반격 → 공격, 방어는 원 밖 */
var AFF={attack:'상성: 면역을 뚫고 · 반격에 막혀요',immune:'상성: 침묵을 막고 · 공격은 못 막아요',silence:'상성: 스킬을 끊고 · 면역에 막혀요',skill:'상성: 반격을 헛치게 하고 · 침묵에 막혀요',counter:'상성: 공격을 무효로 하고 · 스킬 앞에선 헛방이에요',defense:'상성 밖: 어느 쪽에도 무난한 안전한 선택',disrupt:'상성 밖: 방해 단계(2)에서 상대를 흔들어요'};
var PH=['스펠','보호','방해','스킬','공격','종료'],PH_EN=['SPELL','GUARD','DISRUPT','SKILL','ATTACK','END'];  /* 공개 연출 단계 칩은 영어(상세 01, 기획지시 11-05 2) */
var REASON={hp:'HP 0',surrender:'항복',turn_limit:'최대 턴 도달',afk:'자리 비움',leave:'이탈',disconnect:'연결 끊김'};
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function api(path,body){return fetch(path,{method:body===undefined?'GET':'POST',headers:Object.assign({'content-type':'application/json'},S.tok?{authorization:'Bearer '+S.tok}:{}),body:body===undefined?undefined:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!j.ok)throw new Error(j.error||r.status);return j})})}
function toast(m){var t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(function(){t.remove()},2200)}
function ask(msg,yes,fn){var d=document.createElement('div');d.className='dlg';d.innerHTML='<div><p>'+esc(msg)+'</p><div class="row" style="justify-content:center"><button id="dN">취소</button><button class="pri" id="dY">'+esc(yes)+'</button></div></div>';document.body.appendChild(d);d.querySelector('#dN').onclick=function(){d.remove()};d.querySelector('#dY').onclick=function(){d.remove();fn()}}
function slotU(id){var f=S.A&&S.A.slots[id];return f?'url('+f.url+')':''}
function ch(id){return (S.data&&S.data.characters[id])||{name:id}}
function card(id){return (S.data&&S.data.cards[id])||{name:id,kind:'attack',cost:0,effect_text:''}}
function sname(id){var s=S.data&&S.data.spells[id];return s?s.name:id}
function now(){return Date.now()+S.off}
function left(t){return t?Math.max(0,Math.ceil((t-now())/1000)):0}

/* ---------- 카드 그리기 ---------- */
/* 5:7 카드 영역(BO 지정)을 상자에 깔기: 폭을 꽉 채우고 위 맞춤, 남는 아래는 잘림. bA = 상자 가로/세로(기획지시 2026-11-06 카드영역5대7) */
function regPart(src,cr,bA){var iw=100/cr.w,ih=iw*(src.h/src.w)*bA,py=ih<=100.01?0:Math.min(100,Math.max(0,cr.y/(1-100/ih)*100));
 return {size:iw.toFixed(2)+'% '+ih.toFixed(2)+'%',pos:(cr.w>=1?0:cr.x/(1-cr.w)*100).toFixed(2)+'% '+py.toFixed(2)+'%'}}
function regBg(src,cr,bA){var r=regPart(src,cr,bA);return 'background-image:url('+src.url+');background-repeat:no-repeat;background-size:'+r.size+';background-position:'+r.pos}
function crOf(a){var f=a.full;return a.card||{x:0.125,y:0,w:0.75,h:0.75*(f?f.w/f.h:0.5625)*7/5}}
/* 캐릭터 카드 그림층(.l): 합본이면 합본만 본체 전체(전신 안 그림, 합본규격변경 2), 아니면 배경(진영·컬러) + 전신 5:7 영역 */
function charLay(chr,bA){var c=ch(chr),a=((S.A.art||{})[chr]||{})['000']||{},fb=slotU(a.bgSlot||('CARD_BG_'+(FAC[c.faction]||'NEUTRAL')));
 if(a.bg==='combined'&&a.combined)return '<div class="l art" style="background:url('+a.combined.url+') center/100% 100% no-repeat"></div>';
 var h='<div class="l art" style="'+(a.bg==='color'&&a.bgColor?'background:linear-gradient(180deg,'+a.bgColor+',#111)':fb?'background-image:'+fb:'background:#334')+'"></div>';
 if(a.full)h+='<div class="l" style="'+regBg(a.full,crOf(a),bA||5/7)+'"></div>';return h}
function pvCard(id,o){var c=ch(id),a=((S.A.art||{})[id]||{})['000']||{},sl=S.A.slots;
 var bgCss=a.bg==='color'&&a.bgColor?'background:linear-gradient(180deg,'+a.bgColor+',#111)':(sl[a.bgSlot||('CARD_BG_'+(FAC[c.faction]||'NEUTRAL'))]?'background-image:'+slotU(a.bgSlot||('CARD_BG_'+(FAC[c.faction]||'NEUTRAL'))):'background:#334');
 var chs='';if(a.bg==='combined'&&a.combined)bgCss='background:url('+a.combined.url+') center/100% 100% no-repeat';else if(a.full)chs=regBg(a.full,crOf(a),5/7);
 var fr=o.tier?sl['FRAME_'+o.tier]:null,bd=o.badge>1?sl['MASTERY_'+o.badge]:null,fc=sl['FACTION_'+FAC[c.faction]];
 return '<div class="pvc h'+(o.holo||0)+(o.full?' full':'')+(o.cls?' '+o.cls:'')+'" style="--w:'+o.w+'px"'+(o.attr||'')+'><div class="pvb"><div class="pvl pvbg" style="'+bgCss+'"></div><div class="pvl pvhb"></div>'
  +'<div class="pvwin"><div class="pvl pvchar" style="'+chs+'"></div></div><div class="pvl pvhf"></div><div class="pvl pvsp"></div><div class="pvl pvgl"></div>'
  +'<div class="pvl pvname">'+esc(c.name)+(o.sub?'<small>'+esc(o.sub)+'</small>':'')+'</div></div><div class="pvring"></div>'
  +(fc?'<div class="pvfac" style="background-image:url('+fc.url+')"></div>':'')
  +(fr?'<div class="pvframe" style="background-image:url('+fr.url+')"></div>':'')+(bd?'<div class="pvbadge" style="background-image:url('+bd.url+')"></div>':'')+'</div>'}
function bcCard(id,o){var k=card(id),sl=S.A.slots,art=sl['CARD_ART_'+id],lay='',own=k.owner_character;
 if(own){var c=ch(own),a=((S.A.art||{})[own]||{})['000']||{},f=a.full,cr=a.card,fb=slotU('CARD_BG_'+(FAC[c.faction]||'NEUTRAL'));
  lay=charLay(own)}
 else if(art)lay='<div class="l art" style="background-image:url('+art.url+')"></div>';
 else lay='<div class="l art" style="'+(sl.CARD_BG_NEUTRAL?'background-image:'+slotU('CARD_BG_NEUTRAL'):'background:linear-gradient(160deg,#3a4058,#1b1f2e)')+'"></div><div class="symt">'+esc(KIND_KO[k.kind]||k.kind)+'</div>';
 var fr=sl.CARD_FRAME,cost=o.cost==null?k.cost:o.cost;  // 유형·비용은 텍스트 뱃지(기획지시 2026-11-01 유형에너지텍스트, KIND_* 아이콘 폐지)
 return '<div class="bc'+(o.mode==='hand'?' hand':'')+(o.face?' face2':'')+(o.cls?' '+o.cls:'')+'" style="--w:'+o.w+'px;width:'+o.w+'px"'+(o.attr||'')+' title="'+esc(k.name+' · '+(KIND_KO[k.kind]||'')+' '+cost+'E\n'+(k.effect_text||''))+'">'+lay+'<div class="l shade"></div>'+(fr?'<div class="l frm" style="background-image:url('+fr.url+')"></div>':'')
  +'<div class="bdc">'+(o.fig?'E'+cost:cost+'E')+'</div><div class="bdk" style="background:'+(KCOL[k.kind]||'#8a90a8')+'">'+esc(KIND_KO[k.kind]||k.kind)+'</div>'
  +(own?'<div class="own">전용</div>':'')+'<div class="txt"><div class="nm">'+esc(k.name)+'</div>'+(o.mode==='hand'?(o.face?'<div class="sht">'+esc(shortOf(id))+'</div>':''):'<div class="tx">'+esc(k.effect_text)+'</div>')+'</div>'+(o.extra||'')+'</div>'}
function shortOf(id){var k=card(id),t=k.effect_short||String(k.effect_text||'');return k.effect_short?t:(Array.from(t).length>15?Array.from(t).slice(0,15).join('')+'…':t)}  // 시트 효과_짧게, 없으면 효과 문구 앞 15자(임시)
function backCard(w,extra){return '<div class="bc back" style="--w:'+w+'px;width:'+w+'px;'+(S.A.slots.CARD_BACK?'background-image:'+slotU('CARD_BACK'):'background:linear-gradient(160deg,#2a3a7a,#141a3a)')+'">'+(extra||'')+'</div>'}
function faceCss(id){var a=((S.A.art||{})[id]||{})['000']||{},f=a.full,r=a.faceRect;if(a.faceFrom==='combined'&&a.combined&&a.faceRectC){f=a.combined;r=a.faceRectC}
 if(f&&r){var s=100/r.w;return 'background-image:url('+f.url+');background-size:'+s.toFixed(1)+'% auto;background-position:'+(r.w>=1?0:r.x/(1-r.w)*100).toFixed(1)+'% '+(r.h>=1?0:r.y/(1-r.h)*100).toFixed(1)+'%'}
 if(a.thumb||f)return 'background-image:url('+(a.thumb||f).url+');background-size:220% auto;background-position:50% 8%';return ''}

/* 안전 영역(노치·카메라 구멍·홈 표시줄, 기획지시 2026-11-01 픽5열안전영역): env() 값을 읽어 CSS 변수 --st/--sr/--sb/--sl와 배치 계산에 같이 쓴다. 시험은 window.__SAFE로 흉내 */
function safe(){var k=S.zs||1;if(window.__SAFE){var w=window.__SAFE;return {t:w.t/k,r:w.r/k,b:w.b/k,l:w.l/k}}var e=S.safeEl;if(!e){e=document.createElement('div');e.style.cssText='position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.appendChild(e);S.safeEl=e}
 var c=getComputedStyle(e),f=function(x){return (parseFloat(x)||0)/k};return {t:f(c.paddingTop),r:f(c.paddingRight),b:f(c.paddingBottom),l:f(c.paddingLeft)}}
function applySafe(){var f=safe(),d=document.documentElement.style;d.setProperty('--st',f.t+'px');d.setProperty('--sr',f.r+'px');d.setProperty('--sb',f.b+'px');d.setProperty('--sl',f.l+'px');return f}
/* ---------- 시작 ---------- */
function boot(){applySafe();
 Promise.all([fetch('/v1/data/live').then(function(r){return r.json()}),fetch('/v1/assets').then(function(r){return r.json()})]).then(function(x){S.data=x[0].data;S.A=x[1].assets||x[1];if(!S.A.slots)S.A={slots:{},art:{}};
  if(S.A.slots.BG_BATTLE)$('app').style.backgroundImage=slotU('BG_BATTLE');home()}).catch(function(e){offline(e)})}
function offline(e){$('app').innerHTML='<div class="scr home"><h1>연결이 필요해요</h1><p class="mu">전투는 항상 온라인이에요. 인터넷에 연결되면 자동으로 다시 시도해요.</p><button class="pri" id="retry">다시 시도</button><p class="small mu">'+esc(e&&e.message||'')+'</p></div>';$('retry').onclick=boot}
addEventListener('online',function(){if(!S.data)boot();netBar()});addEventListener('offline',netBar);
function netBar(){var bad=S.room&&sessionStorage.getItem('play_room')&&(!S.ws||S.ws.readyState!==1)&&document.visibilityState==='visible',off=!navigator.onLine,el=$('net');
 if(S.replaced&&bad){if(!el){el=document.createElement('div');el.id='net';document.body.appendChild(el)}el.className='';el.innerHTML='다른 화면(탭·기기)에서 이 판에 접속해서 여기 연결이 끊겼어요 <button class="sm" id="netRe">여기서 다시 연결</button>';$('netRe').onclick=function(){S.replaced=false;connect(sessionStorage.getItem('play_room'))};return}
 if(bad){S.badAt=S.badAt||Date.now();bad=Date.now()-S.badAt>3500}else S.badAt=0;
 if(!bad&&!(off&&S.data)){if(el)el.remove();return}if(!el){el=document.createElement('div');el.id='net';document.body.appendChild(el)}
 el.className=off?'off':'';el.innerHTML=off?'<b>연결이 필요해요</b><span class="small mu">다시 연결되면 지금 판으로 이어져요(재접속 유예 60초)</span>':'연결이 불안정해요 · 다시 연결 중…'}
setInterval(netBar,1000);
function home(msg){applyZoom();S.st=null;S.prev=null;wake(false);var dev=localStorage.getItem('play_dev')||'',P=window.PWA||{};
 $('app').innerHTML='<div class="scr home"><h1>Chrono Arcadia</h1><div class="mu">Astral Soul · 전투 테스트</div>'
 +'<div class="row" style="justify-content:center">'+[['easy','쉬움'],['normal','보통'],['hard','어려움']].map(function(d){return '<button data-d="'+d[0]+'" class="'+(S.diff===d[0]?'on':'')+'">'+d[1]+'</button>'}).join('')+'</div>'
 +'<div class="row" style="justify-content:center;gap:10px"><button class="pri" id="go" style="font-size:17px;padding:12px 28px">AI 대전</button><button class="pri" id="pvp" style="font-size:17px;padding:12px 28px;background:linear-gradient(180deg,#f5b93a,#d9962a);color:#070a1c;border-color:#ffd97a">유저 대전 (랜덤 매칭)</button></div>'
 +'<div id="qbox" class="small" style="min-height:18px"></div>'
 +'<div class="small mu"><button class="sm" id="musT">음악 '+(S.musOff?'꺼짐':'켜짐')+'</button> <button class="sm" id="sndT">효과음 '+(S.sndOff?'꺼짐':'켜짐')+'</button></div>'
 +'<div class="small mu">닉네임 <input id="nick" value="'+esc(lsGet('play_nick')||'')+'" placeholder="2~12자 (밴픽에 보여요)" maxlength="12" autocomplete="off"></div>'
 +'<div class="small mu">테스트 계정 <input id="dev" value="'+esc(dev)+'" placeholder="아이디 (예: kim01)" autocapitalize="off" autocomplete="off"> <br>/dev에서 쓰던 아이디를 넣으면 그 계정 티어 프레임·숙련도로 보여요(그 계정의 다른 창은 로그아웃돼요).</div>'
 +(msg?'<div class="small" style="color:var(--bad)">'+esc(msg)+'</div>':'')
 +(P.prompt?'<button id="inst">앱으로 설치</button>':'')
 +(P.ios&&!P.standalone&&!lsGet('pwa_ios_hint')?'<div class="hint" id="ihint">홈 화면 앱으로 쓰려면 사파리 아래 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>를 눌러 주세요. 가로로 돌려서 하면 돼요. <button id="ihok" style="padding:2px 10px;margin-left:4px">알겠어요</button></div>':'')
 +'<div class="small mu keys" style="max-width:420px">소리·컷인·다듬은 효과는 빠진 느낌 확인용이에요. 키: 1~7 카드 · Q/W 스펠 · E 액티브 · Space 확정 · T 타임뱅크 · L 로그</div></div>';
 document.querySelectorAll('[data-d]').forEach(function(b){b.onclick=function(){S.diff=b.dataset.d;localStorage.setItem('play_diff',S.diff);home()}});
 if($('inst'))$('inst').onclick=function(){PWA.install()};if($('ihok'))$('ihok').onclick=function(){lsSet('pwa_ios_hint','1');$('ihint').remove()};
 var devOk=function(){var d=$('dev').value.trim().toLowerCase();if(!/^[a-z0-9_-]{3,32}$/.test(d)){toast('아이디는 영문 소문자·숫자 3~32자');return null}var n=$('nick').value.trim();if(n&&!/^[\p{L}\p{N}_]{2,12}$/u.test(n)){toast('닉네임은 한글·영문·숫자·_ 2~12자');return null}localStorage.setItem('play_dev',d);lsSet('play_nick',n);return d};
 $('musT').onclick=function(){S.musOff=!S.musOff;lsSet('play_mus',S.musOff?'0':'1');sndInit();sndSet();this.textContent='음악 '+(S.musOff?'꺼짐':'켜짐')};$('sndT').onclick=function(){S.sndOff=!S.sndOff;lsSet('play_snd',S.sndOff?'0':'1');sndSet();this.textContent='효과음 '+(S.sndOff?'꺼짐':'켜짐')};
 $('go').onclick=function(){var d=devOk();if(d)start(d)};$('pvp').onclick=function(){var d=devOk();if(d)queueStart(d)};
 var code=sessionStorage.getItem('play_room');if(code&&!msg){if(S.tok)connect(code);else login(dev).then(function(){connect(code)}).catch(function(){sessionStorage.removeItem('play_room')})}}
window.onPwaChange=function(){if(!S.st&&S.data&&$('go'))home()};
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
/* 닉네임: 입력한 이름이 계정 이름과 다르면 바꿈(첫 변경 무료·이후 골드, 상세 05). 실패해도 판은 시작 */
var NAME_ERR={name_invalid:'닉네임은 2~12자',name_banned:'쓸 수 없는 단어가 들어 있어요',name_taken:'이미 쓰는 닉네임이에요',gold_insufficient:'닉네임 변경 골드가 부족해요(첫 변경만 무료)',insufficient_gold:'닉네임 변경 골드가 부족해요(첫 변경만 무료)'};
function ensureName(){var n=lsGet('play_nick')||'',k='play_nick_ok_'+(lsGet('play_dev')||'');if(!n||lsGet(k)===n)return Promise.resolve();return api('/v1/profile/name',{name:n,requestId:'nm-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)}).then(function(){lsSet(k,n);S.myName=n;toast('닉네임: '+n)}).catch(function(e){toast(NAME_ERR[e.message]||('닉네임 변경 실패: '+e.message))})}  /* 이 기기에서 이미 바꾼 이름이면 다시 요청하지 않음(두 번째부터 골드) */
function myName(P){return (P&&P.names&&P.names.mine)||S.myName||'나'}
function oppName(P,m){var n=P&&P.names&&P.names.opp;return n||('상대'+(m&&m.mode==='practice'?' (AI)':''))}
/* 유저 대전: 접속한 유저끼리 랜덤 매칭(랭킹전 큐, 사람만). 120초 안에 못 찾으면 취소 */
var QERR={queue_locked:'이탈 누적으로 잠시 매칭할 수 없어요',dodge_blocked:'닷지로 5분 동안 매칭할 수 없어요',rank_restricted:'제재로 랭킹전을 할 수 없어요',session_ended:'다른 곳에서 로그인해서 끝났어요'};
function queueStart(d){var qb=$('qbox'),go=$('go'),pv=$('pvp');if(S.qws){try{S.qws.send('{"type":"cancel"}')}catch(e){}return}
 busy(pv,'매칭 준비 중…');go.disabled=true;qb.textContent='';
 login(d).then(ensureName).then(function(){return api('/v1/queue/ticket',{humanOnly:true,defaults:defs()})}).then(function(j){
  var ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/v1/queue/ws?ticket='+encodeURIComponent(j.ticket));S.qws=ws;pv.disabled=false;pv.classList.remove('busy');pv.textContent='매칭 취소';
  qb.textContent='상대를 찾는 중…'+(j.waitBeforeMin?' (이탈 누적으로 '+j.waitBeforeMin+'분 대기)':'');
  ws.onmessage=function(e){var m=JSON.parse(e.data);if(m.type==='waiting'){if($('qbox'))$('qbox').textContent='상대를 찾는 중… '+m.waitSec+'초'}
   else if(m.type==='matched'){S.qws=null;try{ws.close()}catch(x){}sndInit();sfx('match');toast('매칭 성사! ('+m.waitSec+'초)');connect(m.code)}
   else if(m.type==='timeout'){toast('지금 접속한 상대가 없어요. 잠시 뒤 다시 하거나 AI 대전을 해 보세요')}};
  ws.onclose=function(){if(S.qws===ws){S.qws=null;if(!S.st)home()}}})
 .catch(function(e){S.qws=null;home(QERR[e.message]||('매칭 실패: '+e.message))})}
function login(d){return api('/v1/auth/dev',{devId:d}).then(function(j){S.tok=j.accessToken})}
function defs(){var l=lsGet('play_last'),ld=lastLoad(l);return {preferred:l?[l]:[],spells:ld.spells,preset:ld.preset}}
function start(d){busy($('go'),'AI 대전 준비 중…');login(d).then(ensureName).then(function(){return api('/v1/practice',{difficulty:S.diff,defaults:defs()})}).then(function(j){connect(j.code)}).catch(function(e){home('시작 실패: '+e.message)})}
function connect(code){sessionStorage.setItem('play_room',code);if(S.room!==code){S.room=code;S.emo={};S.emLeft=null;S.emoOpen=false;S.hlog={};S.lastOpp=null;S.pickedSelf=null;S.loadSelf=false;S.load=null;S.menu=false}api('/v1/rooms/'+code+'/ticket',{}).then(function(j){
 var ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/v1/rooms/'+code+'/ws?ticket='+encodeURIComponent(j.ticket));S.ws=ws;S.replaced=false;ws.last=Date.now();
 ws.onopen=function(){ws.last=Date.now();S.badAt=0;S.retry=0;flushQ()};
 ws.onmessage=function(e){ws.last=Date.now();var m=JSON.parse(e.data);if(m.type==='pong')return;if(m.type==='room')onRoom(m);else if(m.type==='error'){toast(ERR[m.error]||('오류: '+m.error));if(S.st&&!S.anim)render()}  /* 서버가 거절하면 '확정 중…' 버튼을 원래대로 */else if(m.type==='emote')emoteShow(m);else if(m.type==='emote_muted')toast('이 판 동안 상대 감정표현을 껐어요');else if(m.type==='afk_warning')toast('⚠ 2턴째 행동 없음: 다음 턴도 없으면 패배 처리')};
 ws.onclose=function(e){clearInterval(ws.hb);if(S.ws!==ws)return;if(e.code===4001){S.replaced=true;return}S.retry=(S.retry||0)+1;setTimeout(function(){if(sessionStorage.getItem('play_room')===code&&S.ws===ws)connect(code)},Math.min(4000,400*S.retry))};
 ws.hb=setInterval(function(){if(ws.readyState!==1)return;if(Date.now()-ws.last>25000){try{ws.close()}catch(e){}return}ws.send('{"type":"ping"}')},10000);  /* 10초 핑(서버 자동 퐁), 25초 무응답이면 끊고 재연결 */
}).catch(function(e){if(e instanceof TypeError&&sessionStorage.getItem('play_room')===code){setTimeout(function(){if(sessionStorage.getItem('play_room')===code)connect(code)},2000);return}sessionStorage.removeItem('play_room');home('접속 실패: '+e.message)})}
function send(o){if(S.ws&&S.ws.readyState===1){S.ws.send(JSON.stringify(o));return true}if(o.type==='ping'||o.type==='leave')return false;S.outq=(S.outq||[]).filter(function(x){return x.o.type!==o.type}).concat([{o:o,at:Date.now()}]);return false}  /* 끊긴 동안은 종류별 마지막 1건만 대기(10초 지나면 버림) */
function flushQ(){var q=S.outq||[];S.outq=[];q.forEach(function(x){if(Date.now()-x.at<10000)send(x.o)})}
function quit(){sessionStorage.removeItem('play_room');var ws=S.ws;S.ws=null;if(ws){try{ws.send('{"type":"leave"}')}catch(e){}clearInterval(ws.hb);ws.onclose=null;setTimeout(function(){try{ws.close()}catch(e){}},300)}}

/* ---------- 화면 꺼짐 방지(Wake Lock, 미지원이면 생략)·판 진행 중 표시(새 버전 띠 숨김) ---------- */
function wake(on){S.wakeOn=on;try{if(on&&!S.wl&&navigator.wakeLock&&document.visibilityState==='visible')navigator.wakeLock.request('screen').then(function(l){S.wl=l;l.addEventListener('release',function(){S.wl=null})}).catch(function(){});if(!on&&S.wl){S.wl.release();S.wl=null}}catch(e){}}
document.addEventListener('visibilitychange',function(){if(document.visibilityState!=='visible')return;if(S.wakeOn)wake(true);var code=sessionStorage.getItem('play_room');if(code&&(!S.ws||S.ws.readyState>1)&&!S.replaced){S.badAt=0;connect(code)}});  /* 앱으로 돌아오면 바로 재연결 */
window.PWA_BUSY=function(){return !!(S.anim||(S.st&&['ban','pick','loadout','battle'].indexOf(S.st.phase)>=0))};
document.addEventListener('contextmenu',function(e){e.preventDefault()});

/* ---------- 방 상태 ---------- */
function onRoom(m){if(m.now)S.off=m.now-Date.now();
 var old=S.st;S.st=m;
 if(old&&old.phase==='pick'&&m.phase==='loadout'&&!S.pickedSelf)toast('시간이 지나 자동으로 골랐어요: '+ch(m.prep.myPick).name+' (직전 사용 → 목록 첫 번째 순)');
 if(old&&old.phase==='loadout'&&m.phase==='battle'&&!S.loadSelf)toast('시간이 지나 직전 스펠·덱으로 시작해요');
 if(m.phase==='result'&&S.counted!==m.code+':'+(m.last&&m.last.id)){S.counted=m.code+':'+(m.last&&m.last.id);var k='play_games_'+(lsGet('play_dev')||'');lsSet(k,String(Number(lsGet(k)||0)+1))}
 if(m.phase==='pick'){S.pickedSelf=S.pickedSelf&&m.prep.myPick?S.pickedSelf:null;S.loadSelf=false}
 if(S.anim){S.pending=m;return}
 var ob=old&&old.battle,nb=m.battle;
 if(ob&&nb&&m.phase==='battle'&&nb.turn>ob.turn){return play(ob,nb.log,m)}
 if(ob&&old.phase==='battle'&&m.phase==='result'&&m.lastLog&&m.lastLog[0]&&m.lastLog[0].turn===ob.turn){return play(ob,m.lastLog,m)}
 render()}
function render(){applyZoom();musicSync();var m=S.st;if(!m)return home();if(m.phase!=='battle')document.querySelectorAll('body > .tban,body > .scut,body > .pview,body > .rvl,#peek.cdm').forEach(function(x){x.remove()});S.showLog=S.showLog&&m.phase==='battle';wake(['pick','loadout','battle'].indexOf(m.phase)>=0);
 if(m.phase==='closed'){quit();return home('판이 닫혔어요('+(m.notice||'')+')')}
 if(m.phase==='pick'||m.phase==='ban')return renderPick(m);
 if(m.phase==='loadout')return renderLoadout(m);
 if(m.phase==='battle')return renderBattle(m);
 if(m.phase==='result')return renderResult(m);
 $('app').innerHTML='<div class="scr home"><div class="mu">준비 중…</div></div>'}
function stepChips(cur){return '<div class="chips">'+[['pick','픽'],['loadout','스펠·덱'],['battle','전투']].map(function(x){return '<span class="chip'+(x[0]===cur||(cur==='ban'&&x[0]==='pick')?' on':'')+'">'+x[1]+'</span>'}).join('')+'</div>'}
function topBar(m,label){return '<div class="top">'+stepChips(m.phase)+'<div class="mu small">'+esc(label)+'</div><div class="timer" id="tm"></div></div>'}
function frameOf(f){return {tier:(f&&f.frame)||'BRONZE',holo:f&&f.holo!=null?f.holo:0}}
/* 밴·픽: 가로 3단(기획지시 2026-11-01 밴픽화면재배치). 왼쪽 내 선택 · 가운데 4열 목록(이 화면만 세로 스크롤, 줄 단위 멈춤) · 오른쪽 상대 "?".
   선택 테두리 자리는 처음부터 2pt(투명) → 눌러도 크기·위치 불변. 눌러 둔 캐릭터는 서버에 hint로 보내 시간 초과 때 그것으로 확정(37차) */
/* 픽 배치(기획지시 픽5열안전영역): 폭 = 화면 − 좌우 안전 영역 − 좌우 14 → 좌 19% / 중앙 62% / 우 19%, 단 사이 12. 중앙 5열(9명 5+4), 크기 = min(폭, 2줄 높이), 72 미만이면 4열 */
/* 화면 배율(사용자 요청 2026-11-02, 4K·태블릿·휴대폰): 기준 높이로 앱 전체를 확대·축소. 배치는 가상 크기 VW()×VH()로 계산하고 #app을 scale로 키움.
   몸통 위에 띄우는 팝업(카드 상세·툴팁·턴 배너)은 실제 화면 기준 */
/* 기기별로 화면을 꽉 쓰게(사용자 요청 2026-11-02): 휴대폰 가로(높이 500 이하)는 높이 390 기준, 높이 700 이상(태블릿·노트북·4K)은 높이 800 기준으로 배율. 안전 영역 값도 같은 배율로 나눠 유지 */
function bigScale(){var W=innerWidth,H=innerHeight,s=1;if(H<=500&&W>H)s=Math.max(1,Math.min(1.25,H/390,W/760));else if(H>=700&&W>H)s=Math.max(1,Math.min(H/800,W/1000));return Math.round(s*1000)/1000}
function VW(){return innerWidth/(S.zs||1)}function VH(){return innerHeight/(S.zs||1)}
function applyZoom(){var z=bigScale(),a=$('app'),ch=S.zs!==z;S.zs=z;if(ch)applySafe();if(!a)return;if(z!==1){a.style.width=(innerWidth/z)+'px';a.style.height=(innerHeight/z)+'px';a.style.right='auto';a.style.bottom='auto';a.style.transform='scale('+z+')';a.style.transformOrigin='0 0'}else{a.style.width='';a.style.height='';a.style.right='';a.style.bottom='';a.style.transform='';a.style.transformOrigin=''}}
function prepPad(){var f=safe(),short=VH()<=500;return {t:Math.max(12,f.t),r:f.r+14,b:Math.max(12,f.b),l:f.l+14,short:short}}  // 상하단 12 확보(사용자 요청 2026-11-01), 안전 영역이 더 크면 그만큼  // 확정 버튼은 홈 표시줄 위로 12
function padCss(p){return 'padding:'+p.t+'px '+p.r+'px '+p.b+'px '+p.l+'px'}
function pickLay(n){var W=VW(),H=VH(),p=prepPad(),short=p.short,gap=12,inner=W-p.l-p.r-2*gap,side=Math.round(inner*0.19),cen=inner-2*side;
 var topH=short?30:40,topM=short?4:12,band=short?28:44,barH=short?40:46,barM=short?4:12,g8=8;  // 상하단 12 확보 후에도 휴대폰 5열 유지
 var listH=H-p.t-p.b-topH-topM-band-6-barH-barM,rowsFit=function(cols,w){return Math.ceil(n/cols)*(w*1.4+4)+(Math.ceil(n/cols)-1)*g8+8};
 var cols=5,wW=Math.floor((cen-8-(cols-1)*g8)/cols)-4,wH=Math.floor(((listH-4-g8)/2)/1.4)-4,cw=Math.min(wW,wH,170);
 if(cw<72){cols=4;cw=Math.min(Math.floor((cen-8-3*g8)/4)-4,170)}
 var sideH=H-p.t-p.b-topH-topM-barH-barM-18,sw=Math.floor(Math.min(side,sideH*0.7/1.4));  // 사선(전투와 같게): 나 왼쪽 아래, 상대 오른쪽 위 — 높이를 다 쓰지 않아 위아래 차이가 보이게
 return {p:p,gap:gap,side:side,cen:cen,cw:cw,cols:cols,listH:listH,sw:sw,band:band,short:short,scroll:rowsFit(cols,cw)>listH+1}}
function renderPick(m){var P=m.prep,ban=m.phase==='ban',z=pickLay(P.characters.length),done=ban?!!P.myBan:!!P.myPick;
 var cur=ban?(P.myBan||S.banSel):(P.myPick||(S.pickSel&&P.banned.indexOf(S.pickSel)<0?S.pickSel:null));if(cur&&P.characters.indexOf(cur)<0)cur=null;
 var c=cur?ch(cur):null,badge=function(id){return (P.mastery.mine||{})[id]||1};
 var mine=cur?pvCard(cur,{w:z.sw,holo:0,badge:ban?1:badge(cur),tier:P.frame?frameOf(P.frame.mine).tier:null,cls:'rnd'+(ban?' ban':'')}):'<div class="emp" style="width:'+z.sw+'px">'+(ban?'밴할 캐릭터':'선택 전')+'</div>';
 var h='<div class="scr pk3" style="'+padCss(z.p)+';--side:'+z.side+'px;--cen:'+z.cen+'px;--g:'+z.gap+'px;--band:'+z.band+'px">'+topBar(m,done?(ban?'밴 완료':'선택 완료')+' · 상대 '+((ban?P.oppBanDone:P.oppPickDone)?'완료':'선택 중'):(ban?'상대가 못 쓰게 할 캐릭터를 고르세요':'캐릭터를 고르고 확정하세요 (동시·비공개)'))
  +'<div class="pk3b"><div class="pcol me"><div class="lab2">'+esc(myName(P))+(ban?' · 내 밴':'')+'</div>'+mine+'</div>'  /* 카드 안에 이름이 있어 아래 이름 삭제(기획지시 2026-11-06 이름중복) */
  +'<div class="pmid"><div class="plist c'+z.cols+(z.scroll?' scr2':'')+'" id="plist" style="--pw:'+(z.cw+4)+'px">'+P.characters.map(function(id){var x=ch(id),bn=!ban&&P.banned.indexOf(id)>=0;
   return '<div class="pk'+(cur===id?' sel':'')+(bn?' off':'')+'" data-pick="'+id+'">'+pvCard(id,{w:z.cw,holo:0,badge:badge(id),sub:x.role||'',cls:'rnd'+(bn?' ban':'')})+'<i class="ck">✓</i></div>'}).join('')+'</div>'
  +'<div class="pband">'+(c?'<div><b>'+esc(c.name)+'</b> <span class="mu">'+esc((c.job||'')+' · '+(c.role||''))+'</span> · 패시브 <b>'+esc(c.passive_name||'')+'</b> '+esc(c.passive_text||'')+'</div><div>액티브 <b>'+esc(c.active_name||'')+'</b> '+esc(c.active_text||'')+'</div>':'<div class="mu">캐릭터를 누르면 스킬이 보여요 · 시간이 지나면 '+(ban?'눌러 둔 캐릭터를 밴(없으면 밴 없음)':'눌러 둔 캐릭터 → 직전에 쓴 캐릭터 순으로 자동 선택')+'</div>')+'</div></div>'
  +'<div class="pcol opp"><div class="lab2">'+esc(oppName(P,m))+'</div><div class="qcard" style="width:'+z.sw+'px">?</div></div></div>'
  +'<div class="row bar pbar"><button id="qt">나가기</button><button class="pri confirm" id="pok"'+(done||!cur?' disabled':'')+(done?'':' data-lab="'+(ban?'밴 확정':'선택 확정')+'"')+'>'+(done?'대기 중…':(ban?'밴 확정':'선택 확정')+' ('+left(m.phaseDeadline)+'초 남음)')+'</button></div></div>';
 var keep=$('plist')?$('plist').scrollTop:0;$('app').innerHTML=h;var pl=$('plist');pl.scrollTop=keep;
 var fade=function(){pl.classList.toggle('more',z.scroll&&pl.scrollTop+pl.clientHeight<pl.scrollHeight-4)};pl.onscroll=fade;fade();
 document.querySelectorAll('[data-pick]').forEach(function(el){el.onclick=function(){var id=el.dataset.pick;if(done||(!ban&&P.banned.indexOf(id)>=0))return;if(ban)S.banSel=id;else S.pickSel=id;send({type:'hint',characterId:id});render()}});
 $('pok').onclick=confirmPick;$('qt').onclick=function(){quit();home()}}
function confirmPick(){var m=S.st;if(!m||(m.phase!=='pick'&&m.phase!=='ban'))return;var P=m.prep;
 if(m.phase==='ban'){if(P.myBan||!S.banSel)return;send({type:'ban',characterId:S.banSel});return}
 var id=S.pickSel;if(P.myPick||!id||P.banned.indexOf(id)>=0)return;S.pickedSelf=id;lsSet('play_last',id);send({type:'pick',characterId:id});var b=$('pok');if(b){busy(b,'확정 중…')}}
/* 스펠·덱(재배치 3): 왼쪽 상대(위)·나(아래) 같은 크기, 오른쪽 스펠 8종 한 줄(링+체크, 2개) + 설명 한 줄 + 덱 탭 + 덱 12장 한 줄(이름 없이, 길게 누르면 상세). 폭 44 미만이면 6×2 */
/* 스펠·덱(사용자 요청 2026-11-01): 픽 화면과 같은 틀 — 왼쪽 아래 나, 오른쪽 위 상대(19% 열), 가운데 스펠 8종 + 설명 + 덱 탭 + 덱 12장 두 줄(6×2) */
function loLay(){var W=VW(),H=VH(),p=prepPad(),short=p.short,gap=12,inner=W-p.l-p.r-2*gap,side=Math.round(inner*0.19),cen=inner-2*side;
 var topH=short?30:40,topM=short?4:12,barH=short?40:46,barM=short?4:12,cenH=H-p.t-p.b-topH-topM-barH-barM,sideH=cenH-40,sw=Math.floor(Math.min(side,sideH*0.7/1.4));
 var spH=short?68:86,infoH=short?18:20,tabsH=short?34:38,avail=cenH-spH-infoH-tabsH-3*8,dw=Math.floor(Math.min((cen-5*6)/6,(avail-6)/2/1.4,96));
 return {p:p,gap:gap,side:side,cen:cen,sw:sw,dw:dw,two:true,short:short}}
var DECK_DESC={aggro:'먼저 크게 때려요',balance:'공격·방어를 고루',defense:'막고 버티며 이겨요',variant:'받아치며 흐름을 뺏어요'};  // 덱 설명 한 줄(기획답변 46차: 12자 안팎 제안)
var STYLE_KO={aggro:'공세',balance:'균형',defense:'수비',variant:'변칙'};
function renderLoadout(m){var P=m.prep,z=loLay();S.load=S.load||lastLoad(P.myPick);var L=P.myLoadout||S.load,done=!!P.myLoadout;
 var preset=(S.data.presets[P.myPick]||[]).find(function(x){return x.slot===L.preset})||{cards:[]};
 var own=Object.keys(S.data.cards).filter(function(id){return S.data.cards[id].owner_character===P.myPick}).sort(),deck=preset.cards.concat(own);  // 덱 12장 = 프리셋 10 + 전용 2(엔진 buildDeck)
 var sp=L.spells,desc=sp.map(function(id){return sname(id)+': '+((S.data.spells[id]||{}).effect_text||'')}).join(' / ');
 var h='<div class="scr lo3 pk3" style="'+padCss(z.p)+';--side:'+z.side+'px;--cen:'+z.cen+'px;--g:'+z.gap+'px">'+topBar(m,done?'준비 완료 · 상대 '+(P.oppLoadoutDone?'완료':'선택 중'):'스펠 2개와 덱을 고르세요')
  +'<div class="pk3b"><div class="pcol me"><div class="lab2">'+esc(myName(P))+'</div>'+pvCard(P.myPick,{w:z.sw,holo:0,cls:'rnd',tier:P.frame?frameOf(P.frame.mine).tier:null,badge:(P.mastery.mine||{})[P.myPick]||1})+'</div>'
  +'<div class="rcol2"><div class="sprow">'+Object.keys(S.data.spells).map(function(id){var s=S.data.spells[id],ic=S.A.slots['SPELL_'+id],on=sp.indexOf(id)>=0;
   return '<button class="spb2'+(on?' on':'')+'" data-sp="'+id+'"'+(done?' disabled':'')+' data-tip="'+esc(s.name+' · 쿨다운 '+s.cooldown+'턴 — '+(s.effect_text||''))+'"><i style="'+(ic?'background-image:url('+ic.url+')':'')+'">'+(ic?'':esc(s.name.slice(0,1)))+'</i><b>'+esc(s.name)+'</b><small>쿨 '+s.cooldown+'</small>'+(on?'<em>✓</em>':'')+'</button>'}).join('')+'</div>'
  +'<div class="small mu line1" id="spinfo">'+esc(desc||'스펠 2개를 고르세요')+'</div>'
  +'<div class="row tabs">'+(S.data.presets[P.myPick]||[]).map(function(p){return '<button data-pre="'+p.slot+'" class="sm tab2'+(L.preset===p.slot?' on':'')+'"'+(done?' disabled':'')+'>'+(STYLE_KO[p.style]||p.style)+' 덱</button>'}).join('')+'<span class="small mu line1">'+esc(DECK_DESC[preset.style]||'')+' · 카드를 누르면 상세</span></div>'
  +'<div class="deck2'+(z.two?' two':'')+'" style="--dw:'+z.dw+'px">'+deck.map(function(id){return bcCard(id,{w:z.dw,mode:'hand',cls:'mini',attr:' data-cid="'+id+'"'})}).join('')+'</div></div>'
  +'<div class="pcol opp"><div class="lab2">'+esc(oppName(P,m))+'</div>'+pvCard(P.oppPick,{w:z.sw,holo:0,cls:'rnd',tier:P.frame?frameOf(P.frame.opp).tier:null,badge:(P.mastery.opp||{})[P.oppPick]||1})+'</div></div>'
  +'<div class="row bar pbar"><button id="qt">나가기</button><button class="pri confirm" id="ok"'+(done||sp.length!==2?' disabled':'')+(done?'':' data-lab="준비 완료"')+'>'+(done?'대기 중…':'준비 완료 ('+left(m.phaseDeadline)+'초 남음)')+'</button></div></div>';
 $('app').innerHTML=h;
 document.querySelectorAll('[data-sp]').forEach(function(b){b.onclick=function(){var id=b.dataset.sp,i=S.load.spells.indexOf(id);if(i>=0)S.load.spells.splice(i,1);else{if(S.load.spells.length>=2)S.load.spells.shift();S.load.spells.push(id)}render()};
  b.onmouseenter=function(){var s=S.data.spells[b.dataset.sp];$('spinfo').textContent=s.name+': '+s.effect_text}});
 document.querySelectorAll('[data-pre]').forEach(function(b){b.onclick=function(){S.load.preset=Number(b.dataset.pre);render()}});
 $('ok').onclick=confirmLoad;$('qt').onclick=function(){quit();home()}}
function lastLoad(id){try{var x=JSON.parse(localStorage.getItem('play_load_'+id)||'null');if(x&&x.spells&&x.spells.length===2)return x}catch(e){}return {spells:['SP01','SP04'],preset:2}}
function confirmLoad(){var P=S.st.prep;if(P.myLoadout||S.load.spells.length!==2)return;S.loadSelf=true;lsSet('play_load_'+P.myPick,JSON.stringify(S.load));send({type:'loadout',spells:S.load.spells,preset:S.load.preset});var b=$('ok');if(b){busy(b,'확정 중…')}}

/* ---------- 전투 ---------- */
function effCosts(me,uids){var free=me.freeOneCost||0;return uids.map(function(u){var c=me.hand.find(function(x){return x.uid===u});if(!c)return 0;if(free>0&&c.cost===1){free--;return 0}return c.cost})}
function sumCost(me,uids){return effCosts(me,uids).reduce(function(a,b){return a+b},0)}
function phOf(id){var p=card(id).phase;return p==null?4:Number(p)}
function phLab(id){var p=phOf(id);return p+' '+PH[p]+(card(id).kind==='counter'?' · 반격 대기':'')}
function byPhase(list,idOf){return list.map(function(x,i){return {x:x,i:i,p:phOf(idOf(x))}}).sort(function(a,b){return a.p-b.p||a.i-b.i}).map(function(o){return o.x})}
/* 종류별 색(가안, 기획지시 효과연출 4): 빛·슬롯 테두리·자막·로그에 같은 색. 시안 나오면 이 표만 바꾼다 */
var KCOL={attack:'#ff5a5a',defense:'#4f8dff',counter:'#ff9a3c',silence:'#a86bff',immune:'#f2c94c',disrupt:'#3fc77a',skill:'#2ec4c4',spell:'#c9d4ff',active:'#2ec4c4',tick:'#8a90a8'};
var KSH={attack:'공',defense:'방',counter:'반',silence:'침',immune:'면',disrupt:'해',skill:'스',spell:'주',active:'액',tick:'끝'};
/* 상태 아이콘 한 줄 설명(효과연출 7) */
var STDESC={shield:'받는 피해를 실드가 먼저 막아요',burn:'턴 끝마다 최대 HP 3%×중첩 피해(무시 불가)',mark:'치명 피해가 더 커져요',weak:'주는 피해가 20% 줄어요',activeSeal:'액티브를 쓸 수 없어요',skillBlock:'스킬 카드를 낼 수 없어요',energyDown:'다음 턴 에너지가 줄어요',immune:'침묵·방해 같은 해로운 효과를 막아요',healBoost:'회복량이 늘어요',spdUp:'같은 단계에서 먼저 행동해요',inferno:'피로스 액티브 효과가 이어지는 중',greatTide:'테티스 액티브 효과가 이어지는 중',noCarry:'이번 턴 실드가 다음 턴으로 넘어가지 않아요',handSeal:'일부 카드를 이번 턴 낼 수 없어요',tide:'테티스 조류: 만조·간조에 따라 강해져요'};
/* 종류별 첫 발동 설명(효과연출 12, 테스트는 기기 저장·도움말 다시 보기로 초기화) */
var FIRST={attack:'공격: 4 공격 단계에 상대에게 피해를 줘요. 상대 반격에 막힐 수 있어요.',defense:'방어: 1 보호 단계에 실드를 쌓아 이번 턴 피해를 줄여요.',counter:'반격: 1 보호 단계에 대기했다가 상대 공격이 오면 무효로 하고 되받아쳐요.',silence:'침묵: 2 방해 단계에 상대 스킬·액티브를 끊어요. 면역에는 막혀요.',immune:'면역: 1 보호 단계에 침묵·방해 같은 해로운 효과를 막아요. 공격 피해는 못 막아요.',disrupt:'방해: 2 방해 단계에 상대를 흔들어요.',skill:'스킬: 3 스킬 단계에 드로우·강화 같은 효과를 써요. 침묵에 막혀요.',spell:'스펠: 0 단계에 가장 먼저 발동해요. 에너지는 안 들고 쿨다운이 있어요.',active:'액티브: 게이지 100이면 3 스킬 단계에 캐릭터 고유 기술을 써요.'};
function josa(w,a,b){var c=String(w).charCodeAt(String(w).length-1);return w+((c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28)?a:b)}
function rushTxt(b){var r=b.rules,t=b.turn;return t>=r.rush_start_turn?'<span class="chip rushc">폭주 +'+Math.round((r.rush_dmg_step||0.25)*(t-r.rush_start_turn+1)*100)+'%</span>':'<small>폭주까지 '+(r.rush_start_turn-t)+'턴</small>'}
/* 스펠·액티브 상태(효과연출 10): 사용 가능 / 쿨다운 N / 잠금 */
function spellBtns(p,mine,sub){return Object.keys(p.spells).map(function(id,i){var cd=p.spells[id],ic=S.A.slots['SPELL_'+id],on=mine&&(S.sel.spell===id||(sub&&sub.spell===id)),s=S.data.spells[id]||{};
 return '<button class="sp'+(on?' on':'')+(cd>0?' cd':'')+'" '+(mine?'data-spell="'+id+'"':'')+' data-tip="'+esc(sname(id)+(cd>0?' · 쿨다운 '+cd+'턴 남음':' · 사용 가능')+' — '+(s.effect_text||''))+'" style="'+(ic?'background-image:url('+ic.url+')':'')+'"'+(mine&&(sub||cd>0)?' disabled':'')+'>'+(ic?'':'<span style="font-size:10px">'+esc(sname(id))+'</span>')+(cd>0?'<b>'+cd+'</b>':'')+(mine?'<small>'+(i?'W':'Q')+'</small>':'')+'</button>'}).join('')}
function actState(p){var seal=p.status.some(function(s){return s.k==='activeSeal'});return seal?'lock':p.gauge>=100?'ready':'charge'}
/* 슬롯 칸: 카드 + 스펠·액티브(효과연출 2). 처리 순서 정렬, 한 줄 최대 5칸, 라벨은 칸 밖 */
function cellCard(id,w,attr){return {k:card(id).kind,id:id,ord:phOf(id),lab:phLab(id),html:bcCard(id,{w:w,mode:'hand',fig:true,attr:' data-cid="'+id+'"'+(attr||'')})}}
function spellCard(id,w,attr,used){var sp=S.data.spells[id]||{},ic=S.A.slots['SPELL_'+id],fr=S.A.slots.CARD_FRAME,t=Array.from(String(sp.effect_text||''));
 return '<div class="bc hand face2 spcard" style="--w:'+w+'px;width:'+w+'px"'+(attr||'')+' data-tip="'+esc('스펠 '+sname(id)+' — '+(sp.effect_text||''))+'"><div class="l art" style="'+(ic?'background-image:url('+ic.url+')':'background:linear-gradient(160deg,#3a4a8a,#1b1f3e)')+'"></div>'+(ic?'':'<div class="symt">스펠</div>')+'<div class="l shade"></div>'+(fr?'<div class="l frm" style="background-image:url('+fr.url+')"></div>':'')+'<div class="bdk" style="background:#6b7aff">스펠</div><div class="txt"><div class="nm">'+esc(sname(id))+'</div><div class="sht">'+esc(t.length>15?t.slice(0,15).join('')+'…':t.join(''))+'</div></div>'+''+'</div>'}
function cellSpell(id,w,attr,used){if(S.st&&S.st.phase==='battle')return {k:'spell',id:id,ord:-1,lab:'0 스펠',html:spellCard(id,w,attr,used)};var ic=S.A.slots['SPELL_'+id];return {k:'spell',id:id,ord:-1,lab:'0 스펠',html:'<div class="cell spc" style="--w:'+w+'px"'+(attr||'')+' data-tip="'+esc(sname(id)+' — '+((S.data.spells[id]||{}).effect_text||''))+'"><i style="'+(ic?'background-image:url('+ic.url+')':'')+'">'+(ic?'':esc(sname(id).slice(0,2)))+'</i><b>'+esc(sname(id))+'</b>'+(used?'<em>사용</em>':'')+'</div>'}}
function activeCard(chr,w,attr){var c=ch(chr),sl=S.A.slots,a=((S.A.art||{})[chr]||{})['000']||{},f=a.full,cr=a.card,fb=slotU('CARD_BG_'+(FAC[c.faction]||'NEUTRAL')),fr=sl.CARD_FRAME,lay=charLay(chr);
 var t=Array.from(String(c.active_text||''));
 return '<div class="bc hand face2 accard" style="--w:'+w+'px;width:'+w+'px"'+(attr||'')+' data-tip="'+esc('액티브 '+(c.active_name||'')+' — '+(c.active_text||''))+'">'+lay+'<div class="l shade"></div>'+(fr?'<div class="l frm" style="background-image:url('+fr.url+')"></div>':'')+'<div class="bdk" style="background:#d9a32b">액티브</div><div class="txt"><div class="nm">'+esc(c.active_name||'액티브')+'</div><div class="sht">'+esc(t.length>15?t.slice(0,15).join('')+'…':t.join(''))+'</div></div></div>'}
function cellActive(chr,w,attr,used,fr){if(S.st&&S.st.phase==='battle')return {k:'active',id:chr,ord:3.5,lab:'3 스킬(액티브)',html:activeCard(chr,w,attr)};var c=ch(chr),f=fr?S.A.slots['FRAME_'+fr]:null;return {k:'active',id:chr,ord:3.5,lab:'3 스킬(액티브)',html:'<div class="cell acc" style="--w:'+w+'px"'+(attr||'')+' data-tip="'+esc('액티브 '+(c.active_name||'')+' — '+(c.active_text||''))+'"><div class="af" style="'+faceCss(chr)+'">'+(f?'<s style="background-image:url('+f.url+')"></s>':'')+'</div><b>'+esc(c.active_name||'액티브')+'</b>'+(used?'<em>사용</em>':'')+'</div>'}}
function sortCells(a){return a.map(function(x,i){x.i=i;return x}).sort(function(x,y){return x.ord-y.ord||x.i-y.i})}
/* 상대 최근 3턴 사용 카드(효과연출 8) */
/* 전투 화면 배치(기획지시 2026-11-01 전투UI개편 3): 고정 구역(캐릭터 카드·버튼 구역·로그 줄·슬롯) + 가변 구역(손패).
   844×390 기준: 캐릭터 카드 176×64, 상태 뱃지 3줄 48, 상단 줄 30, 손패 높이 104(카드 약 74×104), 슬롯 칸 약 50×70 */
function lay(n){var W=VW(),H=VH(),short=H<=500,pad=short?8:12,f=safe(),pl=Math.max(pad,f.l),pr=Math.max(pad,f.r),pt=Math.max(pad,f.t),pb=Math.max(pad,f.b);
 var cardW=short?176:232,cardH=short?64:84,bdgH=short?48:58,topH=short?30:40,gap=short?6:8;
 var handH=Math.round(short?Math.max(92,Math.min(118,H*0.27)):Math.min(220,H*0.25)),handW=W-pl-pr-2*cardW-2*gap;
 // 손패: 고른 카드가 7% 올라가도 손패 칸을 넘지 않게 높이 90%, 폭은 겹침(최대 30%)으로 맞추고 그래도 넘으면 카드를 줄인다
 var cw=Math.floor(handH*0.9*5/7),ov=false;if(n*cw+(n-1)*6>handW){ov=true;cw=Math.floor(Math.min(cw,handW/(n*0.7+0.3)))}
 var fieldW=W-pl-pr-2*cardW-2*gap,fieldH=H-pt-pb-topH-handH-2*4,sw=Math.floor(Math.min((fieldH-(short?40:52)-(short?16:22)-2*(short?18:22))/2/1.4,short?60:110,(fieldW-4*12-4*4)/5));
 return {W:W,H:H,short:short,pad:pad,pl:pl,pr:pr,pt:pt,pb:pb,cardW:cardW,cardH:cardH,bdgH:bdgH,topH:topH,gap:gap,handH:handH,cw:cw,ov:ov,sw:Math.max(32,sw),detail:cw>=257,narrow:false}}
/* 손패가 칸을 넘으면(카드 많을 때·안전 영역·글꼴 차이) 실제 폭에 맞춰 카드를 줄인다 */
function fitHand(){var hd=document.querySelector('.bt3 .hand')||document.querySelector('.bt2 .hand');if(!hd)return;var cards=hd.querySelectorAll('.bc'),n=cards.length;if(!n)return;var need=hd.scrollWidth,have=hd.clientWidth;if(need<=have+1)return;
 var cw=parseFloat(getComputedStyle(hd).getPropertyValue('--cw'))||cards[0].offsetWidth,nw=Math.floor(Math.min(cw,have/(n*0.7+0.3)));hd.classList.add('ov');hd.style.setProperty('--cw',nw+'px');cards.forEach(function(c){c.style.width=nw+'px';c.style.setProperty('--w',nw+'px')})}
function sizes(n){var z=lay(n);return z}
/* 상태 텍스트 뱃지: 상태정의표 v0.1(개발/상태정의표_v0.1.csv, 상세 02). 색은 종류 색 KCOL 재사용(기획답변 36차 3) */
var CN={'파랑':'#4f8dff','주황':'#ff9a3c','금색':'#f2c94c','보라':'#a86bff','초록':'#3fc77a','청록':'#2ec4c4','빨강':'#ff5a5a'};
var SDEF={carry:['이월 실드','파랑','지난 턴에서 넘어온 실드예요. 다시 넘어가지 않아요','SHIELD'],burn:['작열','빨강','턴이 끝날 때 최대 HP 3% 피해(실드 무시)','BURN'],mark:['표식','초록','받는 치명 피해 +20%','MARK'],
 weak:['약화','초록','공격력 −20%','WEAKEN'],activeSeal:['액티브 봉인','보라','다음 턴 액티브를 쓸 수 없어요','SILENCE'],skillBlock:['스킬 봉쇄','보라','스킬 카드를 쓸 수 없어요','SKILL_LOCK'],
 handSeal:['손패 봉인','보라','손패 일부를 이번 턴 쓸 수 없어요','HAND_SEAL'],energyDown:['에너지 감소','초록','에너지가 줄어요','ENERGY_DOWN'],immune:['면역','금색','침묵·디버프에 걸리지 않아요(피해는 못 막음)','IMMUNE'],
 inferno:['업화','청록','공격 카드 피해 ×1.5, 받는 피해 +15%','ATK_UP'],greatTide:['대조류','청록','밀물·썰물 효과가 동시에 적용돼요','TIDE'],flood:['밀물','청록','공격 피해 +20%','TIDE'],ebb:['썰물','청록','받는 피해 −20%','TIDE'],
 healBoost:['회복 증가','청록','회복량이 늘어요',''],spdUp:['속도 증가','청록','같은 단계에서 먼저 행동해요',''],noCarry:['실드 이월 불가','초록','이번 턴 실드가 다음 턴으로 넘어가지 않아요','']};
/* 기간 문구 4가지: 이번 턴 / 다음 턴 / 다음 N턴 / N턴 남음 */
function perTxt(s,turn){if(!s.left)return '';var next=s.from!=null&&s.from>turn;return next?(s.left===1?'다음 턴':'다음 '+s.left+'턴'):(s.left===1?'이번 턴':s.left+'턴 남음')}
function badgesHtml(p,who,turn){S.bprev=S.bprev||{};var st=[];if(p.shieldCarry>0)st.push({k:'carry',v:p.shieldCarry,left:1});
 p.status.forEach(function(s){if(s.k==='tide'){if(s.flood)st.push({k:'flood',left:1});if(s.ebb)st.push({k:'ebb',left:1})}else st.push(s)});
 var list=st.map(function(s){var d=SDEF[s.k]||[(ST[s.k]||[s.k])[0],'초록','',''],u=d[3]?S.A.slots['STATUS_'+d[3]]:null,col=CN[d[1]]||'#8a90a8';
  var lab=d[0]+(s.k==='carry'?' '+s.v:s.k==='burn'?' ×'+s.n:s.k==='handSeal'&&s.n?' '+s.n+'장':''),per=perTxt(s,turn);
  var key=who+':'+s.k,fl=S.bprev[key]&&S.bprev[key].indexOf('다음')===0&&per==='이번 턴';S.bprev[key]=per;
  return '<div class="bg'+(fl?' flash':'')+'" style="--bc:'+col+'" data-tip="'+esc(lab+(per?' · '+per:'')+' — '+d[2])+'"><i style="'+(u?'background-image:url('+u.url+')':'')+'"></i><span>'+esc(lab)+(per?' · '+per:'')+'</span></div>'});
 return list.join('')}  // 잘림·말줄임 없이 전부(기획지시 전투UX2차 3)
/* 둥근 캐릭터 카드(등급 프레임 없음): 일러스트·이름·진영·HP·실드·게이지. 내 것과 상대 것 같은 크기, 값이 바뀌어도 크기 고정 */
function sideHtml(p,who,m){var c=ch(p.char),fac=S.A.slots['FACTION_'+FAC[c.faction]],max=p.maxHp,hp=p.hp,sh=Math.min(p.shield,max);
 var w=Math.max(0,100*hp/max),sw=Math.min(100-w,100*sh/max);
 return '<div class="face" id="face_'+who+'" style="'+faceCss(p.char)+'"></div><div class="info"><div class="nmrow">'+(fac?'<i style="background-image:url('+fac.url+')"></i>':'')+'<span>'+esc(c.name)+'</span>'+(who==='opp'&&p.submitted&&m.phase==='battle'?'<span class="chip on okc">확정</span>':'')+'</div>'
  +'<div class="hpbar"><div class="gh" id="gh_'+who+'" style="width:'+w+'%"></div><div class="hp" id="hp_'+who+'" style="width:'+w+'%"></div><div class="sh" id="sh_'+who+'" style="left:'+w+'%;width:'+sw+'%"></div></div>'
  +'<div class="hptx"><span id="hpt_'+who+'">'+hp+'/'+max+'</span><span id="sht_'+who+'" style="color:var(--sh)">'+(sh?'실드 '+sh:'')+'</span></div>'
  +'<div class="gauge" data-tip="게이지 '+Math.min(100,p.gauge)+'/100 — 100이 되면 액티브를 쓸 수 있어요"><i style="width:'+Math.min(100,p.gauge)+'%"></i></div></div>'}
/* 슬롯: 큰 원형 번호(종류 색) + 작은 라벨, 칸 사이 화살표(전투UI개편 5) */
function slotsHtml(items,mine,sw,tag,cls){var n=Math.max(3,Math.min(5,items.length)),h='';for(var i=0;i<n;i++){var x=items[i],col=x&&x.k&&KCOL[x.k];
  if(i&&x&&items[i-1])h+='<span class="arr">›</span>';
  h+='<div class="slot'+(mine?' mine':'')+(x&&x.k?' k-'+x.k:'')+'"'+(x&&x.skey?' data-skey="'+x.skey+'"':'')+' style="'+(col?'border-color:'+col:'')+'">'+(x?(x.lab?'<span class="lab"><b class="num" style="background:'+col+'">'+String(x.lab).charAt(0)+'</b>'+esc(String(x.lab).slice(2))+'</span>':'')+x.html:'')+'</div>'}
 return '<div class="slots'+(mine?' me':' opp')+(cls?' '+cls:'')+'" style="--sw:'+sw+'px">'+h+(tag?'<span class="tag">'+tag+'</span>':'')+'</div>'}
/* 상대 최근 3턴 카드(효과연출 8): 상대 카드 뱃지 아래 */
function recentHtml(op){var R=(S.oppRecent||[]).slice(-3);
 return '<div class="recent" data-tip="상대가 최근 3턴에 낸 카드(누르면 상세)"><small class="mu">최근</small>'+(R.length?R.map(function(r){return '<span class="rt"><small>'+r.turn+'</small>'+(r.ids.length?r.ids.map(function(id){var k=card(id).kind;return '<i data-cid="'+id+'" style="background:'+KCOL[k]+'">'+KSH[k]+'</i>'}).join(''):'<em>-</em>')+'</span>'}).join(''):'<em>-</em>')+'</div>'}
/* 상단 왼쪽 아이콘(전투UI개편 3): 메뉴·상대 스펠·상대 에너지·상대 손패. 누르면 작은 팝오버 */
function iconsHtml(op){return '<button id="menu" class="ib" title="메뉴">⋯</button>'+Object.keys(op.spells).map(function(id){var cd=op.spells[id],ic=S.A.slots['SPELL_'+id],s=S.data.spells[id]||{};
  return '<span class="ib sp2 pop'+(cd>0?' cd':'')+'" data-tip="상대 스펠 '+esc(sname(id)+(cd>0?' · 쿨다운 '+cd+'턴':' · 사용 가능')+' — '+(s.effect_text||''))+'" style="'+(ic?'background-image:url('+ic.url+')':'')+'">'+(ic?'':esc(sname(id).slice(0,1)))+(cd>0?'<b>'+cd+'</b>':'')+'</span>'}).join('')
 +'<span class="ib pop txt" data-tip="상대 에너지 '+op.energy+'">⚡'+op.energy+'</span><span class="ib pop txt" data-tip="상대 손패 '+op.handCount+'장"><s class="bk" style="'+(S.A.slots.CARD_BACK?'background-image:'+slotU('CARD_BACK'):'')+'"></s>'+op.handCount+'</span>'}
/* 전투 화면 사선 구도 + 전투 UX 2차(기획지시 2026-11-01): 손패·낸 칸 위치는 고정, 캐릭터 열(카드·상태 뱃지·액티브)은 내 것은 아래, 상대 것은 위에 붙여 뱃지가 늘어도 다른 구역이 밀리지 않음.
   넓은 화면(안전 영역 안쪽 1180pt 이상·높이 600 이상)은 전투판 폭을 960으로 묶고 오른쪽에 카드 상세 + 전체 로그 패널 */
/* 큰 화면(사용자 요청 2026-11-02, 4K): 높이 800 기준으로 전투판 전체를 확대. 배치는 가상 크기(화면/배율)로 계산하고 #btz가 scale로 키움 */
function lay3(n){var zs=S.zs||1,W=VW(),H=VH(),short=H<=500,f=safe(),pad=short?8:12,pl=Math.max(pad,f.l),pr=Math.max(pad,f.r),pt=Math.max(12,f.t),pb=Math.max(12,f.b),g=short?6:10;
 var inner=W-pl-pr,wide=inner>=1180&&H>=600,panelW=wide?Math.min(440,inner-960-16):0,bR=wide?pl+960:W-pr;
 var topH=short?26:34,actH=short?26:32,ctlW=short?176:232;
 var ch=short?Math.min(150,Math.round((H-pt-pb)*0.42)):Math.round(Math.min(230,H*0.28)),cw=Math.round(ch*5/7);
 var sw=short?50:Math.round(Math.min(84,H*0.1)),slH=Math.round(sw*1.4),labH=short?16:20;
 var handH=short?Math.max(96,Math.min(118,Math.round(H*0.29))):Math.round(Math.min(220,H*0.25)),handTop=H-pb-handH;
 var meSX=pl+cw+g,meSY=handTop-g-slH,opX=bR-cw,opSY=pt,opSRight=opX-g,handL=meSX,handR=bR-ctlW-g,handW=handR-handL;
 var cwc=Math.floor(handH*0.9*5/7),ov=false;if(n*cwc+(n-1)*6>handW){ov=true;cwc=Math.floor(Math.min(cwc,handW/(n*0.7+0.3)))}
 var boardW=bR-pl,two=(5*sw+4*16)>Math.floor(boardW*0.48);
 return {zs:zs,W:W,H:H,short:short,wide:wide,panelW:panelW,bR:bR,pl:pl,pr:pr,pt:pt,pb:pb,g:g,topH:topH,actH:actH,ctlW:ctlW,ch:ch,cw:cw,sw:sw,slH:slH,labH:labH,meSX:meSX,meSY:meSY,opX:opX,opSY:opSY,opSRight:opSRight,
  handTop:handTop,handH:handH,handL:handL,handW:handW,ccw:cwc,ov:ov,two:two,colTop:pt+topH+g,midX:Math.round(pl+boardW*0.38),midY:Math.round((opSY+slH+labH+meSY-labH)/2),detail:false}}
/* 넓은 화면 오른쪽 패널(전투UX2차 5): 카드 상세(손패 호버) + 처리 순서 도움말 + 전체 로그 */
function wdetHelp(){return '<b>처리 순서</b><div class="small">0 스펠 → 1 보호(방어·반격·면역) → 2 방해(침묵·방해) → 3 스킬·액티브 → 4 공격 → 5 턴 끝(작열·재생)</div><div class="small mu">손패 카드에 마우스를 올리면 여기에 효과 전문이 나와요.</div>'}
function wdetCard(id){var k=card(id),d=$('wdet');if(!d)return;d.innerHTML='<div class="row" style="gap:8px;align-items:flex-start;flex-wrap:nowrap">'+bcCard(id,{w:110,mode:'hand'})+'<div><b>'+esc(k.name)+'</b><div class="mu small">'+esc(KIND_KO[k.kind]||k.kind)+' · 비용 '+k.cost+'E · '+phLab(id)+(k.owner_character?' · '+esc(ch(k.owner_character).name)+' 전용':'')+'</div><p style="margin:6px 0">'+esc(k.effect_text)+'</p><div class="aff small">'+(AFF[k.kind]||'')+'</div></div></div>'}
/* 역동 연출(사용자 요청 2026-11-01): 화면 흔들림·피격·충돌 */
function shakeBt(n){var b=$('bt');if(!b||S.rmo)return;b.classList.remove('shk','shk2');void b.offsetWidth;b.classList.add(n>1?'shk2':'shk');setTimeout(function(){b.classList.remove('shk','shk2')},n>1?420:300)}
function lr(el){var b=$('bt'),r=el.getBoundingClientRect(),q=b?b.getBoundingClientRect():{left:0,top:0},k=S.zs||1;return {left:(r.left-q.left)/k,top:(r.top-q.top)/k,width:r.width/k,height:r.height/k,right:(r.right-q.left)/k,bottom:(r.bottom-q.top)/k}}  // 전투판 안 좌표(확대 배율 보정)
function hurt(sd,big){var v=$('side_'+sd),b=$('bt'),hb=v&&v.querySelector('.hpbar');if(hb){hb.classList.remove('fl');void hb.offsetWidth;hb.classList.add('fl')}if(v){v.classList.remove('hurt');void v.offsetWidth;v.classList.add('hurt');setTimeout(function(){v.classList.remove('hurt')},450)}
 if(b&&v&&!S.rmo){var r=lr(v),x=document.createElement('div');x.className='burst'+(big?' big':'');x.style.left=(r.left+r.width/2)+'px';x.style.top=(r.top+r.height*(sd==='me'?0.35:0.6))+'px';
  var h='';for(var k=0;k<(big?14:9);k++)h+='<s style="--a:'+Math.round(k*360/(big?14:9)+Math.random()*20)+'deg;--d:'+Math.round((big?60:40)+Math.random()*40)+'px"></s>';x.innerHTML=h;b.appendChild(x);setTimeout(function(){x.remove()},650)}
 if(big)shakeBt(2);else shakeBt(1);if(sd==='me'&&b){var vg=document.createElement('div');vg.className='vign';b.appendChild(vg);setTimeout(function(){vg.remove()},500)}}
function koShow(hp){sfx('ko');var b=$('bt');if(!b)return;try{if(!S.rmo&&b.getAnimations)b.getAnimations({subtree:true}).forEach(function(a){a.playbackRate=0.35})}catch(e){}var fl=document.createElement('div');fl.className='koflash';b.appendChild(fl);b.classList.add('koing');document.querySelectorAll('.zoom,.orb,#bub').forEach(function(x){x.remove()});var dead=['me','opp'].filter(function(k){return hp[k]<=0});
 dead.forEach(function(k){var v=$('side_'+k);if(v)v.classList.add('down')});var e=document.createElement('div');e.className='ko';e.style.setProperty('--td',Math.round(1500*spk())+'ms');var gd='';if(!S.rmo)for(var q=0;q<18;q++)gd+='<s style="--a:'+Math.round(q*20+Math.random()*12)+'deg;--d:'+Math.round(110+Math.random()*170)+'px"></s>';
 e.innerHTML=(S.rmo?'':'<i class="tsw"></i><i class="tsw t2"></i><i class="crk"></i>'+gd)+'<b>K.O.</b>';b.appendChild(e);setTimeout(function(){if(!S.rmo)shakeBt(2)},Math.round(180*spk()));vib([60,40,90])}  /* K.O. 최고 강도: 3배 내리꽂기·히트스톱 0.1초·균열·떨림·금빛 파편(상세 01) */
function clash(){var ms=Math.round(1100*spk()),sp='';if(!S.rmo)for(var q=0;q<14;q++)sp+='<s style="--a:'+Math.round(q*360/14+Math.random()*12)+'deg;--d:'+Math.round(90+Math.random()*140)+'px"></s>';var e=document.createElement('div');e.className='tban t4';e.style.setProperty('--td',ms+'ms');e.innerHTML=sp+IMP_FX+'<div class="tbx"><b>REVEAL!</b></div>';document.querySelectorAll('body > .tban,body > .rvl').forEach(function(x){x.remove()});document.body.appendChild(e);landHit(ms);setTimeout(function(){e.remove()},ms)}
/* 배너 임팩트 공통(상세 01 배너·라벨 폰트 통일과 임팩트 연출): 안착(전체의 16% ≈ 0.18초) 때 충격파 링·흰 섬광 0.08초·SFX_BANNER_HIT */
var IMP_FX='<i class="tsw"></i><i class="tsw t2"></i><i class="ifl"></i>';
function landHit(ms){setTimeout(function(){sfx('bhit')},Math.round(ms*0.16))}  /* 공개: 턴 시작과 같은 모양(사용자 요청 2026-11-05) */
function vCard(p,who,m,z){var c=ch(p.char),fac=S.A.slots['FACTION_'+FAC[c.faction]],max=p.maxHp,hp=p.hp,sh=Math.min(p.shield,max),w=Math.max(0,100*hp/max),sw=Math.min(100-w,100*sh/max);
 return '<div class="vc side" id="side_'+who+'" style="width:'+z.cw+'px;height:'+z.ch+'px"><div class="vfa" id="face_'+who+'">'+pvCard(p.char,{w:z.cw,holo:0,cls:'rnd',full:true})+'</div>'
  +(who==='opp'&&p.submitted&&m.phase==='battle'?'<span class="chip on okc">확정</span>':'')
  +'<div class="vbot"><div class="nmrow">'+(fac?'<i style="background-image:url('+fac.url+')"></i>':'')+'<span>'+esc(c.name)+'</span></div>'
  +'<div class="hpbar"><div class="gh" id="gh_'+who+'" style="width:'+w+'%"></div><div class="hp" id="hp_'+who+'" style="width:'+w+'%"></div><div class="sh" id="sh_'+who+'" style="left:'+w+'%;width:'+sw+'%"></div></div>'
  +'<div class="hptx"><span id="hpt_'+who+'">'+hp+'/'+max+'</span><span id="sht_'+who+'" style="color:var(--sh)">'+(sh?'+'+sh:'')+'</span></div>'
  +'<div class="gauge" data-tip="게이지 '+Math.min(100,p.gauge)+'/100 — 100이 되면 액티브를 쓸 수 있어요"><i style="width:'+Math.min(100,p.gauge)+'%"></i></div></div></div>'}
function slotsHtml3(items,mine,z,tag,cls){var it=items.slice(),rowA=it,rowB=[];if(z.two&&it.length>4){rowA=it.filter(function(x){return x.k!=='active'});rowB=it.filter(function(x){return x.k==='active'})}  // 두 줄: 1줄 스펠+카드, 2줄 액티브(기획답변 41차)
 var one=function(arr,min){var n=Math.max(min,Math.min(5,arr.length)),h='';for(var i=0;i<n;i++){var x=arr[i],col=x&&x.k&&KCOL[x.k];if(i&&x&&arr[i-1])h+='<span class="arr">›</span>';
   h+='<div class="slot'+(mine?' mine':'')+(x&&x.k?' k-'+x.k:'')+'"'+(x&&x.skey?' data-skey="'+x.skey+'"':'')+' style="'+(col?'border-color:'+col:'')+'">'+(x?(x.lab?'<span class="lab"><b class="num" style="background:'+col+'">'+String(x.lab).charAt(0)+'</b>'+esc(String(x.lab).slice(2))+'</span>':'')+x.html:'')+'</div>'}return h};
 return '<div class="slots'+(mine?' me':' opp')+(cls?' '+cls:'')+'" style="--sw:'+z.sw+'px"><div class="srow">'+one(rowA,3)+'</div>'+(rowB.length?'<div class="srow">'+one(rowB,0)+'</div>':'')+(tag?'<span class="tag">'+tag+'</span>':'')+'</div>'}
/* ===== 전투 화면 Figma 시안(기획지시 2026-11-05 전투화면시안반영·타이머버튼): 시안 788×360 설계 좌표로 배치하고 #stg 전체를 배율 k로 확대.
   좌우 안전 영역 60 이상(기기별 가변), 하단 16 이상. 남는 세로 공간은 가운데(처리 순서 줄·빛 경로)로 간다 ===== */
var KP=['spell','immune','defense','counter','silence','disrupt','skill','attack'],KP_KO={spell:'스펠'};
var EMO={EMOTE_HELLO:['👋','안녕'],EMOTE_NICE:['👍','좋아요'],EMOTE_OOPS:['😅','앗'],EMOTE_THINK:['🤔','음…']},EMO_IDS=['EMOTE_HELLO','EMOTE_NICE','EMOTE_OOPS','EMOTE_THINK'];
var SVG_GEAR='<svg viewBox="0 0 256 256" width="24" height="24" fill="#f4f6ff"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z"/></svg>';
var SVG_CHAT='<svg viewBox="0 0 256 256" width="24" height="24" fill="#f4f6ff"><path d="M168,112a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,112Zm-8,24H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm72-8A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-16,0A88,88,0,1,0,51.81,172.06a8,8,0,0,1,.66,6.54L40,216,77.4,203.53a7.85,7.85,0,0,1,2.53-.42,8,8,0,0,1,4,1.08A88,88,0,0,0,216,128Z"/></svg>';
function caret(dir){return '<svg class="crt" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="5.3"/><path d="'+(dir<0?'M7 3.8 4.8 6 7 8.2':'M5 3.8 7.2 6 5 8.2')+'"/></svg>'}
function busy(b,t){if(!b)return;b.disabled=true;b.classList.add('busy');b.removeAttribute('data-lab');b.classList.remove('red','beat','go');b.textContent=t}  /* 서버 응답 기다리는 버튼: 누르는 즉시 표시 */
function popClose(keep){if(keep!=='tip')tipHide();if(keep!=='peek')peekHide();
 if(keep!=='menu'&&S.menu){S.menu=false;var a=$('m4');if(a)a.remove();if($('menu'))$('menu').classList.remove('on')}
 if(keep!=='emo'&&S.emoOpen){S.emoOpen=false;document.querySelectorAll('.emp4').forEach(function(x){x.remove()});if($('emo'))$('emo').classList.remove('on')}
 if(keep!=='log'&&S.showLog){S.showLog=false;refreshLog();if($('logb'))$('logb').classList.remove('on')}}
function battleOn(){return !!(S.st&&S.st.phase==='battle')}
function vib(p){if(S.vibOff)return;if(navigator.vibrate)navigator.vibrate(p)}
S.vibOff=lsGet('play_vib')==='0';S.sndOff=lsGet('play_snd')==='0';S.skm=lsGet('play_skm')||'full';
/* ===== 소리(기획 사운드_개발전달 v0.1, 임시 음원): 음악·효과음을 파일 없이 브라우저에서 합성(WebAudio) — 직접 만든 소리라 사용료·출처 표기 없음.
   BGM 3(로비·준비 / 전투 / 폭주 7턴~, 일렉트로닉 무한 반복) + SFX. 감정표현에는 소리 없음. 설정 '음악'·'효과음' 따름 ===== */
var SND={ctx:null};
S.musOff=lsGet('play_mus')==='0';
function sndInit(){if(SND.ctx)return SND.ctx;var C=window.AudioContext||window.webkitAudioContext;if(!C)return null;try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}sndKeep();var c;try{c=new C()}catch(e){return null}SND.ctx=c;
 var comp=c.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=3;comp.connect(c.destination);SND.out=comp;
 SND.mus=c.createGain();SND.mus.gain.value=S.musOff?0:0.6;SND.mus.connect(comp);SND.sfx=c.createGain();SND.sfx.gain.value=S.sndOff?0:0.75;SND.sfx.connect(comp);
 var len=Math.floor(c.sampleRate*1.6),ir=c.createBuffer(2,len,c.sampleRate);for(var ch=0;ch<2;ch++){var d=ir.getChannelData(ch);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.8)}
 SND.rev=c.createConvolver();SND.rev.buffer=ir;var rg=c.createGain();rg.gain.value=0.3;SND.rev.connect(rg);rg.connect(comp);
 var nb=c.createBuffer(1,c.sampleRate,c.sampleRate),nd=nb.getChannelData(0);for(var j=0;j<nd.length;j++)nd[j]=Math.random()*2-1;SND.noise=nb;
 return c}
/* iOS: 무음(벨소리 끔) 상태에서도 소리 나게 — 빈 소리를 <audio>로 반복해 재생 세션으로 전환 */
function sndKeep(){if(SND.keep)return;try{var sr=8000,n=sr,b=new ArrayBuffer(44+n*2),v=new DataView(b),w=function(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
 var a=new Audio(URL.createObjectURL(new Blob([b],{type:'audio/wav'})));a.loop=true;a.volume=0.01;a.setAttribute('playsinline','');var pr=a.play();if(pr&&pr.catch)pr.catch(function(){});SND.keep=a}catch(e){}}
function mtof(n){return 440*Math.pow(2,(n-69)/12)}
/* 공용: 음(oscillator) — 주파수 f0→f1, 짧은 어택 뒤 감쇠 */
function sTone(dest,type,f0,f1,t,dur,g,a,lp){var c=SND.ctx,o=c.createOscillator(),v=c.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
 v.gain.setValueAtTime(0.0001,t);v.gain.exponentialRampToValueAtTime(g,t+(a||0.005));v.gain.exponentialRampToValueAtTime(0.0001,t+dur);var last=v;
 if(lp){var f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=lp;o.connect(f);f.connect(v)}else o.connect(v);v.connect(dest);o.start(t);o.stop(t+dur+0.02);return last}
/* 공용: 잡음(필터 주파수 f0→f1) */
function sNoise(dest,t,dur,g,type,f0,f1,q){var c=SND.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),v=c.createGain();s.buffer=SND.noise;f.type=type||'bandpass';f.Q.value=q||1;f.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)f.frequency.exponentialRampToValueAtTime(f1,t+dur);
 v.gain.setValueAtTime(0.0001,t);v.gain.exponentialRampToValueAtTime(g,t+0.006);v.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(f);f.connect(v);v.connect(dest);s.start(t,Math.random()*0.5);s.stop(t+dur+0.02)}
/* ---------- 음악: 16분음표 순서기(64칸 = 4마디 반복), 곡 바꿀 때 0.8초 교차 ---------- */
var TRK={
 lobby:{bpm:96,ch:[[57,60,64],[53,57,60],[48,52,55],[55,59,62]],root:[45,41,36,43],arp:[0,1,2,1],every:2,kick:[0,10],snare:[8],hat:[4,12],bass:[0,6,10],cut:900,lvl:0.8},
 battle:{bpm:124,ch:[[50,53,57],[46,50,53],[53,57,60],[48,52,55]],root:[38,34,41,36],arp:[0,1,2,3,2,1],every:1,kick:[0,4,8,12],snare:[4,12],hat:[2,6,10,14],bass:[0,2,3,6,8,10,11,14],cut:1500,lvl:1},
 rush:{bpm:138,ch:[[54,57,61],[50,54,57],[52,56,59],[49,52,56]],root:[42,38,40,37],arp:[0,1,2,3,0,2,1,3],every:1,kick:[0,4,8,11,12],snare:[4,12,14],hat:[0,2,4,6,8,10,12,14],bass:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],cut:2200,lvl:1}};
function synthPlay(name){var c=SND.ctx;if(!c||SND.scur===name)return;var t=c.currentTime;
 if(SND.bus){var ob=SND.bus;ob.gain.setValueAtTime(ob.gain.value,t);ob.gain.linearRampToValueAtTime(0.0001,t+0.8);setTimeout(function(){try{ob.disconnect()}catch(e){}},1200)}
 SND.scur=name;if(!name){SND.bus=null;return}var b=c.createGain();b.gain.setValueAtTime(0.0001,t);b.gain.linearRampToValueAtTime(TRK[name].lvl,t+0.8);b.connect(SND.mus);SND.bus=b;
 var d=c.createDelay(1),fb=c.createGain(),dw=c.createGain();d.delayTime.value=60/TRK[name].bpm*0.75;fb.gain.value=0.3;dw.gain.value=0.3;d.connect(fb);fb.connect(d);d.connect(dw);dw.connect(b);SND.dly=d;
 SND.step=0;SND.loop=0;SND.next=t+0.05;if(!SND.tm)SND.tm=setInterval(musicTick,25)}
function musicTick(){var c=SND.ctx;if(!c||!SND.scur||c.state!=='running')return;var tr=TRK[SND.scur],sp=60/tr.bpm/4;
 while(SND.next<c.currentTime+0.12){musicStep(tr,SND.step,SND.next,sp);SND.next+=sp;SND.step=(SND.step+1)%64;if(!SND.step)SND.loop++}}
function musicStep(tr,s,t,sp){var bus=SND.bus;if(!bus)return;var bar=Math.floor(s/16),i=s%16,chd=tr.ch[bar],rt=tr.root[bar],lp=SND.loop,lob=tr===TRK.lobby;
 if(i===0)chd.forEach(function(n){[-6,6].forEach(function(dt){var o=SND.ctx.createOscillator(),f=SND.ctx.createBiquadFilter(),v=SND.ctx.createGain();o.type='sawtooth';o.frequency.value=mtof(n);o.detune.value=dt;f.type='lowpass';f.frequency.value=tr.cut*0.8;
   v.gain.setValueAtTime(0.0001,t);v.gain.linearRampToValueAtTime(lob?0.06:0.045,t+sp*4);v.gain.setValueAtTime(lob?0.06:0.045,t+sp*13);v.gain.linearRampToValueAtTime(0.0001,t+sp*16.5);o.connect(f);f.connect(v);v.connect(bus);v.connect(SND.rev);o.start(t);o.stop(t+sp*17)})});  /* 패드 */
 if(tr.bass.indexOf(i)>=0)sTone(bus,lob?'triangle':'sawtooth',mtof(rt+(!lob&&i%4===2?12:0)),0,t,sp*(lob?3:1.6),lob?0.2:0.16,0.004,lob?900:tr.cut*0.7);  /* 베이스 */
 if(i%tr.every===0&&!(lob&&lp%2===0&&bar===0)){var k=(i/tr.every)%tr.arp.length,a=tr.arp[k],n=a===3?chd[0]+12:chd[a];n+=12+(lp%2&&!lob&&i%8>=4?12:0);
  var v=sTone(bus,lob?'triangle':'square',mtof(n),0,t,sp*(lob?1.8:0.9),lob?0.1:0.075,0.003,lob?2800:3600);if(SND.dly)v.connect(SND.dly)}  /* 아르페지오(+딜레이) */
 if(lob&&lp%2===0&&bar===0)return;
 if(tr.kick.indexOf(i)>=0){sTone(bus,'sine',170,48,t,0.22,lob?0.4:0.6,0.002);sNoise(bus,t,0.02,lob?0.06:0.12,'highpass',2500,2500,0.7)}
 if(tr.snare.indexOf(i)>=0){sNoise(bus,t,0.16,lob?0.08:0.16,'bandpass',1900,1500,0.8);sTone(bus,'triangle',220,160,t,0.09,0.08,0.002)}
 if(tr.hat.indexOf(i)>=0)sNoise(bus,t,0.045,lob?0.05:0.08,'highpass',7500,7500,0.7);
 if(!lob&&i===15&&bar===3)sNoise(bus,t-sp*3,sp*3,0.06,'bandpass',600,5000,1.2)}  /* 마디 끝 상승 잡음 */
/* 배경음악 파일(사용자 제공 2026-11-05, Pixabay 무료 음원): 로비·밴픽 = Suspense Cyberpunk(prettyjohn1), 전투 = Iron Horizon(karumaru), 폭주 = 전투 곡 1.07배속.
   <audio> 스트리밍 + WebAudio 음량(통째로 풀지 않아 메모리 적음). 파일을 못 읽으면 합성 음악으로 대체 */
var BGM={lobby:'/bgm/lobby.mp3',battle:'/bgm/battle.mp3'},BGM_LVL={lobby:0.34,battle:0.3};
function bgmEl(k){SND.els=SND.els||{};var e=SND.els[k];if(e)return e;try{e=new Audio(BGM[k]);e.loop=true;e.preload='auto';e.setAttribute('playsinline','');var src=SND.ctx.createMediaElementSource(e),g=SND.ctx.createGain();g.gain.value=0;src.connect(g);g.connect(SND.mus);e._g=g;e.onerror=function(){e._bad=true;if(SND.curEl===e){SND.cur=null;SND.curEl=null;musicSync()}}}catch(x){e={_bad:true}}SND.els[k]=e;return e}
function musicPlay(name){var c=SND.ctx;if(!c)return;if(SND.cur===name){var e0=SND.curEl;if(e0&&e0.paused&&document.visibilityState==='visible'){var p0=e0.play();if(p0&&p0.catch)p0.catch(function(){})}return}
 var k=name==='rush'?'battle':name,e=name&&BGM[k]?bgmEl(k):null,t=c.currentTime;
 Object.keys(SND.els||{}).forEach(function(x){var o=SND.els[x];if(o&&o._g&&o!==e){o._g.gain.setTargetAtTime(0,t,0.25);setTimeout(function(){if(SND.curEl!==o)try{o.pause()}catch(z){}},1500)}});
 SND.cur=name;
 if(e&&!e._bad){synthPlay(null);e.playbackRate=name==='rush'?1.07:1;e._g.gain.setTargetAtTime(BGM_LVL[k],t,0.3);var pr=e.play();if(pr&&pr.catch)pr.catch(function(){});SND.curEl=e;return}
 SND.curEl=null;synthPlay(name)}
/* 지금 화면에 맞는 곡: 로비·밴픽·스펠덱 = lobby, 전투 = battle(폭주 시작 턴부터 rush), 결과 = lobby */
function musicSync(){if(!SND.ctx)return;var m=S.st,want='lobby';if(m&&m.phase==='battle'&&m.battle){want=m.battle.turn>=m.battle.rules.rush_start_turn?'rush':'battle'}musicPlay(want)}
/* ---------- 효과음 ---------- */
function sfx(n,at){var c=SND.ctx;if(!c||S.sndOff||c.state!=='running')return;var o=SND.sfx,t=c.currentTime+(at||0);
 switch(n){
  case 'click':sTone(o,'sine',1250,760,t,0.05,0.14,0.002);break;
  case 'place':sTone(o,'sine',190,85,t,0.16,0.4,0.003);sNoise(o,t,0.09,0.18,'lowpass',2400,500,0.7);sTone(o,'triangle',880,1320,t+0.03,0.08,0.06,0.003);break;
  case 'flip':sNoise(o,t,0.22,0.4,'bandpass',700,3600,1.4);sTone(o,'sine',1600,2200,t+0.16,0.06,0.05,0.003);break;
  case 'draw':sNoise(o,t,0.12,0.12,'bandpass',1200,3000,1.2);sNoise(o,t+0.1,0.12,0.12,'bandpass',1300,3200,1.2);break;
  case 'attack':sNoise(o,t,0.18,0.3,'bandpass',4200,600,1.6);sTone(o,'sine',160,55,t+0.06,0.28,0.55,0.003);sNoise(o,t+0.06,0.2,0.2,'lowpass',1800,300,0.7);break;
  case 'defense':[620,1240,1870].forEach(function(f,k){sTone(o,'sine',f,f*0.99,t,0.55-k*0.1,0.12/(k+1),0.002)});sNoise(o,t,0.06,0.15,'highpass',3000,3000,0.7);break;
  case 'immune':[76,79,83,88].forEach(function(m,k){sTone(o,'triangle',mtof(m),0,t+k*0.06,0.5,0.09,0.004).connect(SND.rev)});break;
  case 'counter':sNoise(o,t,0.15,0.2,'bandpass',800,4000,1.3);[700,1480].forEach(function(f){sTone(o,'square',f,f*0.97,t+0.13,0.3,0.05,0.002,3500)});sTone(o,'sine',130,60,t+0.13,0.22,0.4,0.003);break;
  case 'silence':sTone(o,'sine',330,110,t,0.55,0.25,0.01,900);sNoise(o,t,0.5,0.08,'lowpass',1600,200,0.7);break;
  case 'disrupt':for(var q=0;q<5;q++)sTone(o,'square',300+Math.random()*900,0,t+q*0.045,0.04,0.06,0.002,2500);sTone(o,'sawtooth',220,90,t+0.22,0.18,0.08,0.003,1200);break;
  case 'skill':sTone(o,'sawtooth',300,1300,t,0.35,0.09,0.01,2600);sTone(o,'triangle',mtof(84),0,t+0.3,0.35,0.08,0.004).connect(SND.rev);break;
  case 'spell':for(var p=0;p<6;p++)sTone(o,'sine',mtof(84+[0,4,7,12,16,19][p]),0,t+p*0.05,0.45,0.07,0.003).connect(SND.rev);sNoise(o,t,0.4,0.05,'highpass',6000,9000,0.7);break;
  case 'ult':sNoise(o,t,1.0,0.3,'bandpass',300,6000,1.1);sTone(o,'sawtooth',110,880,t,1.0,0.16,0.3,2400);sTone(o,'sine',90,30,t+1.0,0.8,0.7,0.004);sNoise(o,t+1.0,0.6,0.3,'lowpass',2500,200,0.7);break;
  case 'crit':sTone(o,'sine',120,35,t,0.5,0.75,0.002);sNoise(o,t,0.35,0.35,'lowpass',6000,400,0.7);sTone(o,'triangle',2400,1800,t,0.35,0.08,0.002).connect(SND.rev);break;
  case 'hit':sTone(o,'sine',140,60,t,0.15,0.35,0.002);sNoise(o,t,0.08,0.12,'lowpass',2600,500,0.7);break;
  case 'heal':[72,76,79].forEach(function(m,k){sTone(o,'sine',mtof(m),0,t+k*0.05,0.35,0.07,0.01).connect(SND.rev)});break;
  case 'void':sTone(o,'square',90,70,t,0.18,0.25,0.002,700);sNoise(o,t,0.12,0.3,'lowpass',1200,300,0.7);break;
  case 'bhit':sTone(o,'sine',150,40,t,0.28,0.9,0.002);sNoise(o,t,0.12,0.35,'lowpass',2600,600,1);sTone(o,'triangle',900,300,t,0.08,0.18,0.001);break;  /* SFX_BANNER_HIT 임시: 쿵 + 짧은 파열 */
  case 'turn':sNoise(o,t,0.35,0.12,'bandpass',500,4500,1.1);sTone(o,'sine',110,48,t+0.3,0.4,0.5,0.003);break;
  case 'rush':sTone(o,'sawtooth',55,110,t,0.9,0.16,0.05,900);sNoise(o,t,0.9,0.12,'bandpass',200,1500,0.9);break;
  case 'match':[67,71,74,79].forEach(function(m,k){sTone(o,'square',mtof(m),0,t+k*0.09,0.3,0.06,0.004,3000).connect(SND.rev)});break;
  case 'win':[60,64,67,72,76,79].forEach(function(m,k){sTone(o,'square',mtof(m),0,t+k*0.1,k===5?0.9:0.25,0.07,0.004,3200).connect(SND.rev)});break;
  case 'lose':[67,63,60,55].forEach(function(m,k){sTone(o,'triangle',mtof(m),0,t+k*0.18,k===3?1.0:0.3,0.09,0.01,1800).connect(SND.rev)});break;
  case 'warn':sTone(o,'square',880,880,t,0.12,0.09,0.003,2600);sTone(o,'square',660,660,t+0.15,0.16,0.09,0.003,2600);break;
  case 'tick':sTone(o,'square',1500,1100,t,0.035,0.08,0.001,4000);break;
  case 'cut_fire':sNoise(o,t,1.4,0.35,'lowpass',600,3200,0.6);sNoise(o,t+0.05,1.2,0.18,'bandpass',1800,900,2);for(var f1=0;f1<14;f1++)sNoise(o,t+0.15+Math.random()*1.3,0.025,0.25,'highpass',3500,3500,0.7);sTone(o,'sawtooth',70,140,t,1.2,0.12,0.25,700);sTone(o,'sine',95,32,t+0.45,0.9,0.75,0.004);break;
  case 'cut_water':sNoise(o,t,0.9,0.3,'bandpass',300,2400,0.9);sNoise(o,t+0.5,1.0,0.22,'lowpass',2200,500,0.7);for(var w1=0;w1<10;w1++){var bf=500+Math.random()*900;sTone(o,'sine',bf,bf*2.2,t+0.2+Math.random()*1.2,0.07,0.1,0.004)}sTone(o,'sine',80,40,t+0.45,0.8,0.6,0.004);[72,79,84].forEach(function(m,k){sTone(o,'triangle',mtof(m),0,t+0.5+k*0.08,0.8,0.06,0.01).connect(SND.rev)});break;
  case 'cut_wind':sNoise(o,t,1.5,0.4,'bandpass',500,2600,3);sNoise(o,t+0.25,1.2,0.25,'bandpass',2600,700,4);sNoise(o,t+0.1,0.5,0.15,'highpass',5000,9000,0.7);sTone(o,'sine',110,50,t+0.45,0.6,0.45,0.004);[79,83,86,91].forEach(function(m,k){sTone(o,'sine',mtof(m),0,t+0.55+k*0.06,0.6,0.05,0.01).connect(SND.rev)});break
;
  case 'siren':for(var sr=0;sr<3;sr++){sTone(o,'sawtooth',560,880,t+sr*0.5,0.25,0.035,0.03,1800);sTone(o,'sawtooth',880,560,t+sr*0.5+0.25,0.25,0.035,0.01,1800)}break;  /* SFX_SIREN 임시: 약 1.5초, 낮은 볼륨 */
  case 'ko':sTone(o,'sine',80,25,t,1.2,0.9,0.003);sNoise(o,t,0.9,0.4,'lowpass',4000,120,0.7);sTone(o,'sawtooth',220,55,t,0.8,0.08,0.003,900);break}}
/* 첫 터치·클릭 때 오디오 켜기(브라우저 자동 재생 규칙), 화면을 떠나면 멈춤 */
document.addEventListener('pointerdown',function(e){var c=sndInit();if(!c)return;if(c.state==='suspended')c.resume().then(musicSync);musicSync();if(e.target.closest&&e.target.closest('button'))sfx('click')},true);
['touchend','click'].forEach(function(n){document.addEventListener(n,function(){var c=sndInit();if(c&&c.state==='suspended')c.resume().then(musicSync);if(SND.keep&&SND.keep.paused)SND.keep.play().catch(function(){})},true)});  /* iOS: 터치가 끝날 때 열리는 경우 대비 */
document.addEventListener('visibilitychange',function(){var c=SND.ctx;if(!c)return;if(document.visibilityState==='visible'){c.resume();if(SND.keep)SND.keep.play().catch(function(){});if(SND.curEl)SND.curEl.play().catch(function(){})}else{c.suspend();if(SND.keep)SND.keep.pause();if(SND.curEl)SND.curEl.pause()}});
function sndSet(){if(!SND.ctx)return;var t=SND.ctx.currentTime;SND.mus.gain.setTargetAtTime(S.musOff?0:0.6,t,0.1);SND.sfx.gain.setTargetAtTime(S.sndOff?0:0.75,t,0.05)}
/* 감정표현 4종: Microsoft Fluent Emoji 3D(MIT, 사용료 없음·화면 표기 불필요) + CSS 애니메이션(투명 배경) */
var EMO_IMG={EMOTE_HELLO:'data:image/webp;base64,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',EMOTE_NICE:'data:image/webp;base64,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',EMOTE_OOPS:'data:image/webp;base64,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',EMOTE_THINK:'data:image/webp;base64,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'};
S.rmo=lsGet('play_rmo')==='1'||(lsGet('play_rmo')==null&&!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches));
function lay4(){var W=VW(),H=VH(),f=safe(),sl=Math.max(60,f.l),sr=Math.max(60,f.r),st=Math.max(0,f.t),sb=Math.max(16,f.b);
 var k=Math.max(0.6,Math.min((W-sl-sr)/668,(H-st-sb)/344)),Wd=W/k,Hd=H/k;
 return {k:k,Wd:Wd,Hd:Hd,X0:sl/k,X1:Wd-sr/k,Y0:st/k,BY:st/k+40,BB:Hd-sb/k}}
/* 프로필(시안 캐릭터 카드): 등급 프레임 + 카드 영역 5:7(상자에 폭 맞춤·위 맞춤) + 위 속성·확정 뱃지 + 아래 이름·HP */
function profCard(p,who,w,h,tier){var c=ch(p.char),a=((S.A.art||{})[p.char]||{})['000']||{},sl=S.A.slots,fac=sl['FACTION_'+FAC[c.faction]],fr=tier?sl['FRAME_'+tier]:null;
 var max=p.maxHp,hp=p.hp,sh=Math.min(p.shield,max),pw=Math.max(0,100*hp/max),sw=Math.min(100-pw,100*sh/max);
 var comb=a.bg==='combined'&&a.combined,art=comb?regBg(a.combined,{x:0,y:0,w:1,h:1},w/h):a.full?regBg(a.full,crOf(a),w/h):'';
 var bgs=a.bgSlot&&sl[a.bgSlot],bgL=a.bg==='color'&&a.bgColor?'background:linear-gradient(180deg,'+a.bgColor+',#111)':comb?'background:#223':bgs?'background:url('+bgs.url+') center/cover no-repeat':'background:#c13701';
 var ok=who==='me'?!!p.mySubmission:!!p.submitted;
 return '<div class="vc side pf" id="side_'+who+'" style="width:'+w+'px;height:'+h+'px"><div class="pfill"><div class="pbg" style="'+bgL+'"></div><div class="vfa" id="face_'+who+'"><div class="part" style="'+art+'"></div></div></div>'
  +'<div class="pcont pbot">'
  +'<div class="pst"><b class="pnm">'+esc(c.name)+'</b><div class="hpbar"><div class="gh" id="gh_'+who+'" style="width:'+pw+'%"></div><div class="hp" id="hp_'+who+'" style="width:'+pw+'%"></div><div class="sh" id="sh_'+who+'" style="left:'+pw+'%;width:'+sw+'%"></div></div>'
  +'<div class="hptx"><span id="hpt_'+who+'">'+hp+'/'+max+'</span><span id="sht_'+who+'">'+(sh?'+'+sh:'')+'</span></div></div></div>'
  +'<div class="pfr'+(fr?'" style="background-image:url('+fr.url+')"':' nof"')+'></div>'
  +'<div class="pcont ptopw"><div class="ptop">'+(fac?'<i class="pfac" style="background-image:url('+fac.url+')"></i>':'<i></i>')+(ok?'<b class="okb">확정</b>':'')+'</div></div></div>'}
/* 버프·디버프 아이콘 16pt: 3개까지, 넘치면 세 번째를 어둡게 + "+N"(누르면 한 줄 설명) */
function buffs4(p,who,turn){var st=[];S.bprev=S.bprev||{};if(p.shieldCarry>0)st.push({k:'carry',v:p.shieldCarry,left:1});
 p.status.forEach(function(s){if(s.k==='tide'){if(s.flood)st.push({k:'flood',left:1});if(s.ebb)st.push({k:'ebb',left:1})}else st.push(s)});
 var it=st.map(function(s){var d=SDEF[s.k]||[(ST[s.k]||[s.k])[0],'초록','',''],u=d[3]?S.A.slots['STATUS_'+d[3]]:null,col=CN[d[1]]||'#8a90a8',per=perTxt(s,turn);
  var lab=d[0]+(s.k==='carry'?' '+s.v:s.k==='burn'?' ×'+s.n:s.k==='handSeal'&&s.n?' '+s.n+'장':''),key=who+':'+s.k,fl=S.bprev[key]&&S.bprev[key].indexOf('다음')===0&&per==='이번 턴';S.bprev[key]=per;
  return {u:u,col:col,fl:fl,c1:Array.from(String(d[0]))[0]||'?',tip:lab+(per?' · '+per:'')+(d[2]?' — '+d[2]:''),sd:{n:lab,p:per,d:d[2]||'',c:col,u:u?u.url:'',c1:Array.from(String(d[0]))[0]||'?',w:who}}});
 var cut=it.length>3,more=it.length-2;
 return (cut?it.slice(0,3):it).map(function(x,i){var last=cut&&i===2,tip=last?it.slice(2).map(function(y){return y.tip}).join(' / '):x.tip;
  return '<i class="bf'+(x.fl?' flash':'')+(last?' more':'')+'" style="--bc:'+x.col+(x.u?';background-image:url('+x.u.url+')':'')+'" data-tip="'+esc(tip)+'" data-st="'+esc(JSON.stringify(last?it.slice(2).map(function(y){return y.sd}):[x.sd]))+'">'+(x.u||last?'':esc(x.c1))+(last?'<b>+'+more+'</b>':'')+'</i>'}).join('')}
/* 상단 전투 순서 알약: "N턴" + 7종(면역·방어·반격·침묵·방해·스킬·공격). 위 뱃지 = 상대(공개 후), 아래 뱃지 = 나(Figma 레이어 이름 기준). 0이면 뱃지 없음(사용자 요청 2026-11-05) */
function pills4(b,cnt){var pv=S.kpPrev||{},h='<span class="kp tp">'+b.turn+'턴</span>';
 KP.forEach(function(k){var o=cnt.opp[k]||0,me=cnt.me[k]||0;h+='<span class="kp'+(me?' on':'')+'" data-k="'+k+'" style="--kc:'+KCOL[k]+'" data-tip="'+esc((KIND_KO[k]||KP_KO[k])+' — 나 '+me+'장'+(o?' · 상대 '+o+'장':''))+'">'+(KIND_KO[k]||KP_KO[k])+(o?'<em class="po">'+o+'</em>':'')+(me?'<em class="pm'+((pv[k]||0)<me?' pop':'')+'">'+me+'</em>':'')+'</span>'});return h}
function actCirc(p,mine,sub,reveal){var st=actState(p),g=Math.min(100,p.gauge),c=ch(p.char),on=mine&&!reveal&&(S.sel.active||(sub&&sub.active)),tg=mine?'button id="act"':'span';
 return '<'+tg+' class="cir ac '+st+(on?' on':'')+'" data-tip="'+esc((mine?'':'상대 ')+'액티브 '+(c.active_name||'')+' — '+(c.active_text||'')+' · 게이지 '+g+'/100')+'"'+(mine&&(sub||reveal||st!=='ready')?' disabled':'')+'><i class="cf" style="'+faceCss(p.char)+'"></i>'+(st==='ready'?'':'<s></s>')+'<b>'+(st==='lock'?'🔒':st==='ready'?(mine?'액티브':'✦'):g+'%')+'</b></'+(mine?'button':'span')+'>'}
function rushCirc(b){var r=b.rules,t=b.turn,on=t>=r.rush_start_turn,pct=Math.round((r.rush_dmg_step||0.25)*(t-r.rush_start_turn+1)*100);
 return '<span class="cir ru'+(on?' on':'')+'" data-tip="'+esc(on?'폭주 중: 피해 +'+pct+'%':'폭주까지 '+(r.rush_start_turn-t)+'턴 — 폭주가 시작되면 매 턴 피해가 커져요')+'"><s></s><b>'+(on?'폭주<br>+'+pct+'%':'폭주<br>-'+(r.rush_start_turn-t))+'</b></span>'}
function spCirc(p,mine,sub){return Object.keys(p.spells).map(function(id,i){var cd=p.spells[id],ic=S.A.slots['SPELL_'+id],s=S.data.spells[id]||{},on=mine&&(S.sel.spell===id||(sub&&sub.spell===id)),tg=mine?'button data-spell="'+id+'"':'span';
 return '<'+tg+' class="cir spc4'+(cd>0?' cd':'')+(on?' on':'')+'" data-tip="'+esc((mine?'':'상대 ')+'스펠 '+sname(id)+(cd>0?' · 쿨다운 '+cd+'턴 남음':' · 사용 가능')+' — '+(s.effect_text||'')+(mine?' ('+(i?'W':'Q')+')':''))+'" style="'+(ic?'background-image:url('+ic.url+')':'')+'"'+(mine&&(sub||cd>0)?' disabled':'')+'>'+(ic?'':'<i>'+esc(sname(id).slice(0,2))+'</i>')+(cd>0?'<b>'+cd+'</b>':'')+'</'+(mine?'button':'span')+'>'}).join('')}
/* 슬롯: 비어 있으면 카드 뒷면. 카드를 고르면 Y축으로 돌아 앞면(0.5초, 튕김) */
function slots4(items,mine,n){var bk=S.A.slots.CARD_BACK?'background-image:'+slotU('CARD_BACK'):'background:linear-gradient(160deg,#2a3a7a,#141a3a)',h='';
 for(var i=0;i<n;i++){var x=items[i];if(i)h+=caret(mine?1:-1);
  h+='<div class="slot'+(mine?' mine':'')+(x?' fill k-'+x.k:'')+'"'+(x&&x.skey?' data-skey="'+x.skey+'"':'')+(x&&x.click?' '+x.click:'')+'><div class="fl'+(x?'':' flb')+'"><div class="cb" style="'+bk+'"></div>'+(x?'<div class="ff">'+x.html+'</div>':'')+'</div></div>'}
 return h}
function emoBub(sd,P,l,t){var e=S.emo&&S.emo[sd];if(!e)return '';var age=Date.now()-e.at;if(age>2600)return '';var x=EMO[e.id]||['🙂',''];
 return '<div class="emb" id="emb_'+sd+'" style="'+P(l-4,t-6,44,44)+';animation-delay:-'+age+'ms" title="'+esc(x[1])+'">'+emoImg(e.id,'em-'+String(e.id).replace('EMOTE_',''),age)+'</div>'}
function emoImg(id,cls,age){var u=EMO_IMG[id];return u?'<img class="emi '+(cls||'')+'" src="'+u+'" alt="" style="animation-delay:-'+(age||0)+'ms">':(EMO[id]||['🙂'])[0]}
function emoteShow(m,local){var st=S.st;if(!st||st.phase!=='battle')return;var sd=m.seat===st.you?'me':'opp';if(!local&&sd==='me'&&S.emMine&&S.emMine.id===m.id&&Date.now()-S.emMine.at<4000){if(m.left!=null)S.emLeft=m.left;S.emMine=null;return}if(m.left!=null)S.emLeft=m.left;S.emo=S.emo||{};S.emo[sd]={id:m.id,at:Date.now()};
 var old=$('emb_'+sd);if(old)old.remove();var L=S.L4,g=$('stg');if(!L||!g)return;var lef=!!S.lefty,P=function(l,t,w,h){if(lef)l=L.Wd-l-w;return 'left:'+l+'px;top:'+t+'px;width:'+w+'px;height:'+h+'px'};
 var d=document.createElement('div');d.innerHTML=sd==='me'?emoBub('me',P,L.X0,L.BB-208):emoBub('opp',P,L.X1-127,L.BY);if(d.firstChild)g.appendChild(d.firstChild)}
function menu4(){return '<div class="menu m4" id="m4">'+'<button id="mSur">항복</button><button id="mLeft">왼손 모드 '+(S.lefty?'끄기':'켜기')+'</button><button id="mHelp">도움말 다시보기</button><button id="mSpd">연출속도: '+SPD_LAB[S.rspd||'normal']+'</button>'
 +(manualOk()?'<button id="mMan">탭으로 행동: '+(S.manual?'켜짐':'꺼짐')+'</button>':'')+'<button id="mMus">음악: '+(S.musOff?'꺼짐':'켜짐')+'</button><button id="mSnd">효과음: '+(S.sndOff?'꺼짐':'켜짐')+'</button><button id="mVib">진동: '+(S.vibOff?'꺼짐':'켜짐')+'</button>'
 +'<button id="mRmo">동작 줄이기: '+(S.rmo?'켜짐':'꺼짐')+'</button><button id="mSkm">스킬 연출: '+(S.skm==='over'?'오버레이':'풀화면')+'</button><button class="mcl" id="mClose">닫기</button></div>'}
function renderBattle(m,reveal){var b=m.battle,me=b.me,op=b.opp,sub=me.mySubmission,L=lay4(),k=L.k;S.L4=L;S.wide=false;
 if(S.selTurn!==b.turn){S.sel={cards:[],spell:null,active:false};S.selTurn=b.turn;S.kpPrev={}}
 var hand=me.hand.slice().sort(function(x,y){var a=card(x.id),c=card(y.id);return x.cost-y.cost||(KIND_ORD[a.kind]-KIND_ORD[c.kind])||x.uid-y.uid});
 var chosen=sub?sub.cards:S.sel.cards,used=sumCost(me,chosen),blockSkill=me.status.some(function(s){return s.k==='skillBlock'});
 var max=b.rules.cards_per_turn_max||3,full=chosen.length>=max,opItems=[],meItems=[],cnt={me:{},opp:{}},fm=frameOf(m.prep&&m.prep.frame.mine).tier,fo=frameOf(m.prep&&m.prep.frame.opp).tier;
 var add=function(sd,kk){if(KIND_KO[kk]||kk==='spell')cnt[sd][kk]=(cnt[sd][kk]||0)+1};
 if(reveal){
  opItems=reveal.opp.map(function(x,i){var at=' id="rv_opp'+i+'"';add('opp',x.k);return x.k==='spell'?cellSpell(x.id,48,at,true):x.k==='active'?cellActive(op.char,48,at,true,fo):cellCard(x.id,48,at)});
  meItems=reveal.me.map(function(x,i){var at=' id="rv_me'+i+'"';add('me',x.k);return x.k==='spell'?cellSpell(x.id,48,at,true):x.k==='active'?cellActive(me.char,48,at,true,fm):cellCard(x.id,48,at)})}
 else{
  chosen.forEach(function(u){var c=me.hand.find(function(x){return x.uid===u});if(c){var it=cellCard(c.id,48);it.skey='u'+u;if(!sub)it.click='data-unpick="'+u+'"';meItems.push(it);add('me',card(c.id).kind)}});
  var sp=sub?sub.spell:S.sel.spell,ac=sub?sub.active:S.sel.active;
  if(sp){add('me','spell');var a1=cellSpell(sp,48,'',!!sub);a1.skey='sp';if(!sub)a1.click='data-unspell="1"';meItems.push(a1)}
  if(ac){var a2=cellActive(me.char,48,'',!!sub,fm);a2.skey='ac';if(!sub)a2.click='data-unact="1"';meItems.push(a2)}
  meItems=sortCells(meItems)}
 var tl=left(m.deadline),waiting=!!sub&&!reveal,rushing=b.turn>=b.rules.rush_start_turn;
 var prevR={},zk=(S.zs||1)*k;document.querySelectorAll('.slots.me [data-skey]').forEach(function(el){prevR[el.dataset.skey]=el.getBoundingClientRect()});
 var lef=!!S.lefty,P=function(l,t,w,h){if(lef&&w!=null)l=L.Wd-l-w;return 'left:'+l.toFixed(1)+'px;top:'+t.toFixed(1)+'px'+(w!=null?';width:'+w.toFixed(1)+'px':'')+(h!=null?';height:'+h.toFixed(1)+'px':'')};
 var X0=L.X0,X1=L.X1,BY=L.BY,BB=L.BB,CX=X0+124,CW=X1-CX,nMe=Math.max(3,Math.min(5,meItems.length)),nOp=Math.max(3,Math.min(5,opItems.length)),opW=nOp*48+(nOp-1)*12,OR=X1-99,opL=OR-opW;
 var cenW=Math.max(80,opL-8-CX),cenH=Math.max(24,BB-228-BY),sy=Math.min(60,Math.max(0,cenH-100)*0.5);cenH-=sy;  /* 세로가 남으면 내 슬롯을 올려 슬롯~손패 간격으로 흡수(기획지시 2026-11-06 처리순서줄제거 3) */
 var n=hand.length,ov=n>1?Math.max(-60,Math.min(2,(CW-72*n)/(n-1))):2;
 var emb='';if(rushing)for(var q=0;q<10;q++)emb+='<s style="left:'+Math.round(4+q*9.6+Math.random()*4)+'%;animation-delay:-'+(Math.random()*3).toFixed(2)+'s;animation-duration:'+(2.4+Math.random()*1.6).toFixed(2)+'s"></s>';
 var h='<div class="bt bt3 bt4'+(lef?' lefty':'')+(reveal?' rev':'')+(rushing?' rushing':'')+'" id="bt" data-turn="'+b.turn+'"><div id="stg" style="width:'+L.Wd.toFixed(1)+'px;height:'+L.Hd.toFixed(1)+'px;zoom:'+k.toFixed(4)+';--pr:'+(L.Wd-X1).toFixed(1)+'px;--y0:'+L.Y0.toFixed(1)+'px;--hd:'+L.Hd.toFixed(1)+'px">'
 +(rushing?'<div class="redge">'+emb+'</div>':'')
 +'<div class="hdr" style="left:'+X0.toFixed(1)+'px;top:'+L.Y0.toFixed(1)+'px;width:'+(X1-X0).toFixed(1)+'px;height:40px"><button id="menu" class="ib4'+(S.menu&&!reveal?' on':'')+'" title="설정">'+SVG_GEAR+'</button><button id="emo" class="ib4'+(S.emoOpen?' on':'')+'" title="감정표현">'+SVG_CHAT+'</button>'
 +'<div class="pills" id="pills">'+pills4(b,cnt)+'</div><button id="logb" class="logb'+(S.showLog?' on':'')+'" title="눌러서 전체 로그 (L)">전투로그</button></div>'
 +'<div class="center c4" style="'+P(CX,BY,cenW,cenH)+'"><div class="cap'+(waiting?' show':'')+'" id="cap">'+(waiting?'상대 기다리는 중':'')+'</div></div>'
 +'<div class="oppc" style="'+P(X1-87,BY,87)+'">'+profCard(op,'opp',87,122,fo)+'<div class="bdg" id="bdg_opp">'+buffs4(op,'opp',b.turn)+'</div></div>'
 +'<div class="opslots" style="'+P(opL,BY,opW)+'"><div class="slots opp srow4">'+slots4(opItems,false,nOp)+'</div>'
 +'<div class="ops cirs">'+actCirc(op,false)+spCirc(op,false)+'<span class="cir hc" style="'+(S.A.slots.CARD_BACK?'background-image:'+slotU('CARD_BACK'):'')+'" data-tip="상대 남은 전투카드 '+op.handCount+'장"><s></s><b>+'+op.handCount+'</b></span><span class="cir en" data-tip="상대 에너지 '+op.energy+'">E'+op.energy+'</span></div></div>'
 +'<div class="mec" style="'+P(X0,BB-177,112)+'"><div class="bdg" id="bdg_me">'+buffs4(me,'me',b.turn)+'</div>'+profCard(me,'me',112,157,fm)  /* 캐릭터 카드 5:7 통일(사용자 요청 2026-11-06) */+'</div>'
 +'<div class="meslots" style="'+P(CX,BB-224-sy,nMe*60-12)+'"><div class="slots me srow4">'+slots4(meItems,true,nMe)+'</div></div>'
 +'<div class="hand" style="'+P(CX,BB-157,CW,109)+';--ov:'+ov.toFixed(1)+'px">'+hand.map(function(c,i){var picked=chosen.indexOf(c.uid)>=0,sb=blockSkill&&card(c.id).kind==='skill',cant=!picked&&sumCost(me,chosen.concat([c.uid]))>me.energy,cls=picked?'picked':(c.sealed||sb)?'lock':cant?'cant':full?'dim':(reveal||sub)?'':'can';
  return bcCard(c.id,{w:72,mode:'hand',face:true,fig:true,cls:cls,attr:' data-uid="'+c.uid+'" data-i="'+i+'" data-cid="'+c.id+'"',extra:sb&&!picked?'<span class="lockt">이번 턴 사용 불가</span>':''})}).join('')+'</div>'
 +'<div class="brow ctl" style="'+P(CX,BB-40,CW,40)+'"><div class="cirs">'+actCirc(me,true,sub,reveal)+spCirc(me,true,sub)
 +'<span class="cir en eng" data-tip="'+esc('내 에너지 '+(me.energy-used)+'/'+me.energy+' — 고른 카드 비용만큼 줄어요'+(me.freeOneCost?' · 순풍: 매 턴 처음 내는 1E 카드 비용 0':''))+'">E'+(me.energy-used)+'</span></div>'
 +(reveal?'<button id="spd" class="b2" title="연출 속도">'+SPD_LAB[S.rspd||'normal']+'</button><button class="b1 confirm skip" id="skip">건너뛰기 ▶▶</button>'
  :(m.timebankUsed||sub?'':'<button id="tb" class="b2" title="판당 1회 (T)">+15초</button>')+'<button class="b1 confirm'+(!sub&&tl>10&&(chosen.length||S.sel.spell||S.sel.active)?' go':'')+(!sub&&tl<=10?' red':'')+(!sub&&tl<=5&&tl>0?' beat':'')+'" id="ok"'+(sub?' disabled':' data-lab="확정"')+'>'+(sub?'확정됨':'확정 ('+tl+'초 남음)')+'</button>')+'<div class="cirs rz">'+rushCirc(b)+'</div></div>'
 +emoBub('me',P,X0,BB-208)+emoBub('opp',P,X1-127,BY)
 +(S.emoOpen?'<div class="emp4" style="left:'+(X0+40).toFixed(1)+'px;top:'+(L.Y0+40).toFixed(1)+'px">'+EMO_IDS.map(function(id){return '<button data-em="'+id+'" title="'+esc(EMO[id][1])+'">'+emoImg(id,'')+'</button>'}).join('')+'<small>남은 '+(S.emLeft==null?10:S.emLeft)+'회</small><button class="mute" id="emMute">상대 끄기</button></div>':'')
 +(S.menu&&!reveal?menu4().replace('class="menu m4"','class="menu m4" style="left:'+X0.toFixed(1)+'px;top:'+(L.Y0+40).toFixed(1)+'px"'):'')
 +'</div></div>';
 $('app').innerHTML=h;document.body.classList.toggle('rmo',!!S.rmo);
 if(!reveal)turnBanner(b);
 document.querySelectorAll('.slots.me [data-skey]').forEach(function(el){var r0=prevR[el.dataset.skey],fl=el.querySelector('.fl');if(!r0){if(fl&&!reveal&&!S.rmo)fl.classList.add('flin');return}if(!el.animate)return;var r1=el.getBoundingClientRect(),dx=(r0.left-r1.left)/zk,dy=(r0.top-r1.top)/zk;if(Math.abs(dx)>2||Math.abs(dy)>2)el.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],{duration:300,easing:'ease-out'})});
 if(reveal)document.querySelectorAll('.slots.opp .slot.fill .fl').forEach(function(fl,i){sfx('flip',i*0.16);if(S.rmo)return;fl.style.animationDelay=(i*0.16)+'s';fl.classList.add('flin')});  /* 상대 카드: 공개 때 0.16초 간격으로 뒤집힘 */
 S.kpPrev=cnt.me;
 $('logb').onclick=function(){var on=!S.showLog;popClose('log');S.showLog=on;refreshLog();this.classList.toggle('on',S.showLog)};if(S.showLog)refreshLog();
 $('emo').onclick=function(){var on=!S.emoOpen;popClose('emo');S.emoOpen=on;toggleEmo();this.classList.toggle('on',on)};
 document.querySelectorAll('[data-em]').forEach(function(el){el.onclick=function(){emoSend(el.dataset.em)}});
 if($('emMute'))$('emMute').onclick=function(){send({type:'mute_emotes'});S.emoOpen=false;toggleEmo()};
 document.querySelectorAll('.vc.pf').forEach(function(el){el.onclick=function(ev){ev.stopPropagation();passiveView(el.id==='side_me'?'me':'opp')}});
 document.querySelectorAll('.pop,[data-tip].kp,.cir[data-tip],.bf').forEach(function(el){if(el.tagName!=='BUTTON')el.onclick=function(e){e.stopPropagation();var same=$('tip')&&S.tipEl===el;popClose('tip');if(same){tipHide();S.tipEl=null}else{tipShow(el);S.tipEl=el}}});
 if(reveal)return;
 if(m.reveal&&!m.reveal.done&&S.revSent!==b.turn){S.revSent=b.turn;send({type:'revealed',turn:b.turn})}
 document.querySelectorAll('.hand [data-uid]').forEach(function(el){el.onclick=function(){pickCard(Number(el.dataset.uid))}});
 document.querySelectorAll('.slot[data-unpick],.slot[data-unspell],.slot[data-unact]').forEach(function(el){el.onclick=function(){var fl=el.querySelector('.fl'),go=function(){if(el.hasAttribute('data-unpick'))pickCard(Number(el.dataset.unpick));else if(el.hasAttribute('data-unspell')){S.sel.spell=null;render()}else{S.sel.active=false;render()}};if(fl&&!S.rmo){fl.classList.remove('flin');fl.classList.add('flb');setTimeout(go,260)}else go()}});  /* 슬롯을 다시 누르면 뒷면으로 돌고 카드·에너지 복귀 */
 document.querySelectorAll('[data-spell]').forEach(function(el){el.onclick=function(){if(sub)return;S.sel.spell=S.sel.spell===el.dataset.spell?null:el.dataset.spell;sfx(S.sel.spell?'place':'flip');render()}});
 $('act').onclick=function(){S.sel.active=!S.sel.active;sfx(S.sel.active?'place':'flip');render()};
 $('ok').onclick=function(){submitTurn()};if($('tb'))$('tb').onclick=function(){send({type:'timebank'});busy(this,'요청 중…')};
 $('menu').onclick=function(){var on=!S.menu;popClose('menu');S.menu=on;render()};
 if(S.menu){var cl=function(){S.menu=false;render()};$('mClose').onclick=cl;
  $('mSur').onclick=function(){S.menu=false;render();if(b.turn<4)return toast('항복은 4턴부터 할 수 있어요');ask('항복할까요? 패배로 끝나요.','항복',function(){send({type:'surrender'});busy($('ok'),'항복 처리 중…')})};
  $('mLeft').onclick=function(){S.lefty=!S.lefty;lsSet('play_lefty',S.lefty?'1':'');S.menu=false;render()};$('mHelp').onclick=function(){S.menu=false;lsSet(firstKey(),'{}');render();guide(true)};
  $('mSpd').onclick=function(){S.rspd=SPD_NEXT[S.rspd||'normal'];lsSet('play_rspd',S.rspd);render()};if($('mMan'))$('mMan').onclick=function(){S.manual=!S.manual;lsSet('play_manual',S.manual?'1':'');render()};
  $('mSnd').onclick=function(){S.sndOff=!S.sndOff;lsSet('play_snd',S.sndOff?'0':'1');sndSet();render()};$('mMus').onclick=function(){S.musOff=!S.musOff;lsSet('play_mus',S.musOff?'0':'1');sndInit();sndSet();render()};$('mVib').onclick=function(){S.vibOff=!S.vibOff;lsSet('play_vib',S.vibOff?'0':'1');render()};
  $('mRmo').onclick=function(){S.rmo=!S.rmo;lsSet('play_rmo',S.rmo?'1':'0');render()};$('mSkm').onclick=function(){S.skm=S.skm==='over'?'full':'over';lsSet('play_skm',S.skm);render();skPreview(me.char)}}
 if(S.guideOn&&S.guideShow)S.guideShow();
 if(b.turn===1&&!sub&&S.guideTurn!==m.code+':1'&&(S.forceGuide||Number(lsGet('play_games_'+(lsGet('play_dev')||''))||0)<3)){S.guideTurn=m.code+':1';setTimeout(function(){guide(false)},300)}}
/* 공개 연출 중 감정표현 패널(다시 그리지 않고 붙였다 뗌) */
function toggleEmo(){var p=document.querySelector('.emp4');if(p){p.remove();return}if(!S.emoOpen||!S.L4)return;var g=$('stg');if(!g)return;var d=document.createElement('div');d.className='emp4';d.style.left=(S.L4.X0+40)+'px';d.style.top=(S.L4.Y0+40)+'px';
 d.innerHTML=EMO_IDS.map(function(id){return '<button data-em="'+id+'">'+emoImg(id,'')+'</button>'}).join('')+'<small>남은 '+(S.emLeft==null?10:S.emLeft)+'회</small><button class="mute" id="emMute2">상대 끄기</button>';g.appendChild(d);
 d.querySelectorAll('[data-em]').forEach(function(el){el.onclick=function(){emoSend(el.dataset.em)}});var mu=d.querySelector('#emMute2');if(mu)mu.onclick=function(){send({type:'mute_emotes'});S.emoOpen=false;d.remove()}}
function emoSend(id){var now=Date.now();if(S.emLeft===0)return toast(ERR.emote_limit);if(now-(S.emAt||0)<3000)return toast(ERR.emote_cooldown);S.emAt=now;S.emoOpen=false;var p=document.querySelector('.emp4');if(p)p.remove();if($('emo'))$('emo').classList.remove('on');
 send({type:'emote',id:id});S.emMine={id:id,at:now};emoteShow({seat:S.st&&S.st.you,id:id,left:S.emLeft==null?9:Math.max(0,S.emLeft-1)},true)}
/* 턴 시작(타이머버튼 4·시안 턴 시작): 일반 턴 "n Turn" 1.1초(안내 없음) · 폭주 전 턴 + 빨간 알약 · 폭주 턴 빨강→보라 + 양쪽 전신 + 안내. 연출속도 따름 */
function turnBanner(b){var key=S.room+':'+b.turn;if(S.bannerKey===key)return;S.bannerKey=key;var r=b.rules,t=b.turn,rs=r.rush_start_turn,rush=t>=rs,pre=t===rs-1,last=t>=r.max_turn,pct=Math.round((r.rush_dmg_step||0.25)*(t-rs+1)*100);
 var bt=$('bt');if(!bt)return;var K=spk(),dur=Math.round((rush||pre||last?1700:1100)*K),sp='';if(!S.rmo)for(var q=0;q<(rush?22:14);q++)sp+='<s style="--a:'+Math.round(q*360/(rush?22:14)+Math.random()*12)+'deg;--d:'+Math.round(90+Math.random()*140)+'px"></s>';
 var full=function(id){var a=((S.A.art||{})[id]||{})['000']||{};return a.full?'background-image:url('+a.full.url+')':''},bs=S.st&&S.st.battle;
 var e=document.createElement('div');e.className='tban t4'+(rush?' rush':'');e.style.setProperty('--td',dur+'ms');
 e.innerHTML=(rush&&bs?'<i class="ta l" style="'+full(bs.me.char)+'"></i><i class="ta r" style="'+full(bs.opp.char)+'"></i>':'')+sp+IMP_FX
  +'<div class="tbx"><b>'+t+'</b><span>Turn</span>'+(pre?'<div class="tpill">다음 턴부터 폭주가 시작됩니다.</div>':rush?'<div class="tpill">폭주! 모든 피해 +'+pct+'%'+(last?' · 마지막 턴':'')+'</div>':last?'<div class="tpill blue">마지막 턴</div>':'')+'</div>';
 document.querySelectorAll('body > .tban').forEach(function(x){x.remove()});document.body.appendChild(e);landHit(Math.round(1100*K));
 if(!S.rmo){var f=document.createElement('div');f.className='tflash'+(rush?' rush':'');bt.appendChild(f);setTimeout(function(){f.remove()},500);setTimeout(function(){shakeBt(rush?2:1)},200)}
 setTimeout(function(){e.remove()},dur);
 var hd=bt.querySelector('.hand');if(hd&&!S.rmo){hd.classList.add('deal');setTimeout(function(){hd.classList.remove('deal')},1300)}}
/* 액티브 스킬 연출(시안 캐릭터 스킬): 속성 색 세로 그라데이션 + 왼쪽 전신 + 오른쪽 스킬명·설명, 속도선·입자·섬광·흔들림 약 1.7초. 풀화면 / 전투 위 반투명 오버레이(설정 전환) */
/* 패시브 보기(사용자 요청 2026-11-06): 전투 중 프로필을 누르면 액티브 연출과 같은 배치로 — 전신이 다 보이게 위아래 여백, 캐릭터 주변 속성 효과. 누르면 닫힘 */
function passiveView(sd){var b=S.st&&S.st.battle;if(!b)return;var p=sd==='me'?b.me:b.opp,chr=p.char,c=ch(chr),col=SKC[c.faction]||'rgba(107,122,255,.64)',a=((S.A.art||{})[chr]||{})['000']||{},k=Math.min(innerWidth/788,innerHeight/360);
 popClose();document.querySelectorAll('body > .pview').forEach(function(x){x.remove()});
 var e=document.createElement('div');e.className='scut pview'+(S.skm==='over'?' over':'')+' fx-'+({'불':'fire','물':'water','바람':'wind'}[c.faction]||'none');e.style.setProperty('--c1',col);e.style.setProperty('--k',k.toFixed(4));
 e.innerHTML='<i class="sbg"></i><div class="sbox"><i class="paura"></i><div class="pfx">'+(S.rmo?'':fxOf(c.faction))+'</div>'+(a.full?'<i class="sart pfull" style="background-image:url('+a.full.url+')"></i>':'')
  +'<div class="stx"><small>'+(sd==='me'?esc(myName(S.st.prep))+' · ':esc(oppName(S.st.prep,S.st))+' · ')+esc(c.name)+' · 패시브</small><b>'+esc(c.passive_name||'패시브')+'</b><p>'+esc(c.passive_text||'')+'</p><div class="pact">액티브 <b>'+esc(c.active_name||'')+'</b> '+esc(c.active_text||'')+'</div></div></div><div class="phint">화면을 누르면 닫혀요</div>';
 e.onclick=function(ev){ev.stopPropagation();e.remove()};document.body.appendChild(e);sfx('flip')}
function fxOf(fac){var h='',R=Math.random,i;
 if(fac==='불'){for(i=0;i<34;i++){var z=(2+R()*5).toFixed(1);h+='<s class="em" style="left:'+(R()*100).toFixed(1)+'%;width:'+z+'px;height:'+z+'px;--dx:'+Math.round(R()*80-40)+'px;animation-duration:'+(1.2+R()*1.4).toFixed(2)+'s;animation-delay:'+(-R()*1.6).toFixed(2)+'s"></s>'}h+='<i class="fglow"></i>'}
 else if(fac==='물'){for(i=0;i<22;i++){var b=(6+R()*18).toFixed(0);h+='<s class="bu" style="left:'+(R()*100).toFixed(1)+'%;width:'+b+'px;height:'+b+'px;--dx:'+Math.round(R()*40-20)+'px;animation-duration:'+(1.8+R()*1.6).toFixed(2)+'s;animation-delay:'+(-R()*2).toFixed(2)+'s"></s>'}h+='<i class="caus"></i>'}
 else if(fac==='바람'){for(i=0;i<16;i++)h+='<s class="gs" style="top:'+(8+R()*84).toFixed(1)+'%;width:'+Math.round(80+R()*180)+'px;--rot:'+(R()*10-5).toFixed(1)+'deg;animation-duration:'+(0.7+R()*0.6).toFixed(2)+'s;animation-delay:'+(-R()*1.2).toFixed(2)+'s"></s>';for(i=0;i<10;i++)h+='<s class="lf" style="top:'+(10+R()*80).toFixed(1)+'%;--rs:'+Math.round(R()*720-360)+'deg;animation-duration:'+(1.1+R()*0.9).toFixed(2)+'s;animation-delay:'+(-R()*1.5).toFixed(2)+'s"></s>'}
 return h}
var SKC={'불':'rgba(255,86,64,.64)','물':'rgba(79,195,255,.64)','바람':'rgba(98,219,149,.64)'};
function skillCut(chr,sd,d){var c=ch(chr),col=SKC[c.faction]||'rgba(107,122,255,.64)',a=((S.A.art||{})[chr]||{})['000']||{},ms=Math.max(600,Math.round(d*spk())),k=Math.min(innerWidth/788,innerHeight/360),pt='';
 if(!S.rmo)pt=fxOf(c.faction);if(false)for(var q=0;q<14;q++)pt+='<s style="left:'+Math.round(10+Math.random()*80)+'%;top:'+Math.round(15+Math.random()*70)+'%;--dx:'+Math.round(-120+Math.random()*240)+'px;--dy:'+Math.round(-140+Math.random()*120)+'px;animation-delay:'+(Math.random()*0.6).toFixed(2)+'s"></s>';
 var e=document.createElement('div');e.className='scut'+(S.skm==='over'?' over':'')+(sd==='opp'?' opp':'')+' fx-'+({'불':'fire','물':'water','바람':'wind'}[c.faction]||'none');e.style.setProperty('--c1',col);e.style.setProperty('--d',ms+'ms');e.style.setProperty('--k',k.toFixed(4));
 e.innerHTML='<i class="sbg"></i>'+pt+'<div class="sbox">'+(a.full?'<i class="sart" style="background-image:url('+a.full.url+')"></i>':'')+'<div class="stx"><b>'+esc(c.active_name||'액티브')+'</b><p>'+esc(c.active_text||'')+'</p></div></div>'+(S.rmo?'':'<i class="sfl"></i>')+'<button class="sskip" type="button">스킵하기 ▶</button>';
 document.querySelectorAll('body > .scut').forEach(function(x){x.remove()});document.body.appendChild(e);sfx({'불':'cut_fire','물':'cut_water','바람':'cut_wind'}[c.faction]||'ult');if(!S.rmo)setTimeout(function(){shakeBt(2)},120);
 var end=function(){if(e.parentNode)e.remove()};e.querySelector('.sskip').onclick=function(ev){ev.stopPropagation();end();if(S.anim&&S.anim.adv)S.anim.adv()};setTimeout(end,ms)}
/* 설정의 스킬 연출 미리 보기: 닫기·바깥 탭까지 반복(끝나면 0.5초 쉬고 다시), 방식 전환은 바로 그 방식으로 이어서(기획지시 2026-11-06 스킬연출보기) */
function skPreview(chr){skPrevStop();var pv=document.createElement('div');pv.id='skpv';pv.className='skpv';
 var lab=function(){return '<div class="skpb"><button data-m="full"'+(S.skm!=='over'?' class="on"':'')+'>풀화면</button><button data-m="over"'+(S.skm==='over'?' class="on"':'')+'>오버레이</button><button class="skx" data-x="1">닫기 ✕</button></div>'};
 pv.innerHTML=lab();document.body.appendChild(pv);S.skPrev={chr:chr,t:0};
 var run=function(){if(!S.skPrev)return;clearTimeout(S.skPrev.t);skillCut(chr,'me',2000);S.skPrev.t=setTimeout(run,Math.max(600,Math.round(2000*spk()))+500)};
 pv.onclick=function(ev){var m=ev.target.closest&&ev.target.closest('[data-m]');ev.stopPropagation();
  if(m){if(S.skm!==m.dataset.m){S.skm=m.dataset.m;lsSet('play_skm',S.skm);pv.innerHTML=lab();if(battleOn())render()}run();return}
  skPrevStop()};
 run()}
function skPrevStop(){if(S.skPrev){clearTimeout(S.skPrev.t);S.skPrev=null}var pv=$('skpv');if(pv)pv.remove();document.querySelectorAll('body > .scut').forEach(function(x){x.remove()})}
var SPD_LAB={slow:'느리게',normal:'보통',fast:'빠르게'},SPD_NEXT={slow:'normal',normal:'fast',fast:'slow'},SPD_K={slow:1.5,normal:1,fast:0.5};
function menuHtml(){return '<div class="menu"><button id="mSur">항복</button><button id="mLeft">왼손 모드 '+(S.lefty?'끄기':'켜기')+'</button><button id="mHelp">도움말 다시 보기</button><button id="mSpd">연출 속도: '+SPD_LAB[S.rspd||'normal']+'</button>'+(manualOk()?'<button id="mMan">탭하면 다음 행동: '+(S.manual?'켜짐':'꺼짐')+'</button>':'')+'</div>'}
function manualOk(){var m=S.st;return !!m&&(m.mode==='practice'||m.mode==='friend')}  // 랭킹전은 수동 진행 숨김(기획답변 36차 2, 지연 플레이 방지)
/* 첫 턴 안내 3장(상세 01). AI 대전은 안내 중 선택 타이머 정지(서버 pause), 사람 상대 모드는 정지 없는 말풍선 */
var GUIDE=[['처리 순서','카드는 종류에 따라 정해진 순서로 발동해요. 고른 순서와는 상관없어요.<br><b>0 스펠 · 1 보호(방어·반격·면역) · 2 방해(침묵·방해) · 3 스킬 · 4 공격 · 5 종료</b><br>내가 낸 칸 위 번호가 이 순서예요.','.meslots'],
 ['내기','한 턴에 최대 5칸: 전투카드 3장(에너지 E만큼) + 스펠 1개 + 액티브 1개. 고른 것은 슬롯에서 앞면으로 뒤집히고, 슬롯을 다시 누르면 돌아와요.','.eng'],
 ['상세 보기','카드를 길게 누르면(마우스는 올리면) 효과를 볼 수 있어요.','.hand']];
function guide(manual){var m=S.st;if(!m||m.phase!=='battle'||S.anim)return;var pause=m.mode==='practice',i=0;S.guideOn=true;if(pause)send({type:'pause',on:true});
 var close=function(){var g=$('guide');if(g)g.remove();document.querySelectorAll('.hl').forEach(function(x){x.classList.remove('hl')});S.guideOn=false;S.guideShow=null;S.forceGuide=false;if(pause)send({type:'pause',on:false});document.removeEventListener('keydown',key,true)};
 var key=function(e){if(e.code==='Space'||e.key==='Enter'){e.preventDefault();e.stopPropagation();next()}else if(e.key==='Escape')close()};
 var show=function(){var g=$('guide');if(!g){g=document.createElement('div');g.id='guide';($('stg')||$('bt')).appendChild(g)}g.className='guide'+(pause?'':' bubble');var x=GUIDE[i];
  document.querySelectorAll('.hl').forEach(function(y){y.classList.remove('hl')});var t=document.querySelector(x[2]);if(t)t.classList.add('hl');
  g.innerHTML='<div class="gc"><h4>'+(i+1)+'/3 · '+x[0]+'</h4><p>'+x[1]+'</p><div class="row"><button id="gskip" class="sm">건너뛰기</button><span class="small mu">'+(pause?'안내 중에는 시간이 멈춰요':'시간은 계속 흘러요')+'</span><button class="pri sm" id="gnext">'+(i<2?'다음 (Space)':'시작')+'</button></div></div>';
  $('gnext').onclick=function(e){e.stopPropagation();next()};$('gskip').onclick=function(e){e.stopPropagation();close()}};
 var next=function(){i++;if(i>=GUIDE.length)return close();show()};
 S.guideShow=show;document.addEventListener('keydown',key,true);show()}
function pickCard(uid){var m=S.st,b=m.battle,me=b.me;if(me.mySubmission)return;var c=me.hand.find(function(x){return x.uid===uid});if(!c)return;
 var i=S.sel.cards.indexOf(uid);if(i>=0){S.sel.cards.splice(i,1);sfx('flip');return render()}
 if(c.sealed)return toast('봉인된 카드예요');
 if(S.sel.cards.length>=(b.rules.cards_per_turn_max||3))return toast('전투카드는 한 턴에 3장까지(스펠·액티브는 따로 1개씩)');
 if(sumCost(me,S.sel.cards.concat([uid]))>me.energy){vib(30);return toast('에너지가 부족해요')}
 S.sel.cards.push(uid);sfx('place');render()}
function submitTurn(force){var m=S.st;if(!m||m.phase!=='battle'||m.battle.me.mySubmission||S.anim||S.guideOn||document.querySelector('.dlg'))return;
 if(!force&&!S.sel.cards.length&&m.battle.me.energy>0)return ask('아무것도 내지 않고 확정할까요?','확정',function(){submitTurn(true)});
 send({type:'act',turn:m.battle.turn,cards:S.sel.cards,spell:S.sel.spell,active:S.sel.active});var ok=$('ok');if(ok){busy(ok,'확정 중…')}}

/* ---------- 카드 상세(호버 0.2초 / 길게 누르기 0.35초, 상세 01) ---------- */
function peekHide(){var o=$('peek');if(o)o.remove()}
function peekShow(id){peekHide();if(battleOn())return cardModal(id);var k=card(id),p=phOf(id),w=Math.floor(Math.min(300,innerHeight*0.42*5/7,innerWidth*0.62)),d=document.createElement('div');d.id='peek';d.className='peek';
 d.innerHTML=bcCard(id,{w:w,mode:w>=257?'detail':'hand'})+'<div class="pinfo" style="width:'+Math.max(w,260)+'px"><b>'+esc(k.name)+'</b><div class="mu small">'+esc(KIND_KO[k.kind]||k.kind)+' · 비용 '+k.cost+' · 처리 단계 '+phLab(id)+(k.owner_character?' · '+esc(ch(k.owner_character).name)+' 전용':'')+'</div><p>'+esc(k.effect_text)+'</p><div class="aff">'+(AFF[k.kind]||'')+'</div></div>';document.body.appendChild(d)}
var PK={t:0,lp:false,key:null};
function cardModal(id){var k=card(id),H=innerHeight,cw=Math.round(Math.min(H*0.74*5/7,innerWidth*0.34)),d=document.createElement('div');d.id='peek';d.className='cdm bt4';d.style.setProperty('--k',Math.min(innerWidth/788,H/360).toFixed(4));
 d.innerHTML='<div class="cdw"><div class="cdl">'+bcCard(id,{w:cw,mode:'hand',face:true,fig:true})+'</div><div class="cdr"><small>'+esc((KIND_KO[k.kind]||k.kind)+' · 비용 E'+k.cost+' · 처리 단계 '+phLab(id)+(k.owner_character?' · '+ch(k.owner_character).name+' 전용':''))+'</small><b>'+esc(k.name)+'</b><p>'+esc(k.effect_text||'')+'</p><div class="aff">'+(AFF[k.kind]||'')+'</div></div></div><div class="cdx">화면을 누르면 닫혀요</div>';
 d.onclick=function(){peekHide()};document.body.appendChild(d)}
/* 카드 상세·한 줄 설명: 호버 0.2초 / 길게 누르기 0.35초. 다시 그려져도 같은 대상이면 닫지 않음(효과연출 5: 누르는 동안 계속 표시) */
function stModal(el){var L;try{L=JSON.parse(el.dataset.st)}catch(e){return}if(!L||!L.length)return;peekHide();var H=innerHeight,d=document.createElement('div');d.id='peek';d.className='cdm bt4 stm';d.style.setProperty('--k',Math.min(innerWidth/788,H/360).toFixed(4));
 var ic=function(x,c){return '<i class="sti'+(c||'')+'" style="--bc:'+x.c+(x.u?';background-image:url('+x.u+')':'')+'">'+(x.u?'':esc(x.c1))+'</i>'};
 d.innerHTML='<div class="cdw"><div class="cdl">'+ic(L[0],' big')+'</div><div class="cdr">'+L.map(function(x,i){return '<div class="stb">'+(L.length>1?ic(x):'')+'<div><small>'+esc((x.w==='me'?'나':'상대')+' · 상태'+(x.p?' · '+x.p:''))+'</small><b>'+esc(x.n)+'</b><p>'+esc(x.d||'설명 준비 중')+'</p></div></div>'}).join('')+'</div></div><div class="cdx">화면을 누르면 닫혀요</div>';
 d.onclick=function(){peekHide()};document.body.appendChild(d)}
function tipHide(){var o=$('tip');if(o)o.remove()}
function tipShow(el){tipHide();var t=document.createElement('div');t.id='tip';t.className='tip';t.textContent=el.dataset.tip;document.body.appendChild(t);
 var r=el.getBoundingClientRect(),w=t.offsetWidth,h=t.offsetHeight,m=12,x=Math.min(innerWidth-w-m,Math.max(m,r.left+r.width/2-w/2)),y=r.top-h-6;if(y<m)y=r.bottom+6;if(y+h>innerHeight-m)y=Math.max(m,innerHeight-h-m);t.style.left=x+'px';t.style.top=y+'px'}
function infoEl(e){return e.target.closest&&e.target.closest('[data-cid],[data-tip]')}
function infoKey(el){return el?(el.dataset.cid||'')+'|'+(el.dataset.tip||'')+'|'+(el.dataset.uid||el.id||el.dataset.bi||''):null}
function infoShow(el){if(el.dataset.cid){if(S.wide&&$('wdet')&&S.st&&S.st.phase==='battle')wdetCard(el.dataset.cid);else peekShow(el.dataset.cid)}else tipShow(el)}
function infoHide(){peekHide();tipHide()}
document.addEventListener('pointerover',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;if($('peek')&&$('peek').classList.contains('cdm'))return;var el=infoEl(e),k=infoKey(el);if(k===PK.key)return;if(el&&el.dataset.cid&&battleOn()){PK.key=k;clearTimeout(PK.t);tipHide();return}PK.key=k;clearTimeout(PK.t);infoHide();if(el)PK.t=setTimeout(function(){if(document.body.contains(el))infoShow(el)},200)});
/* 터치: 길게 누르기 0.35초 = 상세. 손가락이 8pt 넘게 움직이면(스와이프) 상세를 띄우지 않는다.
   스펠·덱 화면의 덱 카드는 짧게 탭해도 상세(스와이프는 무시). 상세는 다음 탭에서 닫힘 */
document.addEventListener('pointerdown',function(e){if(!e.pointerType)return;var el=infoEl(e);if(e.pointerType==='mouse'&&!(el&&el.dataset.cid&&battleOn()))return;PK.lp=false;PK.mv=false;PK.x=e.clientX;PK.y=e.clientY;PK.at=Date.now();PK.el2=el;clearTimeout(PK.t);if(!el)return;
 PK.t=setTimeout(function(){if(PK.mv)return;PK.lp=true;if(el.dataset.st&&battleOn())stModal(el);else infoShow(el);vib(10)},350)});
document.addEventListener('pointermove',function(e){if(!e.pointerType||e.pointerType==='mouse'||PK.mv)return;if(Math.abs(e.clientX-PK.x)>8||Math.abs(e.clientY-PK.y)>8){PK.mv=true;clearTimeout(PK.t);if(PK.lp){PK.lp=false;infoHide()}}},{passive:true});
['pointerup','pointercancel'].forEach(function(n){document.addEventListener(n,function(e){if(!e.pointerType)return;clearTimeout(PK.t);if(e.pointerType==='mouse')return;
 if(n==='pointerup'&&!PK.mv&&!PK.lp&&PK.el2&&PK.el2.closest('.deck2')&&Date.now()-PK.at<350){PK.tap=true;infoShow(PK.el2);return}  // 덱 카드: 탭 = 상세
 if(PK.lp&&!($('peek')&&$('peek').classList.contains('cdm')))setTimeout(infoHide,1200)})});
document.addEventListener('click',function(e){if(PK.lp){PK.lp=false;e.stopPropagation();e.preventDefault();return}
 if(PK.tap){PK.tap=false;e.stopPropagation();return}  // 방금 탭으로 연 덱 카드 상세는 이 클릭으로 닫지 않음
 if(PK.mv){PK.mv=false}
 var stb=e.target.closest&&e.target.closest('[data-st]');if(stb&&battleOn()){e.stopPropagation();tipHide();stModal(stb);return}  /* 상태 아이콘 탭 = 카드 상세와 같은 모양(사용자 요청 2026-11-06) */
 var cb=e.target.closest&&e.target.closest('[data-calc]');if(cb){e.stopPropagation();calcShow(cb.dataset.calc);return}
 if(!e.target.closest('[data-cid]')){infoHide();PK.key=null}
 if(S.anim&&e.target.closest('#bt')&&!e.target.closest('#spd,#logline,#menu,#logb,#emo,.emp4,.ib4,.vc.pf,[data-cid],[data-tip],.log,.menu,.pop')){if(S.anim.waiting)S.anim.next();else S.anim.skip()}},true);
/* 피해 계산 내역(효과연출 9): 공격력×계수×배율×방어 경감×치명×폭주×받는 배율 − 실드 */
function calcShow(js){var c;try{c=JSON.parse(js)}catch(e){return}var f=function(n){return Math.round(n*100)/100};
 var rows=[['공격력',c.atk],['계수','×'+c.coef],['버프·약화 배율','×'+f(c.mult)],['방어 경감','×'+f(c.def)+' (100/(100+DEF))'],['치명',c.crit>1?'×'+f(c.crit):'없음'],['폭주',c.rush>1?'×'+f(c.rush):'없음'],['받는 피해 배율',c.recv!==1?'×'+f(c.recv):'없음']].concat(c.g&&c.g!==1?[['전역 피해 배율','×'+f(c.g)]]:[]).concat([['계산 피해',c.pre],['실드 흡수',c.abs||0],['HP 피해',c.v]]);
 var d=document.createElement('div');d.className='dlg';d.innerHTML='<div><b>피해 계산 내역</b><table class="calc">'+rows.map(function(r){return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>'}).join('')+'</table><button class="pri" id="cOk">닫기</button></div>';document.body.appendChild(d);d.querySelector('#cOk').onclick=function(){d.remove()}}

/* ---------- 효과 자막(기획지시 전투가독성 3): "누구 · 카드 이름: 결과" ---------- */
function cn(id){return '<span class="cn" data-cid="'+id+'">'+esc(card(id).name)+'</span>'}
function groupsOf(L,you){var G=[],cur=null,end=false,last=null,nw=function(o){o.ev=[];G.push(o);cur=o;return o};
 (L||[]).forEach(function(e){switch(e.t){
  case 'turn':return;case 'reveal':if(e.auto)nw({k:'auto',seat:e.seat,ph:0});cur=null;return;
  case 'phase':end=true;cur=null;return;
  case 'spell':nw({k:'spell',seat:e.seat,id:e.id,ph:0,bad:e.void?'스펠 무효: 상대 스펠에 막힘':'',lock:e.void?'VOID':''});return;
  case 'card':nw({k:'card',seat:e.seat,id:e.id,ph:e.phase});return;
  case 'active':nw({k:'active',seat:e.seat,ph:3,bad:e.void?'침묵: 액티브 무효':'',lock:e.void?'SILENCED':''});return;
  case 'countered':nw({k:'counter',seat:1-e.seat,id:e.by,victim:e.card,ph:4});return;
  case 'void':nw({k:'void',seat:e.seat,id:e.card,ph:phOf(e.card),bad:({energy:'에너지 부족',silence:'침묵'}[e.why]||e.why)+': 이 카드는 무효',lock:({energy:'NO ENERGY',silence:'SILENCED'}[e.why]||'VOID')});cur=null;return;
  case 'rush':nw({k:'rush',ph:5});cur=null;return;
  case 'skip':nw({k:'skip',ph:5,phases:e.phases||[],cards:e.cards||[]});cur=null;return;
  case 'end':nw({k:'end',ph:5,reason:e.reason,koBoth:!!e.koBoth});cur=null;return;
  case 'crit':if(last)last.crit=true;return}
  if(e.t==='dmg')last=e;
  if(end||!cur){nw({k:'tick',seat:e.seat,ph:end?5:(cur?cur.ph:5)});cur.ev.push(e);if(end)cur=null;return}
  cur.ev.push(e)});
 return G}
function capOf(g,you,ob){var who=g.seat==null?'':(g.seat===you?'나':'상대'),chr=g.seat==null?null:(g.seat===you?ob.me.char:ob.opp.char),res=[],dm=0,ab=0,crit=false,guard=false,heal=0,sh=0,self=0,deb=[],blk=[],misc=[];
 g.ev.forEach(function(e){if(e.t==='dmg'){if(e.guard)guard=true;dm+=e.v;ab+=e.absorbed||0;if(e.crit)crit=true}else if(e.t==='heal')heal+=e.v;else if(e.t==='shield')sh+=e.v;else if(e.t==='selfcost')self+=e.v;
  else if(e.t==='debuff')deb.push((ST[e.debuff]||[e.debuff])[0]);else if(e.t==='blocked')blk.push((ST[e.debuff]||[e.debuff])[0]);else if(e.t==='rewind')misc.push('HP '+e.to+'로 되돌림');else if(e.t==='draw')misc.push('카드 '+e.n+'장 드로우');else if(e.t==='gauge')misc.push('게이지 '+(e.v>0?'+':'')+e.v);else if(e.t==='burnout')misc.push(card(e.card).name+' 손패 초과로 소멸')});
 if(dm||ab)res.push((crit?'치명! ':'')+(g.k==='counter'?'반격 ':'')+'피해 '+dm+(ab?' (실드 흡수 '+ab+')':''));if(guard)res.push('수호로 피해 0');
 if(sh)res.push('실드 +'+sh);if(heal)res.push('회복 '+heal);if(self)res.push('HP 소모 '+self);if(deb.length)res.push(deb.join('·')+' 부여');if(blk.length)res.push(blk.join('·')+' 면역으로 막힘');res=res.concat(misc);
 var head,fx='';
 switch(g.k){case 'card':head=cn(g.id);fx=card(g.id).effect_text;break;case 'counter':head=cn(g.id);res.unshift('상대 '+card(g.victim).name+' 무효');break;
  case 'spell':head='스펠 '+esc(sname(g.id));fx=(S.data.spells[g.id]||{}).effect_text;break;case 'active':head='액티브 '+esc(ch(chr).active_name||'');fx=ch(chr).active_text;break;
  case 'void':head=cn(g.id);break;case 'auto':head='시간 초과';res=['아무것도 내지 않음'];break;case 'rush':return {html:'★ 폭주 시작: 이번 턴부터 피해 증가·회복 감소',text:'★ 폭주 시작'};
  case 'skip':return {html:'■ K.O. · 처리하지 않은 단계: '+(g.phases.map(function(n){return n+' '+PH[n]}).join(' · ')||'없음')+(g.cards.length?' (안 나간 카드: '+g.cards.map(function(c){return (c.seat===you?'나':'상대')+' '+esc(card(c.id).name)}).join(', ')+')':''),text:'■ K.O.'};
  case 'end':return {html:'■ 종료 · '+esc(g.koBoth?'동시 쓰러짐 · 준 피해로 판정':(REASON[g.reason]||g.reason)),text:'■ 종료'};
  default:head=g.ev.some(function(e){return e.src==='burn'})?'작열':g.ev.some(function(e){return e.t==='heal'})&&chr==='SE'?esc(ch(chr).passive_name||'재생'):g.ev.some(function(e){return e.t==='burnout'})?'손패':'효과'}
 var body=g.bad||(res.length?res.join(', '):esc(fx||''));
 var calcs=g.ev.filter(function(e){return e.t==='dmg'&&e.calc}).map(function(e){return '<button class="calcb" data-calc="'+esc(JSON.stringify(Object.assign({},e.calc,{v:e.v,abs:e.absorbed||0})))+'">내역</button>'}).join('');
 return {html:'<i class="kd" style="background:'+KCOL[kindOf(g)]+'"></i>'+(who?who+' · ':'')+head+': '+body+calcs,dmg:dm}}
/* 전투 로그: 턴 탭(1~10) + 페이지 넘김(스크롤 없음, 기획지시 전투화면정리 5) */
function logHtml(){var T=S.hlog||{},turns=Object.keys(T).map(Number).sort(function(a,b){return a-b});if(!turns.length)return '<div class="mu">아직 기록이 없어요</div>';
 var t=T[S.logTab]?S.logTab:turns[turns.length-1],lines=T[t]||[],IH=S.L4&&$('stg')?S.L4.Hd:VH(),per=Math.max(3,Math.floor((IH-(IH<=500?48:56)-10-20-(IH<=500?56:62)-30)/20)),pages=Math.max(1,Math.ceil(lines.length/per)),pg=Math.min(S.logPage||0,pages-1),mx=(S.st&&S.st.battle&&S.st.battle.rules.max_turn)||10,tabs='';
 for(var n=1;n<=mx;n++)tabs+='<button data-lt="'+n+'" class="'+(n===t?'on':'')+'"'+(T[n]?'':' disabled')+'>'+n+'</button>';
 return '<div class="ltabs">'+tabs+'</div><div class="lbody">'+(lines.slice(pg*per,(pg+1)*per).map(function(x){return '<div>'+x+'</div>'}).join('')||'<div class="mu">행동 없음</div>')+'</div><div class="lnav"><button id="lprev"'+(pg<=0?' disabled':'')+'>이전</button><span class="small mu">'+t+'턴 · '+(pg+1)+'/'+pages+'</span><button id="lnext"'+(pg>=pages-1?' disabled':'')+'>다음</button></div>'}
function bindLog(){document.querySelectorAll('[data-lt]').forEach(function(b){b.onclick=function(){S.logTab=Number(b.dataset.lt);S.logPage=0;refreshLog()}});
 if($('lprev'))$('lprev').onclick=function(){S.logPage=Math.max(0,(S.logPage||0)-1);refreshLog()};if($('lnext'))$('lnext').onclick=function(){S.logPage=(S.logPage||0)+1;refreshLog()}}
function refreshLog(){var wl=$('wlog');if(wl){wl.innerHTML=logHtml();bindLog();return}var p=$('logp');if(!S.showLog){if(p)p.remove();return}if(!p){p=document.createElement('div');p.id='logp';p.className='log';if(!$('bt'))return;($('stg')||$('bt')).appendChild(p)}p.innerHTML=logHtml()+($('stg')?'<button class="lcl" id="lclose">닫기</button>':'');bindLog();if($('lclose'))$('lclose').onclick=function(){S.showLog=false;refreshLog();var lb=$('logb');if(lb)lb.classList.remove('on')}}

/* ---------- 공개 연출(기획지시 효과연출): 행동마다 ① 가운데 확대 0.5초 ② 슬롯 → 대상 프로필 빛 0.4초 ③ 프로필 결과 0.3초.
   행동 7개 이상이면 확대 생략(행동당 약 0.6초). 턴당 상한 10초(총괄 6장), 2배속은 절반. 끝나거나 건너뛰면 서버에 revealed → 양쪽 다 끝나면 바로 다음 선택 ---------- */
function firstKey(){return 'play_first_'+(lsGet('play_dev')||'')}
function revealCells(e){var a=e.cards.map(function(id){return {k:card(id).kind,id:id,ord:phOf(id)}});if(e.spell)a.push({k:'spell',id:e.spell,ord:-1});if(e.active)a.push({k:'active',id:'',ord:3.5});return sortCells(a)}
function kindOf(g){return g.k==='card'||g.k==='void'?card(g.id).kind:g.k==='counter'?'counter':g.k==='spell'?'spell':g.k==='active'?'active':'tick'}
function summaryOf(G,you){var who=function(s){return s===you?'내':'상대'},c=G.find(function(g){return g.k==='counter'});
 if(c)return josa(who(c.seat)+' '+card(c.id).name,'이','가')+' '+josa(who(1-c.seat)+' '+card(c.victim).name,'을','를')+' 막았어요';
 var v=G.find(function(g){return g.k==='void'&&g.bad.indexOf('침묵')>=0});if(v)return josa(who(v.seat)+' '+card(v.id).name,'이','가')+' 침묵에 막혔어요';
 var gd=G.find(function(g){return g.ev.some(function(e){return e.guard})});if(gd){var gs=gd.ev.find(function(e){return e.guard}).seat;return who(gs)+' 수호가 피해를 막았어요'}
 var dealt=0,taken=0,blk=0;G.forEach(function(g){g.ev.forEach(function(e){if(e.t==='dmg'){if(e.seat===you){taken+=e.v;blk+=e.absorbed||0}else dealt+=e.v}})});
 if(!dealt&&!taken)return blk?'실드가 피해를 모두 막았어요':'서로 피해 없이 넘어갔어요';
 return '이번 턴 준 피해 '+dealt+' · 받은 피해 '+taken+(blk?' (실드로 '+blk+' 막음)':'')}
function play(ob,log,next){skPrevStop();var you=next.you,side=function(s){return s===you?'me':'opp'};
 var rv={me:[],opp:[]};(log||[]).forEach(function(e){if(e.t==='reveal')rv[side(e.seat)]=revealCells(e)});
 var fake=JSON.parse(JSON.stringify(S.st));fake.phase='battle';fake.battle=JSON.parse(JSON.stringify(ob));var gone=(ob.me.mySubmission&&ob.me.mySubmission.cards)||(S.selTurn===ob.turn?S.sel.cards.slice():[]);fake.battle.me.hand=fake.battle.me.hand.filter(function(c){return gone.indexOf(c.uid)<0});fake.battle.me.mySubmission=null;fake.battle.opp.submitted=false;fake.reveal=null;
 var keep=S.st;S.st=fake;renderBattle(fake,rv);S.st=keep;
 var G=groupsOf(log,you),hp={me:ob.me.hp,opp:ob.opp.hp},sh={me:ob.me.shield,opp:ob.opp.shield},mx={me:ob.me.maxHp,opp:ob.opp.maxHp},used={me:{},opp:{}};
 var caps=G.map(function(g){return capOf(g,you,ob)}),sum=summaryOf(G,you);
 S.hlog=S.hlog||{};S.hlog[ob.turn]=caps.map(function(c){return c.html}).concat(['<span class="sumL">요약 · '+esc(sum)+'</span>']);S.logTab=ob.turn;S.logPage=0;if(S.showLog)refreshLog();
 S.oppRecent=(S.oppRecent||[]).filter(function(r){return r.turn!==ob.turn}).concat([{turn:ob.turn,ids:rv.opp.filter(function(x){return x.k!=='spell'&&x.k!=='active'}).map(function(x){return x.id})}]).slice(-3);
 // 시간(기획지시 전투UI개편 2): 확대 기본 2초(글자 수 따라 최대 3초, 행동 7개 이상이면 1초) + 이동 0.4 + 도착 0.3, 상한 reveal_max_sec(20초 가안), 속도 느리게/보통/빠르게
 var R=(next.battle&&next.battle.rules)||ob.rules||{},zb=(R.reveal_zoom_sec||2)*1000,cap=(R.reveal_max_sec||20)*1000,capAt=Date.now()+cap;
 var acts=G.filter(function(g){return g.k!=='end'&&g.k!=='skip'}),big=acts.filter(function(g){return g.k!=='tick'&&g.k!=='rush'&&g.k!=='auto'}).length<7,spd=spk;
 var ztext=function(g){return g.k==='spell'?((S.data.spells[g.id]||{}).effect_text||''):g.k==='active'?(ch(g.seat===you?ob.me.char:ob.opp.char).active_text||''):g.id?(card(g.id).effect_text||''):''};
 var zt=function(g){return g.k==='tick'||g.k==='rush'||g.k==='auto'?0:g.k==='active'?2000:big?Math.min(3000,zb+Math.max(0,Array.from(ztext(g)).length-20)*50):1000};
 var per=function(g){return g.k==='rush'?900:g.k==='tick'||g.k==='auto'?600:zt(g)+700},tot=400+acts.reduce(function(a,g){return a+per(g)},0)+(acts.length?0:1500),k=Math.min(1,cap/tot);
 // 처리 순서 막대(효과연출 3): 지금 행동은 빛나고 끝난 건 흐리게, 내/상대 테두리 구분, 최대 10개
 /* 가운데 처리 순서 줄은 제거(기획지시 2026-11-06 처리순서줄제거) — #phc가 없으면 아래는 건너뜀 */var bar=acts.filter(function(g){return g.k!=='rush'&&g.k!=='auto'}).slice(0,10),phc=$('phc');
 if(phc){phc.className='obar';phc.innerHTML=bar.map(function(g,i){var kd=kindOf(g),sd=g.seat==null?'':side(g.seat),ic=null;
  return '<i data-bi="'+G.indexOf(g)+'" class="'+sd+'" style="background:'+(ic?'url('+ic.url+') center/80% no-repeat,':'')+KCOL[kd]+'" data-tip="'+esc((sd==='me'?'나':sd?'상대':'')+' · '+(g.k==='card'||g.k==='void'||g.k==='counter'?card(g.id).name:g.k==='spell'?'스펠 '+sname(g.id):g.k==='active'?'액티브':'턴 끝')+' ('+g.ph+' '+PH[g.ph]+')')+'">'+(ic?'':KSH[kd])+'<sub>'+g.ph+'</sub></i>'}).join('')}
 var cellOf=function(sd,g,mark){var arr=rv[sd],kd=g.k==='active'?'active':g.k==='spell'?'spell':null;for(var i=0;i<arr.length;i++){var x=arr[i];if((kd?x.k===kd:x.id===g.id)&&!(mark&&used[sd][i])){if(mark)used[sd][i]=1;return $('rv_'+sd+i)}}return null};
 var face=function(sd){return $('side_'+sd)};
 var firsts=(function(){try{return JSON.parse(lsGet(firstKey())||'{}')}catch(e){return {}}})();
 var steps=[{d:1000,f:function(){clash()}}],lit=null,tm=null,done=false,i=0,koPh=null;
 var applyEv=function(e){var t=side(e.seat);
  if(e.t==='dmg'){if(e.absorbed){sh[t]=Math.max(0,sh[t]-e.absorbed);float(t,'-'+e.absorbed,'abs')}if(e.guard)float(t,'WARD 0','abs');else if(e.v||!e.absorbed){hp[t]=Math.max(0,hp[t]-e.v);float(t,e.src==='burn'?'BURN '+e.v:'-'+e.v,e.crit?'crit':e.src==='burn'?'burn':'');if(e.v>0){hurt(t,!!e.crit||e.v>=mx[t]*0.1);sfx(e.crit?'crit':'hit')}}if(e.crit)vib(40)}
  else if(e.t==='heal'){hp[t]=Math.min(mx[t],hp[t]+e.v);float(t,'HEAL +'+e.v,'heal');sfx('heal')}else if(e.t==='shield'){sh[t]+=e.v;float(t,'SHIELD +'+e.v,'abs')}
  else if(e.t==='selfcost'){hp[t]=Math.max(0,hp[t]-e.v);float(t,'-'+e.v,'burn')}else if(e.t==='rewind'){hp[t]=e.to;float(t,'↺ '+e.to,'heal')}
  else if(e.t==='debuff')float(t,(ST[e.debuff]||[])[1]||(ST[e.debuff]||[e.debuff])[0],'abs');else if(e.t==='blocked')float(t,'IMMUNE','abs');else if(e.t==='draw'){float(t,'DRAW +'+e.n,'heal');sfx('draw')}else if(e.t==='gauge')float(t,'GAUGE '+(e.v>0?'+':'')+e.v,'abs');
  bars(t,hp,sh,mx)};
 acts.forEach(function(g){var gi=G.indexOf(g),sd=g.seat==null?null:side(g.seat),kd=kindOf(g),col=KCOL[kd],D=per(g)*k;
  var tgt=(function(){var e=g.ev.find(function(x){return x.t==='dmg'||x.t==='debuff'||x.t==='blocked'});if(e)return side(e.seat);if(g.ev.length)return side(g.ev[0].seat);return kd==='attack'||kd==='silence'||kd==='disrupt'?(sd==='me'?'opp':'me'):sd})();
  var zoomD=zt(g)*k,flyD=(D-zoomD)*0.57,arrD=D-zoomD-flyD;
  steps.push({gph:g.ph,d:zoomD,f:function(){
   var bi=document.querySelector('.obar [data-bi="'+gi+'"]');document.querySelectorAll('.obar i.now').forEach(function(x){x.classList.remove('now');x.classList.add('past')});if(bi)bi.classList.add('now');
   document.querySelectorAll('.chips .chip').forEach(function(c){c.classList.toggle('on',Number(c.dataset.ph)===g.ph)});phChip(g.ph);document.querySelectorAll('.kp[data-k]').forEach(function(c){c.classList.toggle('now',c.dataset.k===kd)});
   if(lit){lit.classList.remove('lit');lit.classList.add('done')}lit=sd?cellOf(sd,g,true):null;if(g.k==='counter'){lit=cellOf(sd,{k:'card',id:g.id},false)}if(lit){lit.classList.remove('done');lit.classList.add('lit');lit.style.setProperty('--kc',col)}if(g.lock&&lit)lockCell(lit,g.lock);if(lit&&g.ev.some(function(e){return e.t==='blocked'}))stamp(lit,'IMMUNE')
   bubble(lit||(sd?face(sd):null),sd,caps[gi].html,col,!!g.bad);logPush(caps[gi].html);
   if(g.k==='rush'){banner('★ 폭주 시작 ★','rush');sfx('rush');landHit(Math.round(1300*spk()))}else{var SK={attack:'attack',defense:'defense',counter:'counter',silence:'silence',immune:'immune',disrupt:'disrupt',skill:'skill',spell:'spell',active:'ult'};if(SK[kd])sfx(g.k==='active'?'ult':SK[kd])}
   var fk=g.k==='active'?'active':kd;if(FIRST[fk]&&!firsts[fk]&&g.k!=='tick'){firsts[fk]=1;lsSet(firstKey(),JSON.stringify(firsts));firstTip(FIRST[fk])}
   if(g.k==='active'&&sd&&zoomD>=500)skillCut(sd==='me'?ob.me.char:ob.opp.char,sd,zoomD);else if(zoomD)zoom(g,sd,kd,col,zoomD,ob,lit)}});
  steps.push({d:flyD,f:function(){
   if(g.k==='counter'){var vEl=cellOf(side(1-g.seat),{k:'card',id:g.victim},false);fly(vEl,face(sd),col,flyD*0.5,false,function(){fly(face(sd),face(side(1-g.seat)),col,flyD*0.5)});lockCell(vEl,'COUNTER')}
   else if(g.k==='void'){fly(lit||face(sd),face(tgt===sd?(sd==='me'?'opp':'me'):tgt),col,flyD,true);}
   else if(kd==='counter'&&g.k==='card'){fly(lit,face(sd),col,flyD);markWait(sd)}
   else if(g.k!=='rush'&&g.k!=='auto')fly(g.k==='tick'?null:lit,face(tgt),col,flyD,!!g.bad)}});
  steps.push({d:arrD,f:function(){g.ev.forEach(applyEv);if(g.ev.length&&tgt)pulse(face(tgt),col);if(koPh==null&&(hp.me<=0||hp.opp<=0))koPh=g.ph}});
  steps.push({wait:1,d:0,f:function(){}})});
 steps.push({d:(acts.length?0:1500)*k,f:function(){document.querySelectorAll('.kp.now').forEach(function(x){x.classList.remove('now')});logPush('<span class="sumL">요약 · '+esc(sum)+'</span>');var bb=$('bub');if(bb)bb.remove();if(!acts.length){var cp=$('cap');if(cp){cp.innerHTML='<span class="sumL">'+esc(sum)+'</span>';cp.className='cap show';cp.style.color=''}}document.querySelectorAll('.obar i.now').forEach(function(x){x.classList.remove('now');x.classList.add('past')})}});
 var finish=function(){if(done)return;done=true;clearTimeout(tm);dimOff();var bk=$('bt');if(bk)bk.classList.remove('koing');document.querySelectorAll('.zoom,.orb,#bub').forEach(function(x){x.remove()});S.anim=null;S.lastOpp=rv.opp;S.lastTurn=ob.turn;var p=S.pending||S.st;S.pending=null;S.st=p;
  if(p&&p.phase==='battle'&&p.battle&&p.battle.turn>ob.turn){S.revSent=p.battle.turn;send({type:'revealed',turn:p.battle.turn})}render()};
 S.anim={skip:finish,adv:function(){if(done)return;clearTimeout(tm);tick()}};$('skip').onclick=finish;$('spd').onclick=function(){S.rspd=SPD_NEXT[S.rspd||'normal'];lsSet('play_rspd',S.rspd);this.textContent=SPD_LAB[S.rspd]};
 // 수동 진행(탭하면 다음 행동): 서버 공개 상한이 지나면 자동으로 이어 감(랭킹전에서 상대를 무한정 기다리게 하지 않음)
 var hint=null,waitOff=function(){S.anim.waiting=false;if(hint){hint.remove();hint=null}};
 S.anim.next=function(){if(!S.anim||!S.anim.waiting)return;waitOff();clearTimeout(tm);tick()};
 var tick=function(){if(done)return;if(i>=steps.length)return finish();var s=steps[i++];
  if(koPh!=null&&((s.gph!=null&&s.gph!==koPh)||i>=steps.length)){S.anim.skip=S.anim.adv=S.anim.next=function(){};S.anim.waiting=false;if(hint){hint.remove();hint=null}if($('skip'))$('skip').onclick=null;koShow(hp);tm=setTimeout(finish,Math.round(1500*spk()));return}  /* K.O. 1.5초(연출속도 적용), 그동안 입력 안 받음(상세 01 전투 종료) */  // HP 0이면 바로 끝(사용자 요청 2026-11-02): 같은 단계(동시 판정)만 마저 보여 주고 나머지 연출은 건너뜀

  if(s.wait){if(S.manual&&manualOk()&&Date.now()<capAt-300){S.anim.waiting=true;hint=document.createElement('div');hint.className='manual';hint.textContent='탭하면 다음 행동 ▶';$('bt').appendChild(hint);tm=setTimeout(function(){waitOff();tick()},capAt-Date.now())}else tick();return}
  try{s.f()}catch(err){}tm=setTimeout(tick,s.d*spd())};tick()}
function spk(){return SPD_K[S.rspd||'normal']||1}
function phChip(ph){var c=document.querySelector('#bt .center');if(!c||ph==null)return;var e=$('phk');if(!e){e=document.createElement('div');e.id='phk';e.className='phk';c.insertBefore(e,c.firstChild)}var tx=ph+' '+PH_EN[ph];if(e.textContent===tx)return;e.textContent=tx;e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop')}
function logPush(html){S.logLines=(S.logLines||[]).concat([html]).slice(-6);var l=$('logline');if(l)l.innerHTML=S.logLines.slice(-2).map(function(x){return '<div>'+x+'</div>'}).join('')}
/* 확대(전투UX2차 1): 낸 슬롯에서 커져 나와 슬롯 쪽으로 돌아감. 가운데 띄우기 폐지. 확대 동안 행동 주체 캐릭터 카드·슬롯 줄만 남기고 어둡게 */
function dimOn(sd){var b=$('bt');if(!b||!sd)return;var d=$('dimv');if(!d){d=document.createElement('div');d.id='dimv';d.className='dimv';($('stg')||b).appendChild(d)}
 b.querySelectorAll('.up').forEach(function(x){x.classList.remove('up')});b.querySelectorAll(sd==='me'?'.mec,.meslots':'.oppc,.opslots').forEach(function(x){x.classList.add('up')})}
function dimOff(){var d=$('dimv');if(d)d.remove();document.querySelectorAll('#bt .up').forEach(function(x){x.classList.remove('up')})}
function zoom(g,sd,kd,col,d,ob,from){var b=$('bt');if(!b)return;var z=document.createElement('div');z.className='zoom';z.style.setProperty('--kc',col);var ms=Math.round(d*spk());
 var w=Math.round(Math.min(120,b.clientHeight*0.28*5/7)),who=sd==='me'?'나':'상대',cardH,title,txt,kl;
 if(g.k==='spell'){title=sname(g.id);kl='스펠';cardH=spellCard(g.id,w);txt=(S.data.spells[g.id]||{}).effect_text||''}
 else if(g.k==='active'){var chr=sd==='me'?ob.me.char:ob.opp.char;title=ch(chr).active_name||'액티브';kl='액티브';cardH=activeCard(chr,w);txt=ch(chr).active_text||''}
 else{var cd=card(g.id);title=cd.name;kl=KIND_KO[cd.kind]||cd.kind;cardH=bcCard(g.id,{w:w,mode:'hand',fig:true});txt=cd.effect_text||''}
 /* 공개 카드 설명: 크기 고정(카드 + 설명 칸 190), 테두리 없음(사용자 요청 2026-11-06) */
 z.innerHTML='<div class="zw zh '+(sd||'')+'" style="height:'+Math.round(w*1.4+20)+'px"><div class="zc">'+cardH+'</div><div class="zx"><div class="zt"><span>'+who+'</span><em>'+esc(kl)+'</em></div><b>'+esc(title)+'</b><p>'+esc(txt)+'</p></div></div>';b.appendChild(z);
 var br={left:0,top:0,width:b.clientWidth,height:b.clientHeight},zr={width:z.offsetWidth,height:z.offsetHeight},src=from||$('side_'+sd)||b,r=src===b?br:lr(src),cx=r.left+r.width/2,bw=(S.wide&&$('wdet'))?lr($('wdet')).left-12:br.width;
 var x=Math.max(8,Math.min(bw-zr.width-8,cx-zr.width/2)),y=sd==='opp'?r.bottom+10:r.top-zr.height-10;y=Math.max(8,Math.min(br.height-zr.height-8,y));
 z.style.left=x+'px';z.style.top=y+'px';var dx=cx-(x+zr.width/2),dy=(r.top+r.height/2)-(y+zr.height/2),s0=Math.max(0.12,Math.min(0.5,r.width/zr.width));
 var at='translate('+dx+'px,'+dy+'px) scale('+s0+')';dimOn(sd);
 var po=Math.min(0.08,140/ms),pc=Math.max(0.92,1-120/ms);z.animate([{transform:at,opacity:.3,easing:'cubic-bezier(.2,1.3,.4,1)'},{transform:'none',opacity:1,offset:po},{transform:'none',opacity:1,offset:pc},{transform:at,opacity:0}],{duration:ms,fill:'both'});  /* 빠르게 커지고(≈0.14초) 설명은 더 오래 */
 setTimeout(function(){z.remove();if(!document.querySelector('.zoom'))dimOff()},ms+40)}
/* 잠금 연출(전투UX2차 2): 무효가 된 카드는 그 카드 차례에 자물쇠 + 흑백, 이후 흐리게 유지 */
function lockCell(el,why){if(!el||el.classList.contains('locked'))return;sfx('void');el.classList.add('locked');var k=document.createElement('div');k.className='lk';k.innerHTML='🔒<small class="ilab">'+esc(why)+'</small>';el.appendChild(k)}
function ctr(el){var r=lr(el);return {x:r.left+r.width/2,y:r.top+r.height/2}}
/* 빛 경로(사선구도 3): 낸 칸 → (반대편이면 가운데 사선 띠를 거쳐) → 대상 카드. 내 카드는 위쪽 30%, 상대 카드는 아래쪽 75% 지점을 겨눠 내 칸·상대 칸 위를 지나지 않게 */
function aimPt(el){var r=lr(el);if(el.classList.contains('vc')){var me=el.id==='side_me';return {x:r.left+r.width/2,y:r.top+r.height*(me?0.3:0.75)}}return {x:r.left+r.width/2,y:r.top+r.height/2}}
function fly(from,to,col,d,breakMid,then){if(!to){then&&then();return}var b=$('bt');if(!b)return;var a=from?ctr(from):{x:b.clientWidth/2,y:b.clientHeight/2},z=aimPt(to),o=document.createElement('div');o.className='orb';o.style.setProperty('--kc',col);
 o.style.left=a.x+'px';o.style.top=a.y+'px';b.appendChild(o);var ms=Math.max(60,Math.round(d*spk()));
 var mid=null,cEl=b.querySelector('.center');if(cEl&&from&&(a.x-b.clientWidth/2)*(z.x-b.clientWidth/2)<0){var cr=lr(cEl);mid={x:cr.left+cr.width/2,y:cr.top+cr.height/2}}
 var T=function(p,sc){return {transform:'translate(calc(-50% + '+(p.x-a.x)+'px),calc(-50% + '+(p.y-a.y)+'px)) scale('+sc+')'}};
 var end=breakMid?{x:a.x+(z.x-a.x)*0.5,y:a.y+(z.y-a.y)*0.5}:z,frames=[{transform:'translate(-50%,-50%) scale(.6)'}];if(mid&&!breakMid)frames.push(Object.assign(T(mid,0.85),{offset:0.5}));frames.push(T(end,1));
 o.animate(frames,{duration:ms,easing:'ease-in'}).onfinish=function(){if(breakMid){o.classList.add('brk');setTimeout(function(){o.remove()},250)}else o.remove();then&&then()}}
function pulse(el,col){if(!el)return;el.style.setProperty('--kc',col);el.classList.remove('hit');void el.offsetWidth;el.classList.add('hit')}
function markWait(sd){var v=$('side_'+sd),f=$('face_'+sd);if(!v&&!f)return;var w=document.createElement('span');w.className='wait';w.textContent='반격 대기';(v||f.parentElement).appendChild(w)}  /* 카드 테두리 위(가려지지 않게) */
/* 효과 자막 = 해당 슬롯 옆 말풍선(사선구도 4-1): 내 칸은 위, 상대 칸은 아래 */
function bubble(el,sd,html,col,bad){var b=$('bt');if(!b)return;var o=$('bub');if(!o){o=document.createElement('div');o.id='bub';b.appendChild(o)}o.className='bub '+(sd||'')+(bad?' bad':'');o.style.setProperty('--kc',col||'#8a90a8');o.innerHTML=html;
 if(!el){o.style.left='50%';o.style.top='50%';o.style.transform='translate(-50%,-50%)';return}var r=lr(el),bw=b.clientWidth,x=r.left+r.width/2,w=o.offsetWidth;x=Math.max(w/2+6,Math.min(bw-w/2-6,x));o.style.left=x+'px';
 var h=o.offsetHeight,bh=b.clientHeight,dn=sd==='opp';if(dn&&r.bottom+6+h>bh-6)dn=false;else if(!dn&&r.top-6-h<6)dn=true;  /* 화면 밖이면 위/아래 뒤집기(기획지시 11-05 4) */
 if(dn){o.style.top=Math.min(bh-h-6,r.bottom+6)+'px';o.style.transform='translateX(-50%)'}else{o.style.top=Math.max(h+6,r.top-6)+'px';o.style.transform='translate(-50%,-100%)'}}
function firstTip(t){var b=$('bt');if(!b)return;var e=document.createElement('div');e.className='first';e.innerHTML='<b>처음 보는 종류</b> '+esc(t);b.appendChild(e);setTimeout(function(){e.remove()},3200)}
function bars(sd,hp,sh,mx){var w=Math.max(0,100*hp[sd]/mx[sd]),sw=Math.min(100-w,100*sh[sd]/mx[sd]);
 $('hp_'+sd).style.width=w+'%';$('gh_'+sd).style.width=w+'%';var s=$('sh_'+sd);s.style.left=w+'%';s.style.width=sw+'%';$('hpt_'+sd).textContent=hp[sd]+'/'+mx[sd];$('sht_'+sd).textContent=sh[sd]?'+'+sh[sd]:''}
/* 프로필 위 효과 글자(사용자 요청 2026-11-02): 프로필(.vc, 잘림 영역) 안이 아니라 전투판 위에 띄워 긴 글자도 잘리지 않게. 크기는 카드 폭 기준 */
function float(sd,txt,cls){var host=$('side_'+sd),b=$('bt');if(!host||!b)return;var r=lr(host),f=document.createElement('div');f.className='float fx '+(cls||'')+(/^([A-Z]+ )?[-+]?\d/.test(txt)?' num':'');f.textContent=txt;f.style.setProperty('--r',(Math.random()*14-7).toFixed(1)+'deg');f.style.setProperty('--x',Math.round(Math.random()*28-14)+'px');
 var n=b.querySelectorAll('.float.fx[data-sd="'+sd+'"]').length,fs=Math.max(22,Math.min(56,Math.round(r.width*(cls==='crit'?0.42:/^[-+]?\d/.test(txt)?0.32:0.24))));if(/[가-힣]/.test(txt))fs=Math.round(fs*0.72);
 f.dataset.sd=sd;f.style.left=(r.left+r.width/2)+'px';f.style.top=(r.top+r.height*0.3+n*fs*1.05)+'px';f.style.fontSize=fs+'px';b.appendChild(f);setTimeout(function(){f.remove()},1800)}
function banner(t,cls){var bt=$('bt');if(!bt)return;var ms=Math.round(1300*spk()),b=document.createElement('div');b.className='banner ib '+(cls||'');b.style.setProperty('--td',ms+'ms');b.innerHTML=(S.rmo?'':'<i class="tsw"></i><i class="ifl"></i>')+'<b>'+esc(t)+'</b>';bt.appendChild(b);setTimeout(function(){b.remove()},ms)}
function stamp(el,t){if(!el)return;var s=document.createElement('div');s.className='stamp ilab';s.textContent=t;el.appendChild(s)}

/* ---------- 결과 ---------- */
/* 결과(재배치 4): 1:1 분할. 왼쪽 50% = 전신 PNG의 카드 영역(3:4)만, 공용 어두운 배경, 폭을 꽉 채우고 위 맞춤(넘치는 아래는 잘림), 아래 35% 마스크. 오른쪽 50% = 데이터 */
function artFill(id,w){var a=((S.A.art||{})[id]||{})['000']||{},src=a.full;if(!src)return '';var f=safe(),k=Math.min(VW()/788,VH()/360),l=Math.max(0,Math.max(60*k,f.l)-f.l);return 'background-image:url('+src.url+');left:'+l.toFixed(1)+'px;top:'+(40*k).toFixed(1)+'px;width:'+(320*k).toFixed(1)+'px;height:'+(569*k).toFixed(1)+'px;right:auto;bottom:auto'}  /* 결과: 전신 PNG(시안 320×569, 사용자 요청 2026-11-06 원래대로) */
function renderResult(m){var rk0=m.code+':'+((m.last&&m.last.id)||'');if(S.resSnd!==rk0){S.resSnd=rk0;var L0=m.last||{},w0=L0.outcome!=='draw'&&L0.outcome!=='void'&&((L0.outcome==='a')===(m.you===0));sfx(L0.outcome==='draw'||L0.outcome==='void'?'turn':w0?'win':'lose')}var L=m.last||{},you=m.you,win=L.outcome!=='draw'&&L.outcome!=='void'&&((L.outcome==='a')===(you===0)),draw=L.outcome==='draw',mine=(L.picks||[])[you];
 var f=safe(),st=(L.stats||[])[you]||{},hp=(L.hp||[])[you]||[0,1],half=Math.floor((VW()-f.l-f.r)/2),stat=function(lab,v){return '<div class="st"><small>'+lab+'</small><b>'+v+'</b></div>'};
 var mode=m.mode,rk=L.rank&&L.rank[you],ec=L.econ&&L.econ[you];
 $('app').innerHTML='<div class="res3'+(win?' win':draw?' draw':' lose')+'"><div class="rl"><div class="rimg" style="'+(mine?artFill(mine,half):'')+'"></div></div>'
  +'<div class="rr"><button class="ib rmenu" id="rmore" title="더보기">⋯</button><h2>'+(draw?'무승부':L.outcome==='void'?'결과 없음':win?'승리':'패배')+'</h2><div class="mu small">'+esc(L.koBoth?'동시 쓰러짐 · 준 피해로 판정':(REASON[L.reason]||L.reason||''))+(mine?' · '+esc(ch(mine).name):'')+'</div>'
  +'<div class="stats">'+stat('판 길이',(L.turn||0)+'턴')+stat('준 피해',st.dealt!=null?st.dealt:'-')+stat('받은 피해',st.taken!=null?st.taken:'-')+stat('실드로 막은 피해',st.blocked!=null?st.blocked:'-')+stat('남은 HP',Math.round(100*hp[0]/hp[1])+'%')+'</div>'
  +'<div class="rew">'+(rk?'<div>RP '+(rk.rpDelta>=0?'+':'')+rk.rpDelta+' → '+rk.rp+'</div>':'')+(ec&&ec.gold?'<div>골드 +'+ec.gold+'</div>':'')+(mode==='practice'?'<div class="mu small">AI 대전은 RP·숙련도 변화가 없어요(총괄 8장)</div>':'')+'</div>'
  +'<div class="row" style="gap:8px"><button id="home">로비</button><button class="pri confirm" id="again">다시 하기 (Enter)</button></div></div></div>';
 $('home').onclick=function(){quit();home()};$('again').onclick=function(){busy(this,'준비 중…');again()};
 $('rmore').onclick=function(){ask('신고 — 상대: '+(m.members[1-you]&&m.members[1-you].ai?'AI (신고 대상 아님)':'상대 플레이어')+'. 정식 신고는 상세 13 사유로 접수돼요(테스트 화면은 접수하지 않음).','닫기',function(){})}}
function again(){quit();var d=localStorage.getItem('play_dev');api('/v1/practice',{difficulty:S.diff,defaults:defs()}).then(function(j){S.st=null;S.load=null;connect(j.code)}).catch(function(){login(d).then(function(){return api('/v1/practice',{difficulty:S.diff,defaults:defs()})}).then(function(j){connect(j.code)}).catch(function(e){home(e.message)})})}

/* ---------- 타이머·홀로·키 ---------- */
setInterval(function(){var m=S.st;if(!m||S.anim)return;var t=m.phase==='battle'?m.deadline:m.phaseDeadline,s=left(t);
 var tm=$('tm');if(tm){tm.textContent=t?s+'초':'';tm.className='timer'+(s<=5?' red':'')}
 var cb=document.querySelector('button[data-lab]');if(cb&&t){var tx=cb.dataset.lab+' ('+s+'초 남음)';if(cb.textContent!==tx)cb.textContent=tx;cb.classList.toggle('red',s<=10);cb.classList.toggle('beat',s<=5&&s>0);if(s<=10)cb.classList.remove('go')}
 if(m.phase==='battle'&&!m.battle.me.mySubmission){if(s<=10&&s>5&&S.warnKey!==m.code+':'+m.battle.turn){S.warnKey=m.code+':'+m.battle.turn;sfx('warn')}if(s<=5&&s>0&&S.vibKey!==m.battle.turn+':'+s){S.vibKey=m.battle.turn+':'+s;vib(40);sfx('tick')}}  /* 확정 버튼 하나로(기획지시 타이머버튼): 10초 빨강, 5초 박동·진동 */
 if(m.phase==='battle'&&m.battle&&!m.battle.result&&t&&s>0){var RB=m.battle.rules||{};if(m.battle.turn>=(RB.rush_start_turn||7)){var gap=(RB.rush_siren_sec||8)*1000,nk=m.code+':'+m.battle.turn;if(S.sirenKey!==nk||Date.now()-S.sirenAt>=gap){S.sirenKey=nk;S.sirenAt=Date.now();sfx('siren')}}}  /* 폭주 사이렌: 선택 단계만, 공개 중(S.anim) 없음(상세 01) */
 var cp=$('cap');if(cp&&m.phase==='battle'&&!m.battle.me.mySubmission){var any=S.sel.cards.length||S.sel.spell||S.sel.active,msg=s<=10?'⏱ 확정 안 하면 이번 턴은 아무것도 안 나가요'+(any?'(고른 것 포함)':''):'';if(cp.textContent!==msg){cp.textContent=msg;cp.className='cap'+(msg?' show warn':'')}}},250);
function holo(){if(S.hraf)return;var t0=performance.now(),step=function(n){var els=document.querySelectorAll('.pvc.h1,.pvc.h2,.pvc.h3,.pvc.h4');if(!els.length){S.hraf=0;return}  /* 홀로 카드만(일반 카드까지 매 프레임 갱신하면 발열) */
 var k=((n-t0)%4200)/4200,x=0.5-0.5*Math.cos(k*Math.PI*2),y=0.5+Math.sin(k*Math.PI*2)*0.15;
 els.forEach(function(c){if(c.hov)return;c.style.setProperty('--mx',0.1+x*0.8);c.style.setProperty('--my',y);c.style.setProperty('--px',(x-0.5)*1.2);c.style.setProperty('--py',(y-0.5)*1.2)});S.hraf=requestAnimationFrame(step)};S.hraf=requestAnimationFrame(step)}
document.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('.pvc');document.querySelectorAll('.pvc').forEach(function(x){if(x!==c)x.hov=false});if(!c)return;var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.hov=true;c.style.setProperty('--mx',x);c.style.setProperty('--my',y);c.style.setProperty('--px',(x-0.5)*2);c.style.setProperty('--py',(y-0.5)*2)});
document.addEventListener('keydown',function(e){var m=S.st;if(!m||e.target.tagName==='INPUT')return;
 if(m.phase==='loadout'&&e.code==='Space'){e.preventDefault();return confirmLoad()}
 if((m.phase==='pick'||m.phase==='ban')&&e.code==='Space'){e.preventDefault();return confirmPick()}
 if(m.phase==='result'&&e.key==='Enter')return again();
 if(m.phase!=='battle'||S.anim)return;var me=m.battle.me;
 if(/^[1-7]$/.test(e.key)){var el=document.querySelector('.hand [data-i="'+(Number(e.key)-1)+'"]');if(el)pickCard(Number(el.dataset.uid))}
 else if(e.key==='q'||e.key==='w'){var ids=Object.keys(me.spells),id=ids[e.key==='q'?0:1];if(id&&!me.mySubmission&&!me.spells[id]){S.sel.spell=S.sel.spell===id?null:id;render()}}
 else if(e.key==='e'){if(me.gauge>=100&&!me.mySubmission){S.sel.active=!S.sel.active;render()}}
 else if(e.code==='Space'){e.preventDefault();submitTurn()}
 else if(e.key==='t')send({type:'timebank'});else if(e.key==='l'){S.showLog=!S.showLog;refreshLog()}});
var rz;addEventListener('resize',function(){clearTimeout(rz);rz=setTimeout(function(){applySafe();applyZoom();if(S.st&&!S.anim)render()},150)});
boot();
</script></body></html>`;
