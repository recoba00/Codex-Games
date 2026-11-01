// 웹 전투 프로토타입(/play, DEV_LOGIN=1 환경 전용). AI 대전 한 판을 픽 → 스펠·덱 → 전투 → 결과까지 해 보는 느낌 확인용.
// 서버 엔진·AI·방(DO)은 실제 것을 그대로 쓰고(POST /v1/practice + 방 WebSocket), 그림은 어드민에 등록한 에셋(/v1/assets)으로 그린다.
// 화면 배치: 상세 01 전투 UI·조작(위 상대 · 가운데 필드 · 아래 나), 카드: 전투카드 구성 규격 가안(기획지시 2026-10-30), 캐릭터 카드: BO 카드 미리보기와 같은 방식.
// 빠진 것: 소리, 다듬은 효과, 컷인, 튜토리얼, 감정표현. 실제 클라이언트는 Godot(총괄 13장).
export const PLAY_PAGE = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>성좌 결투 · 전투 프로토타입</title>
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
.scr{position:absolute;inset:0;display:flex;flex-direction:column;padding:max(10px,var(--st,0px)) max(10px,var(--sr,0px)) max(10px,var(--sb,0px)) max(10px,var(--sl,0px))}
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
.pvwin{position:absolute;left:5%;top:3.571%;width:90%;height:85.714%}.pvchar{background-repeat:no-repeat}
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
.pvfac{position:absolute;left:5%;top:3%;width:15%;aspect-ratio:1;background-size:contain;background-repeat:no-repeat;pointer-events:none;filter:drop-shadow(0 1px 2px #000)}
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
.orb{position:fixed;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#fff 0 20%,var(--kc) 55%,transparent 72%);box-shadow:0 0 16px 6px var(--kc);z-index:36;pointer-events:none;transform:translate(-50%,-50%)}
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
 .scr{padding:max(4px,var(--st,0px)) max(8px,var(--sr,0px)) max(4px,var(--sb,0px)) max(8px,var(--sl,0px))}
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
.lo3b{flex:1;min-height:0;display:grid;grid-template-columns:var(--cw) minmax(0,1fr);gap:var(--g)}
.lcol2{display:flex;flex-direction:column;justify-content:space-between;align-items:center;gap:var(--g)}
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
.rimg{position:absolute;inset:max(8px,var(--st,0px)) 8px 0 8px;background:center bottom/contain no-repeat;filter:drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.res3.lose .rimg{filter:saturate(.35) brightness(.65) drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.rr{position:relative;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:max(16px,var(--st,0px)) max(24px,var(--sr,0px)) max(16px,var(--sb,0px)) 24px}
.rr h2{margin:0;font-size:52px;letter-spacing:6px}.res3.win h2{color:var(--gold);text-shadow:0 0 24px rgba(255,213,107,.5)}.res3.lose h2{color:#c8cbe0}
.rr .rmenu{position:absolute;right:max(12px,var(--sr,0px));top:max(10px,var(--st,0px));width:36px;height:32px;border-radius:9px;border:1px solid var(--line);background:rgba(14,18,36,.8)}
@media (max-height:500px){.pk3 .top,.lo3 .top{margin-bottom:6px;min-height:30px;height:30px}.pbar{margin-top:6px;min-height:40px;height:40px}.pband{height:30px;font-size:10px;line-height:1.45}.rr h2{font-size:36px}.rr{gap:8px}.spb2{padding:4px 2px}.spb2 i{width:24px;height:24px}.spb2 b{font-size:11px}.pnm{font-size:12px}}

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
.bt3 .center{left:38%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
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
.tban{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);z-index:40;pointer-events:none;font-size:clamp(26px,7vh,52px);font-weight:900;color:#fff;letter-spacing:2px;padding:6px 28px;border-radius:14px;background:linear-gradient(90deg,transparent,rgba(30,40,90,.85) 20%,rgba(30,40,90,.85) 80%,transparent);text-shadow:0 2px 6px #000;white-space:nowrap;animation:tb 1.1s ease-out forwards}
@keyframes tb{0%{opacity:0;transform:translate(-50%,-50%) scale(.85)}15%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0}}
.wpanel{position:absolute;display:flex;flex-direction:column;gap:10px;z-index:5}
.wdet{flex:none;max-height:42%;overflow:auto;background:rgba(14,18,36,.9);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.45}
.wdet p{margin:6px 0}.wlog{position:static!important;flex:1;min-height:0;width:auto!important;max-height:none!important;display:flex;flex-direction:column}
.bt3 .vc .float{top:30%;font-size:max(26px,22cqw);animation:fl2 1.6s forwards;z-index:9}.bt3 .vc .float.crit{font-size:max(32px,28cqw)}
@keyframes fl2{0%{transform:translate(-50%,0) scale(.6);opacity:0}10%{transform:translate(-50%,-4px) scale(1.2);opacity:1}20%{transform:translate(-50%,-6px) scale(1)}80%{opacity:1;transform:translate(-50%,-12px)}100%{opacity:0;transform:translate(-50%,-26px)}}
.bt3 .vc{container-type:inline-size}
.bt3 .vbot .hptx{display:flex;flex-wrap:nowrap;justify-content:space-between;gap:2px;font-size:max(9px,10cqw);font-variant-numeric:tabular-nums;letter-spacing:-.2px;overflow:visible}
.bt3 .vbot .hptx span{white-space:nowrap}.bt3 .vbot .nmrow{font-size:max(10px,11cqw)}.bt3 .vbot .nmrow span{white-space:nowrap;overflow:hidden;text-overflow:clip}
.bt3 .vc .float{font-size:min(40px,max(22px,24cqw))}.bt3 .vc .float.crit{font-size:min(48px,max(26px,30cqw))}
</style></head><body><div id="app"></div><div id="rot"><i>📱</i><b>가로로 돌려 주세요</b><span class="mu small">전투 화면은 가로 전용이에요</span></div>
<script>
var S={tok:null,data:null,A:null,ws:null,st:null,prev:null,sel:{cards:[],spell:null,active:false},selTurn:0,diff:localStorage.getItem('play_diff')||'normal',anim:null,pending:null,load:null,off:0,showLog:false,hist:[],spd:localStorage.getItem('play_spd')==='2',lastOpp:null,lastTurn:0,rspd:(function(){try{return localStorage.getItem('play_rspd')||'normal'}catch(e){return 'normal'}})(),manual:(function(){try{return localStorage.getItem('play_manual')==='1'}catch(e){return false}})(),hlog:{},lefty:(function(){try{return localStorage.getItem('play_lefty')==='1'}catch(e){return false}})()};
var KIND_KO={immune:'면역',defense:'방어',counter:'반격',silence:'침묵',disrupt:'방해',skill:'스킬',attack:'공격'};
var KIND_SLOT={immune:'IMMUNE',defense:'DEFENSE',counter:'COUNTER',silence:'SILENCE',disrupt:'DISRUPT',skill:'SKILL',attack:'ATTACK'};
var KIND_ORD={attack:0,defense:1,counter:2,silence:3,disrupt:4,skill:5,immune:6};
var FAC={'불':'FIRE','물':'WATER','바람':'WIND'};
var ST={burn:['작열','BURN'],mark:['표식','MARK'],weak:['약화','WEAKEN'],activeSeal:['액티브 봉인','SILENCE'],skillBlock:['스킬 봉쇄','SKILL_LOCK'],energyDown:['에너지 감소','ENERGY_DOWN'],immune:['면역','IMMUNE'],healBoost:['회복 증가',''],spdUp:['속도 증가',''],inferno:['업화','ATK_UP'],greatTide:['대조류','TIDE'],noCarry:['실드 이월 불가',''],handSeal:['손패 봉인','HAND_SEAL'],tide:['조류','TIDE']};
var ERR={surrender_too_early:'항복은 4턴부터 할 수 있어요',timebank_used:'타임뱅크는 판당 1회예요',turn_mismatch:'이미 지난 턴이에요'};
/* 상성(총괄 6장): 공격 → 면역 → 침묵 → 스킬 → 반격 → 공격, 방어는 원 밖 */
var AFF={attack:'상성: 면역을 뚫고 · 반격에 막혀요',immune:'상성: 침묵을 막고 · 공격은 못 막아요',silence:'상성: 스킬을 끊고 · 면역에 막혀요',skill:'상성: 반격을 헛치게 하고 · 침묵에 막혀요',counter:'상성: 공격을 무효로 하고 · 스킬 앞에선 헛방이에요',defense:'상성 밖: 어느 쪽에도 무난한 안전한 선택',disrupt:'상성 밖: 방해 단계(2)에서 상대를 흔들어요'};
var PH=['스펠','보호','방해','스킬','공격','종료'];
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
function pvCard(id,o){var c=ch(id),a=((S.A.art||{})[id]||{})['000']||{},sl=S.A.slots;
 var bgCss=a.bg==='color'&&a.bgColor?'background:linear-gradient(180deg,'+a.bgColor+',#111)':(sl[a.bgSlot||('CARD_BG_'+(FAC[c.faction]||'NEUTRAL'))]?'background-image:'+slotU(a.bgSlot||('CARD_BG_'+(FAC[c.faction]||'NEUTRAL'))):'background:#334');
 var src=a.bg==='combined'&&a.combined?a.combined:a.full,cr=a.card||{x:0.125,y:0.05,w:0.75,h:0.75*(src?src.w/src.h:0.5625)*4/3},chs='';
 if(src){var bw=100/cr.w,bh=bw*(src.h/src.w)*(720/960);chs='background-image:url('+src.url+');background-size:'+bw.toFixed(2)+'% '+bh.toFixed(2)+'%;background-position:'+(cr.w>=1?0:(cr.x/(1-cr.w)*100)).toFixed(2)+'% '+(cr.h>=1?0:(cr.y/(1-cr.h)*100)).toFixed(2)+'%'}
 var fr=o.tier?sl['FRAME_'+o.tier]:null,bd=o.badge>1?sl['MASTERY_'+o.badge]:null,fc=sl['FACTION_'+FAC[c.faction]];
 return '<div class="pvc h'+(o.holo||0)+(o.cls?' '+o.cls:'')+'" style="--w:'+o.w+'px"'+(o.attr||'')+'><div class="pvb"><div class="pvl pvbg" style="'+bgCss+'"></div><div class="pvl pvhb"></div>'
  +'<div class="pvwin"><div class="pvl pvchar" style="'+chs+'"></div></div><div class="pvl pvhf"></div><div class="pvl pvsp"></div><div class="pvl pvgl"></div>'
  +'<div class="pvl pvname">'+esc(c.name)+(o.sub?'<small>'+esc(o.sub)+'</small>':'')+'</div></div><div class="pvring"></div>'
  +(fc?'<div class="pvfac" style="background-image:url('+fc.url+')"></div>':'')
  +(fr?'<div class="pvframe" style="background-image:url('+fr.url+')"></div>':'')+(bd?'<div class="pvbadge" style="background-image:url('+bd.url+')"></div>':'')+'</div>'}
function bcCard(id,o){var k=card(id),sl=S.A.slots,art=sl['CARD_ART_'+id],lay='',own=k.owner_character;
 if(own){var c=ch(own),a=((S.A.art||{})[own]||{})['000']||{},f=a.full,cr=a.card,fb=slotU('CARD_BG_'+(FAC[c.faction]||'NEUTRAL'));
  lay='<div class="l art" style="'+(fb?'background-image:'+fb:'background:#334')+'"></div>';
  if(f){if(cr){var iw=100/cr.w,ih=iw*(f.h/f.w)*(5/7);lay+='<div class="l" style="background-image:url('+f.url+');background-repeat:no-repeat;background-size:'+iw.toFixed(1)+'% '+ih.toFixed(1)+'%;background-position:'+(cr.w>=1?0:cr.x/(1-cr.w)*100).toFixed(1)+'% '+(cr.h>=1?0:cr.y/(1-cr.h)*100).toFixed(1)+'%"></div>'}else lay+='<div class="l" style="background:url('+f.url+') center 10%/cover no-repeat"></div>'}}
 else if(art)lay='<div class="l art" style="background-image:url('+art.url+')"></div>';
 else lay='<div class="l art" style="'+(sl.CARD_BG_NEUTRAL?'background-image:'+slotU('CARD_BG_NEUTRAL'):'background:linear-gradient(160deg,#3a4058,#1b1f2e)')+'"></div><div class="symt">'+esc(KIND_KO[k.kind]||k.kind)+'</div>';
 var fr=sl.CARD_FRAME,cost=o.cost==null?k.cost:o.cost;  // 유형·비용은 텍스트 뱃지(기획지시 2026-11-01 유형에너지텍스트, KIND_* 아이콘 폐지)
 return '<div class="bc'+(o.mode==='hand'?' hand':'')+(o.face?' face2':'')+(o.cls?' '+o.cls:'')+'" style="--w:'+o.w+'px;width:'+o.w+'px"'+(o.attr||'')+' title="'+esc(k.name+' · '+(KIND_KO[k.kind]||'')+' '+cost+'E\n'+(k.effect_text||''))+'">'+lay+'<div class="l shade"></div>'+(fr?'<div class="l frm" style="background-image:url('+fr.url+')"></div>':'')
  +'<div class="bdc">'+cost+'E</div><div class="bdk" style="background:'+(KCOL[k.kind]||'#8a90a8')+'">'+esc(KIND_KO[k.kind]||k.kind)+'</div>'
  +(own?'<div class="own">전용</div>':'')+'<div class="txt"><div class="nm">'+esc(k.name)+'</div>'+(o.mode==='hand'?(o.face?'<div class="sht">'+esc(shortOf(id))+'</div>':''):'<div class="tx">'+esc(k.effect_text)+'</div>')+'</div>'+(o.extra||'')+'</div>'}
function shortOf(id){var k=card(id),t=k.effect_short||String(k.effect_text||'');return k.effect_short?t:(Array.from(t).length>15?Array.from(t).slice(0,15).join('')+'…':t)}  // 시트 효과_짧게, 없으면 효과 문구 앞 15자(임시)
function backCard(w,extra){return '<div class="bc back" style="--w:'+w+'px;width:'+w+'px;'+(S.A.slots.CARD_BACK?'background-image:'+slotU('CARD_BACK'):'background:linear-gradient(160deg,#2a3a7a,#141a3a)')+'">'+(extra||'')+'</div>'}
function faceCss(id){var a=((S.A.art||{})[id]||{})['000']||{},f=a.full,r=a.faceRect;
 if(f&&r){var s=100/r.w;return 'background-image:url('+f.url+');background-size:'+s.toFixed(1)+'% auto;background-position:'+(r.w>=1?0:r.x/(1-r.w)*100).toFixed(1)+'% '+(r.h>=1?0:r.y/(1-r.h)*100).toFixed(1)+'%'}
 if(a.thumb||f)return 'background-image:url('+(a.thumb||f).url+');background-size:220% auto;background-position:50% 8%';return ''}

/* 안전 영역(노치·카메라 구멍·홈 표시줄, 기획지시 2026-11-01 픽5열안전영역): env() 값을 읽어 CSS 변수 --st/--sr/--sb/--sl와 배치 계산에 같이 쓴다. 시험은 window.__SAFE로 흉내 */
function safe(){if(window.__SAFE)return window.__SAFE;var e=S.safeEl;if(!e){e=document.createElement('div');e.style.cssText='position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.appendChild(e);S.safeEl=e}
 var c=getComputedStyle(e),f=function(x){return parseFloat(x)||0};return {t:f(c.paddingTop),r:f(c.paddingRight),b:f(c.paddingBottom),l:f(c.paddingLeft)}}
function applySafe(){var f=safe(),d=document.documentElement.style;d.setProperty('--st',f.t+'px');d.setProperty('--sr',f.r+'px');d.setProperty('--sb',f.b+'px');d.setProperty('--sl',f.l+'px');return f}
/* ---------- 시작 ---------- */
function boot(){applySafe();
 Promise.all([fetch('/v1/data/live').then(function(r){return r.json()}),fetch('/v1/assets').then(function(r){return r.json()})]).then(function(x){S.data=x[0].data;S.A=x[1].assets||x[1];if(!S.A.slots)S.A={slots:{},art:{}};
  if(S.A.slots.BG_BATTLE)$('app').style.backgroundImage=slotU('BG_BATTLE');home()}).catch(function(e){offline(e)})}
function offline(e){$('app').innerHTML='<div class="scr home"><h1>연결이 필요해요</h1><p class="mu">전투는 항상 온라인이에요. 인터넷에 연결되면 자동으로 다시 시도해요.</p><button class="pri" id="retry">다시 시도</button><p class="small mu">'+esc(e&&e.message||'')+'</p></div>';$('retry').onclick=boot}
addEventListener('online',function(){if(!S.data)boot();netBar()});addEventListener('offline',netBar);
function netBar(){var bad=S.room&&sessionStorage.getItem('play_room')&&(!S.ws||S.ws.readyState!==1),off=!navigator.onLine,el=$('net');
 if(bad){S.badAt=S.badAt||Date.now();bad=Date.now()-S.badAt>2000}else S.badAt=0;
 if(!bad&&!(off&&S.data)){if(el)el.remove();return}if(!el){el=document.createElement('div');el.id='net';document.body.appendChild(el)}
 el.className=off?'off':'';el.innerHTML=off?'<b>연결이 필요해요</b><span class="small mu">다시 연결되면 지금 판으로 이어져요(재접속 유예 60초)</span>':'연결이 불안정해요 · 다시 연결 중…'}
setInterval(netBar,1000);
function home(msg){S.st=null;S.prev=null;wake(false);var dev=localStorage.getItem('play_dev')||'',P=window.PWA||{};
 $('app').innerHTML='<div class="scr home"><h1>성좌 결투</h1><div class="mu">전투 프로토타입 · AI 대전</div>'
 +'<div class="row" style="justify-content:center">'+[['easy','쉬움'],['normal','보통'],['hard','어려움']].map(function(d){return '<button data-d="'+d[0]+'" class="'+(S.diff===d[0]?'on':'')+'">'+d[1]+'</button>'}).join('')+'</div>'
 +'<button class="pri" id="go" style="font-size:18px;padding:12px 40px">AI 대전 시작</button>'
 +'<div class="small mu">테스트 계정 <input id="dev" value="'+esc(dev)+'" placeholder="아이디 (예: kim01)" autocapitalize="off" autocomplete="off"> <br>/dev에서 쓰던 아이디를 넣으면 그 계정 티어 프레임·숙련도로 보여요(그 계정의 다른 창은 로그아웃돼요).</div>'
 +(msg?'<div class="small" style="color:var(--bad)">'+esc(msg)+'</div>':'')
 +(P.prompt?'<button id="inst">앱으로 설치</button>':'')
 +(P.ios&&!P.standalone&&!lsGet('pwa_ios_hint')?'<div class="hint" id="ihint">홈 화면 앱으로 쓰려면 사파리 아래 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>를 눌러 주세요. 가로로 돌려서 하면 돼요. <button id="ihok" style="padding:2px 10px;margin-left:4px">알겠어요</button></div>':'')
 +'<div class="small mu keys" style="max-width:420px">소리·컷인·다듬은 효과는 빠진 느낌 확인용이에요. 키: 1~7 카드 · Q/W 스펠 · E 액티브 · Space 확정 · T 타임뱅크 · L 로그</div></div>';
 document.querySelectorAll('[data-d]').forEach(function(b){b.onclick=function(){S.diff=b.dataset.d;localStorage.setItem('play_diff',S.diff);home()}});
 if($('inst'))$('inst').onclick=function(){PWA.install()};if($('ihok'))$('ihok').onclick=function(){lsSet('pwa_ios_hint','1');$('ihint').remove()};
 $('go').onclick=function(){var d=$('dev').value.trim().toLowerCase();if(!/^[a-z0-9_-]{3,32}$/.test(d)){toast('아이디는 영문 소문자·숫자 3~32자');return}localStorage.setItem('play_dev',d);start(d)};
 var code=sessionStorage.getItem('play_room');if(code&&!msg){if(S.tok)connect(code);else login(dev).then(function(){connect(code)}).catch(function(){sessionStorage.removeItem('play_room')})}}
window.onPwaChange=function(){if(!S.st&&S.data&&$('go'))home()};
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function login(d){return api('/v1/auth/dev',{devId:d}).then(function(j){S.tok=j.accessToken})}
function defs(){var l=lsGet('play_last'),ld=lastLoad(l);return {preferred:l?[l]:[],spells:ld.spells,preset:ld.preset}}
function start(d){$('go').disabled=true;login(d).then(function(){return api('/v1/practice',{difficulty:S.diff,defaults:defs()})}).then(function(j){connect(j.code)}).catch(function(e){home('시작 실패: '+e.message)})}
function connect(code){sessionStorage.setItem('play_room',code);if(S.room!==code){S.room=code;S.hlog={};S.lastOpp=null;S.pickedSelf=null;S.loadSelf=false;S.load=null;S.menu=false}api('/v1/rooms/'+code+'/ticket',{}).then(function(j){
 var ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/v1/rooms/'+code+'/ws?ticket='+encodeURIComponent(j.ticket));S.ws=ws;
 ws.onmessage=function(e){var m=JSON.parse(e.data);if(m.type==='room')onRoom(m);else if(m.type==='error')toast(ERR[m.error]||('오류: '+m.error));else if(m.type==='afk_warning')toast('⚠ 2턴째 행동 없음: 다음 턴도 없으면 패배 처리')};
 ws.onclose=function(e){clearInterval(ws.hb);if(S.ws!==ws)return;if(e.code===4001)return;setTimeout(function(){if(sessionStorage.getItem('play_room')===code)connect(code)},1500)};
 ws.hb=setInterval(function(){if(ws.readyState===1)ws.send('{"type":"ping"}')},20000);
}).catch(function(e){if(e instanceof TypeError&&sessionStorage.getItem('play_room')===code){setTimeout(function(){if(sessionStorage.getItem('play_room')===code)connect(code)},2000);return}sessionStorage.removeItem('play_room');home('접속 실패: '+e.message)})}
function send(o){S.ws&&S.ws.readyState===1&&S.ws.send(JSON.stringify(o))}
function quit(){sessionStorage.removeItem('play_room');var ws=S.ws;S.ws=null;if(ws){try{ws.send('{"type":"leave"}')}catch(e){}clearInterval(ws.hb);ws.onclose=null;setTimeout(function(){try{ws.close()}catch(e){}},300)}}

/* ---------- 화면 꺼짐 방지(Wake Lock, 미지원이면 생략)·판 진행 중 표시(새 버전 띠 숨김) ---------- */
function wake(on){S.wakeOn=on;try{if(on&&!S.wl&&navigator.wakeLock&&document.visibilityState==='visible')navigator.wakeLock.request('screen').then(function(l){S.wl=l;l.addEventListener('release',function(){S.wl=null})}).catch(function(){});if(!on&&S.wl){S.wl.release();S.wl=null}}catch(e){}}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&S.wakeOn)wake(true)});
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
function render(){var m=S.st;if(!m)return home();S.showLog=S.showLog&&m.phase==='battle';wake(['pick','loadout','battle'].indexOf(m.phase)>=0);
 if(m.phase==='closed'){quit();return home('판이 닫혔어요('+(m.notice||'')+')')}
 if(m.phase==='pick'||m.phase==='ban')return renderPick(m);
 if(m.phase==='loadout')return renderLoadout(m);
 if(m.phase==='battle')return renderBattle(m);
 if(m.phase==='result')return renderResult(m);
 $('app').innerHTML='<div class="scr home"><div class="mu">준비 중…</div></div>'}
function stepChips(cur){return '<div class="chips">'+[['pick','픽'],['loadout','스펠·덱'],['battle','전투']].map(function(x){return '<span class="chip'+(x[0]===cur?' on':'')+'">'+x[1]+'</span>'}).join('')+'</div>'}
function topBar(m,label){return '<div class="top">'+stepChips(m.phase)+'<div class="mu small">'+esc(label)+'</div><div class="timer" id="tm"></div></div>'}
function frameOf(f){return {tier:(f&&f.frame)||'BRONZE',holo:f&&f.holo!=null?f.holo:0}}
/* 밴·픽: 가로 3단(기획지시 2026-11-01 밴픽화면재배치). 왼쪽 내 선택 · 가운데 4열 목록(이 화면만 세로 스크롤, 줄 단위 멈춤) · 오른쪽 상대 "?".
   선택 테두리 자리는 처음부터 2pt(투명) → 눌러도 크기·위치 불변. 눌러 둔 캐릭터는 서버에 hint로 보내 시간 초과 때 그것으로 확정(37차) */
/* 픽 배치(기획지시 픽5열안전영역): 폭 = 화면 − 좌우 안전 영역 − 좌우 14 → 좌 19% / 중앙 62% / 우 19%, 단 사이 12. 중앙 5열(9명 5+4), 크기 = min(폭, 2줄 높이), 72 미만이면 4열 */
function prepPad(){var f=safe(),short=innerHeight<=500;return {t:Math.max(short?8:12,f.t),r:f.r+14,b:f.b>0?f.b+12:(short?8:12),l:f.l+14,short:short}}  // 확정 버튼은 홈 표시줄 위로 12
function padCss(p){return 'padding:'+p.t+'px '+p.r+'px '+p.b+'px '+p.l+'px'}
function pickLay(n){var W=innerWidth,H=innerHeight,p=prepPad(),short=p.short,gap=12,inner=W-p.l-p.r-2*gap,side=Math.round(inner*0.19),cen=inner-2*side;
 var topH=short?30:40,topM=short?6:12,band=short?30:44,barH=short?40:46,barM=short?6:12,g8=8;
 var listH=H-p.t-p.b-topH-topM-band-6-barH-barM,rowsFit=function(cols,w){return Math.ceil(n/cols)*(w*1.4+4)+(Math.ceil(n/cols)-1)*g8+8};
 var cols=5,wW=Math.floor((cen-8-(cols-1)*g8)/cols)-4,wH=Math.floor(((listH-4-g8)/2)/1.4)-4,cw=Math.min(wW,wH,170);
 if(cw<72){cols=4;cw=Math.min(Math.floor((cen-8-3*g8)/4)-4,170)}
 var sideH=H-p.t-p.b-topH-topM-barH-barM-40,sw=Math.floor(Math.min(side,sideH*0.7/1.4));  // 사선(전투와 같게): 나 왼쪽 아래, 상대 오른쪽 위 — 높이를 다 쓰지 않아 위아래 차이가 보이게
 return {p:p,gap:gap,side:side,cen:cen,cw:cw,cols:cols,listH:listH,sw:sw,band:band,short:short,scroll:rowsFit(cols,cw)>listH+1}}
function renderPick(m){var P=m.prep,ban=m.phase==='ban',z=pickLay(P.characters.length),done=ban?!!P.myBan:!!P.myPick;
 var cur=ban?(P.myBan||S.banSel):(P.myPick||(S.pickSel&&P.banned.indexOf(S.pickSel)<0?S.pickSel:null));if(cur&&P.characters.indexOf(cur)<0)cur=null;
 var c=cur?ch(cur):null,badge=function(id){return (P.mastery.mine||{})[id]||1};
 var mine=cur?pvCard(cur,{w:z.sw,holo:0,badge:ban?1:badge(cur),cls:'rnd'+(ban?' ban':'')}):'<div class="emp" style="width:'+z.sw+'px">'+(ban?'밴할 캐릭터':'선택 전')+'</div>';
 var h='<div class="scr pk3" style="'+padCss(z.p)+';--side:'+z.side+'px;--cen:'+z.cen+'px;--g:'+z.gap+'px;--band:'+z.band+'px">'+topBar(m,done?(ban?'밴 완료':'선택 완료')+' · 상대 '+((ban?P.oppBanDone:P.oppPickDone)?'완료':'선택 중'):(ban?'상대가 못 쓰게 할 캐릭터를 고르세요':'캐릭터를 고르고 확정하세요 (동시·비공개)'))
  +'<div class="pk3b"><div class="pcol me"><div class="lab2">'+(ban?'나 · 내 밴':'나')+'</div>'+mine+'<b class="pnm">'+(c?esc(c.name):'&nbsp;')+'</b></div>'
  +'<div class="pmid"><div class="plist c'+z.cols+(z.scroll?' scr2':'')+'" id="plist" style="--pw:'+(z.cw+4)+'px">'+P.characters.map(function(id){var x=ch(id),bn=!ban&&P.banned.indexOf(id)>=0;
   return '<div class="pk'+(cur===id?' sel':'')+(bn?' off':'')+'" data-pick="'+id+'">'+pvCard(id,{w:z.cw,holo:0,badge:badge(id),sub:x.role||'',cls:'rnd'+(bn?' ban':'')})+'<i class="ck">✓</i></div>'}).join('')+'</div>'
  +'<div class="pband">'+(c?'<div><b>'+esc(c.name)+'</b> <span class="mu">'+esc((c.job||'')+' · '+(c.role||''))+'</span> · 패시브 <b>'+esc(c.passive_name||'')+'</b> '+esc(c.passive_text||'')+'</div><div>액티브 <b>'+esc(c.active_name||'')+'</b> '+esc(c.active_text||'')+'</div>':'<div class="mu">캐릭터를 누르면 스킬이 보여요 · 시간이 지나면 '+(ban?'눌러 둔 캐릭터를 밴(없으면 밴 없음)':'눌러 둔 캐릭터 → 직전에 쓴 캐릭터 순으로 자동 선택')+'</div>')+'</div></div>'
  +'<div class="pcol opp"><div class="lab2">상대'+(m.mode==='practice'?' (AI)':'')+'</div><div class="qcard" style="width:'+z.sw+'px">?</div><b class="pnm">&nbsp;</b></div></div>'
  +'<div class="row bar pbar"><button id="qt">나가기</button><button class="pri confirm" id="pok"'+(done||!cur?' disabled':'')+'>'+(done?'대기 중…':(ban?'밴 확정':'선택 확정')+' (Space)')+'</button></div></div>';
 var keep=$('plist')?$('plist').scrollTop:0;$('app').innerHTML=h;var pl=$('plist');pl.scrollTop=keep;
 var fade=function(){pl.classList.toggle('more',z.scroll&&pl.scrollTop+pl.clientHeight<pl.scrollHeight-4)};pl.onscroll=fade;fade();
 document.querySelectorAll('[data-pick]').forEach(function(el){el.onclick=function(){var id=el.dataset.pick;if(done||(!ban&&P.banned.indexOf(id)>=0))return;if(ban)S.banSel=id;else S.pickSel=id;send({type:'hint',characterId:id});render()}});
 $('pok').onclick=confirmPick;$('qt').onclick=function(){quit();home()}}
function confirmPick(){var m=S.st;if(!m||(m.phase!=='pick'&&m.phase!=='ban'))return;var P=m.prep;
 if(m.phase==='ban'){if(P.myBan||!S.banSel)return;send({type:'ban',characterId:S.banSel});return}
 var id=S.pickSel;if(P.myPick||!id||P.banned.indexOf(id)>=0)return;S.pickedSelf=id;lsSet('play_last',id);send({type:'pick',characterId:id})}
/* 스펠·덱(재배치 3): 왼쪽 상대(위)·나(아래) 같은 크기, 오른쪽 스펠 8종 한 줄(링+체크, 2개) + 설명 한 줄 + 덱 탭 + 덱 12장 한 줄(이름 없이, 길게 누르면 상세). 폭 44 미만이면 6×2 */
function loLay(){var W=innerWidth,H=innerHeight,p=prepPad(),short=p.short,gap=12,topH=short?30:40,topM=short?8:12,botH=short?40:46,botM=short?8:12;
 var colH=H-p.t-p.b-topH-topM-botH-botM,ch2=Math.floor((colH-gap)/2),cw=Math.floor(Math.min(ch2*5/7,200)),main=W-p.l-p.r-cw-gap;
 var dw=Math.floor((main-11*4)/12),two=dw<44;if(two)dw=Math.floor(Math.min((main-5*6)/6,(colH*0.42)/2/1.4));
 return {p:p,gap:gap,cw:cw,main:main,dw:Math.min(dw,90),two:two,short:short}}
function renderLoadout(m){var P=m.prep,z=loLay();S.load=S.load||lastLoad(P.myPick);var L=P.myLoadout||S.load,done=!!P.myLoadout;
 var preset=(S.data.presets[P.myPick]||[]).find(function(x){return x.slot===L.preset})||{cards:[]};
 var own=Object.keys(S.data.cards).filter(function(id){return S.data.cards[id].owner_character===P.myPick}).sort(),deck=preset.cards.concat(own);  // 덱 12장 = 프리셋 10 + 전용 2(엔진 buildDeck)
 var sp=L.spells,desc=sp.map(function(id){return sname(id)+': '+((S.data.spells[id]||{}).effect_text||'')}).join(' / ');
 var h='<div class="scr lo3" style="'+padCss(z.p)+';--cw:'+z.cw+'px;--g:'+z.gap+'px">'+topBar(m,done?'준비 완료 · 상대 '+(P.oppLoadoutDone?'완료':'선택 중'):'스펠 2개와 덱을 고르세요')
  +'<div class="lo3b"><div class="lcol2">'+pvCard(P.oppPick,{w:z.cw,holo:0,cls:'rnd',badge:(P.mastery.opp||{})[P.oppPick]||1,sub:'상대 (AI)'})+pvCard(P.myPick,{w:z.cw,holo:0,cls:'rnd',badge:(P.mastery.mine||{})[P.myPick]||1,sub:'나'})+'</div>'
  +'<div class="rcol2"><div class="sprow">'+Object.keys(S.data.spells).map(function(id){var s=S.data.spells[id],ic=S.A.slots['SPELL_'+id],on=sp.indexOf(id)>=0;
   return '<button class="spb2'+(on?' on':'')+'" data-sp="'+id+'"'+(done?' disabled':'')+' data-tip="'+esc(s.name+' · 쿨다운 '+s.cooldown+'턴 — '+(s.effect_text||''))+'"><i style="'+(ic?'background-image:url('+ic.url+')':'')+'">'+(ic?'':esc(s.name.slice(0,1)))+'</i><b>'+esc(s.name)+'</b><small>쿨 '+s.cooldown+'</small>'+(on?'<em>✓</em>':'')+'</button>'}).join('')+'</div>'
  +'<div class="small mu line1" id="spinfo">'+esc(desc||'스펠 2개를 고르세요')+'</div>'
  +'<div class="row tabs">'+(S.data.presets[P.myPick]||[]).map(function(p){return '<button data-pre="'+p.slot+'" class="sm tab2'+(L.preset===p.slot?' on':'')+'"'+(done?' disabled':'')+'>'+({aggro:'공세',balance:'균형',defense:'수비'}[p.style]||p.style)+' 덱</button>'}).join('')+'<span class="small mu">카드를 누르면(마우스는 올리면) 상세</span></div>'
  +'<div class="deck2'+(z.two?' two':'')+'" style="--dw:'+z.dw+'px">'+deck.map(function(id){return bcCard(id,{w:z.dw,mode:'hand',cls:'mini',attr:' data-cid="'+id+'"'})}).join('')+'</div></div></div>'
  +'<div class="row bar pbar"><button id="qt">나가기</button><button class="pri confirm" id="ok"'+(done||sp.length!==2?' disabled':'')+'>'+(done?'대기 중…':'준비 완료 (Space)')+'</button></div></div>';
 $('app').innerHTML=h;
 document.querySelectorAll('[data-sp]').forEach(function(b){b.onclick=function(){var id=b.dataset.sp,i=S.load.spells.indexOf(id);if(i>=0)S.load.spells.splice(i,1);else{if(S.load.spells.length>=2)S.load.spells.shift();S.load.spells.push(id)}render()};
  b.onmouseenter=function(){var s=S.data.spells[b.dataset.sp];$('spinfo').textContent=s.name+': '+s.effect_text}});
 document.querySelectorAll('[data-pre]').forEach(function(b){b.onclick=function(){S.load.preset=Number(b.dataset.pre);render()}});
 $('ok').onclick=confirmLoad;$('qt').onclick=function(){quit();home()}}
function lastLoad(id){try{var x=JSON.parse(localStorage.getItem('play_load_'+id)||'null');if(x&&x.spells&&x.spells.length===2)return x}catch(e){}return {spells:['SP01','SP04'],preset:2}}
function confirmLoad(){var P=S.st.prep;if(P.myLoadout||S.load.spells.length!==2)return;S.loadSelf=true;lsSet('play_load_'+P.myPick,JSON.stringify(S.load));send({type:'loadout',spells:S.load.spells,preset:S.load.preset})}

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
function cellCard(id,w,attr){return {k:card(id).kind,id:id,ord:phOf(id),lab:phLab(id),html:bcCard(id,{w:w,mode:'hand',attr:' data-cid="'+id+'"'+(attr||'')})}}
function cellSpell(id,w,attr,used){var ic=S.A.slots['SPELL_'+id];return {k:'spell',id:id,ord:-1,lab:'0 스펠',html:'<div class="cell spc" style="--w:'+w+'px"'+(attr||'')+' data-tip="'+esc(sname(id)+' — '+((S.data.spells[id]||{}).effect_text||''))+'"><i style="'+(ic?'background-image:url('+ic.url+')':'')+'">'+(ic?'':esc(sname(id).slice(0,2)))+'</i><b>'+esc(sname(id))+'</b>'+(used?'<em>사용</em>':'')+'</div>'}}
function cellActive(chr,w,attr,used,fr){var c=ch(chr),f=fr?S.A.slots['FRAME_'+fr]:null;return {k:'active',id:chr,ord:3.5,lab:'3 스킬(액티브)',html:'<div class="cell acc" style="--w:'+w+'px"'+(attr||'')+' data-tip="'+esc('액티브 '+(c.active_name||'')+' — '+(c.active_text||''))+'"><div class="af" style="'+faceCss(chr)+'">'+(f?'<s style="background-image:url('+f.url+')"></s>':'')+'</div><b>'+esc(c.active_name||'액티브')+'</b>'+(used?'<em>사용</em>':'')+'</div>'}}
function sortCells(a){return a.map(function(x,i){x.i=i;return x}).sort(function(x,y){return x.ord-y.ord||x.i-y.i})}
/* 상대 최근 3턴 사용 카드(효과연출 8) */
/* 전투 화면 배치(기획지시 2026-11-01 전투UI개편 3): 고정 구역(캐릭터 카드·버튼 구역·로그 줄·슬롯) + 가변 구역(손패).
   844×390 기준: 캐릭터 카드 176×64, 상태 뱃지 3줄 48, 상단 줄 30, 손패 높이 104(카드 약 74×104), 슬롯 칸 약 50×70 */
function lay(n){var W=innerWidth,H=innerHeight,short=H<=500,pad=short?8:12,f=safe(),pl=Math.max(pad,f.l),pr=Math.max(pad,f.r),pt=Math.max(pad,f.t),pb=Math.max(pad,f.b);
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
function lay3(n){var W=innerWidth,H=innerHeight,short=H<=500,f=safe(),pad=short?8:12,pl=Math.max(pad,f.l),pr=Math.max(pad,f.r),pt=Math.max(pad,f.t),pb=Math.max(pad,f.b),g=short?6:10;
 var inner=W-pl-pr,wide=inner>=1180&&H>=600,panelW=wide?Math.min(440,inner-960-16):0,bR=wide?pl+960:W-pr;
 var topH=short?26:34,actH=short?26:32,ctlW=short?176:232;
 var ch=short?Math.min(150,Math.round((H-pt-pb)*0.42)):Math.round(Math.min(230,H*0.28)),cw=Math.round(ch*5/7);
 var sw=short?50:Math.round(Math.min(84,H*0.1)),slH=Math.round(sw*1.4),labH=short?16:20;
 var handH=short?Math.max(96,Math.min(118,Math.round(H*0.29))):Math.round(Math.min(220,H*0.25)),handTop=H-pb-handH;
 var meSX=pl+cw+g,meSY=handTop-g-slH,opX=bR-cw,opSY=pt,opSRight=opX-g,handL=meSX,handR=bR-ctlW-g,handW=handR-handL;
 var cwc=Math.floor(handH*0.9*5/7),ov=false;if(n*cwc+(n-1)*6>handW){ov=true;cwc=Math.floor(Math.min(cwc,handW/(n*0.7+0.3)))}
 var boardW=bR-pl,two=(5*sw+4*16)>Math.floor(boardW*0.48);
 return {W:W,H:H,short:short,wide:wide,panelW:panelW,bR:bR,pl:pl,pr:pr,pt:pt,pb:pb,g:g,topH:topH,actH:actH,ctlW:ctlW,ch:ch,cw:cw,sw:sw,slH:slH,labH:labH,meSX:meSX,meSY:meSY,opX:opX,opSY:opSY,opSRight:opSRight,
  handTop:handTop,handH:handH,handL:handL,handW:handW,ccw:cwc,ov:ov,two:two,colTop:pt+topH+g,midX:Math.round(pl+boardW*0.38),midY:Math.round((opSY+slH+labH+meSY-labH)/2),detail:false}}
/* 넓은 화면 오른쪽 패널(전투UX2차 5): 카드 상세(손패 호버) + 처리 순서 도움말 + 전체 로그 */
function wdetHelp(){return '<b>처리 순서</b><div class="small">0 스펠 → 1 보호(방어·반격·면역) → 2 방해(침묵·방해) → 3 스킬·액티브 → 4 공격 → 5 턴 끝(작열·재생)</div><div class="small mu">손패 카드에 마우스를 올리면 여기에 효과 전문이 나와요.</div>'}
function wdetCard(id){var k=card(id),d=$('wdet');if(!d)return;d.innerHTML='<div class="row" style="gap:8px;align-items:flex-start;flex-wrap:nowrap">'+bcCard(id,{w:110,mode:'hand'})+'<div><b>'+esc(k.name)+'</b><div class="mu small">'+esc(KIND_KO[k.kind]||k.kind)+' · 비용 '+k.cost+'E · '+phLab(id)+(k.owner_character?' · '+esc(ch(k.owner_character).name)+' 전용':'')+'</div><p style="margin:6px 0">'+esc(k.effect_text)+'</p><div class="aff small">'+(AFF[k.kind]||'')+'</div></div></div>'}
/* 턴 시작 연출(전투UX2차 4): 가운데 상시 턴 표시 대신 매 턴 "N턴"(마지막 턴, 7턴~ 폭주) 약 1초 */
function turnBanner(b){var key=S.room+':'+b.turn;if(S.bannerKey===key)return;S.bannerKey=key;var r=b.rules,t=b.turn,txt=(t>=r.max_turn?'마지막 턴':t+'턴')+(t>=r.rush_start_turn?' · 폭주 +'+Math.round((r.rush_dmg_step||0.25)*(t-r.rush_start_turn+1)*100)+'%':'');
 var e=document.createElement('div');e.className='tban';e.textContent=txt;$('bt').appendChild(e);setTimeout(function(){e.remove()},1100)}
function vCard(p,who,m,z){var c=ch(p.char),fac=S.A.slots['FACTION_'+FAC[c.faction]],max=p.maxHp,hp=p.hp,sh=Math.min(p.shield,max),w=Math.max(0,100*hp/max),sw=Math.min(100-w,100*sh/max);
 return '<div class="vc side" id="side_'+who+'" style="width:'+z.cw+'px;height:'+z.ch+'px"><div class="vfa" id="face_'+who+'">'+pvCard(p.char,{w:z.cw,holo:0,cls:'rnd'})+'</div>'
  +(who==='opp'&&p.submitted&&m.phase==='battle'?'<span class="chip on okc">확정</span>':'')
  +'<div class="vbot"><div class="nmrow">'+(fac?'<i style="background-image:url('+fac.url+')"></i>':'')+'<span>'+esc(c.name)+'</span></div>'
  +'<div class="hpbar"><div class="gh" id="gh_'+who+'" style="width:'+w+'%"></div><div class="hp" id="hp_'+who+'" style="width:'+w+'%"></div><div class="sh" id="sh_'+who+'" style="left:'+w+'%;width:'+sw+'%"></div></div>'
  +'<div class="hptx"><span id="hpt_'+who+'">'+hp+'/'+max+'</span><span id="sht_'+who+'" style="color:var(--sh)">'+(sh?'+'+sh:'')+'</span></div>'
  +'<div class="gauge" data-tip="게이지 '+Math.min(100,p.gauge)+'/100 — 100이 되면 액티브를 쓸 수 있어요"><i style="width:'+Math.min(100,p.gauge)+'%"></i></div></div></div>'}
function slotsHtml3(items,mine,z,tag,cls){var it=items.slice(),rowA=it,rowB=[];if(z.two&&it.length>4){rowA=it.filter(function(x){return x.k!=='active'});rowB=it.filter(function(x){return x.k==='active'})}  // 두 줄: 1줄 스펠+카드, 2줄 액티브(기획답변 41차)
 var one=function(arr,min){var n=Math.max(min,Math.min(5,arr.length)),h='';for(var i=0;i<n;i++){var x=arr[i],col=x&&x.k&&KCOL[x.k];if(i&&x&&arr[i-1])h+='<span class="arr">›</span>';
   h+='<div class="slot'+(mine?' mine':'')+(x&&x.k?' k-'+x.k:'')+'"'+(x&&x.skey?' data-skey="'+x.skey+'"':'')+' style="'+(col?'border-color:'+col:'')+'">'+(x?(x.lab?'<span class="lab"><b class="num" style="background:'+col+'">'+String(x.lab).charAt(0)+'</b>'+esc(String(x.lab).slice(2))+'</span>':'')+x.html:'')+'</div>'}return h};
 return '<div class="slots'+(mine?' me':' opp')+(cls?' '+cls:'')+'" style="--sw:'+z.sw+'px"><div class="srow">'+one(rowA,3)+'</div>'+(rowB.length?'<div class="srow">'+one(rowB,0)+'</div>':'')+(tag?'<span class="tag">'+tag+'</span>':'')+'</div>'}
function renderBattle(m,reveal){var b=m.battle,me=b.me,op=b.opp,sub=me.mySubmission,z=lay3(me.hand.length);
 if(S.selTurn!==b.turn){S.sel={cards:[],spell:null,active:false};S.selTurn=b.turn}
 var hand=me.hand.slice().sort(function(x,y){var a=card(x.id),c=card(y.id);return x.cost-y.cost||(KIND_ORD[a.kind]-KIND_ORD[c.kind])||x.uid-y.uid});
 var chosen=sub?sub.cards:S.sel.cards,used=sumCost(me,chosen),blockSkill=me.status.some(function(s){return s.k==='skillBlock'});
 var max=b.rules.cards_per_turn_max||3,full=chosen.length>=max,opItems=[],meItems=[],opTag='',opCls='',fm=frameOf(m.prep&&m.prep.frame.mine).tier,fo=frameOf(m.prep&&m.prep.frame.opp).tier;
 if(reveal){
  opItems=reveal.opp.map(function(x,i){var at=' id="rv_opp'+i+'"';return x.k==='spell'?cellSpell(x.id,z.sw,at,true):x.k==='active'?cellActive(op.char,z.sw,at,true,fo):cellCard(x.id,z.sw,at)});
  meItems=reveal.me.map(function(x,i){var at=' id="rv_me'+i+'"';return x.k==='spell'?cellSpell(x.id,z.sw,at,true):x.k==='active'?cellActive(me.char,z.sw,at,true,fm):cellCard(x.id,z.sw,at)})}
 else{
  if(op.submitted){for(var i=0;i<3;i++)opItems.push({html:backCard(z.sw)});opTag='확정'}
  else if(S.lastOpp&&S.lastTurn===b.turn-1&&S.lastOpp.length){opItems=S.lastOpp.map(function(x){return x.k==='spell'?cellSpell(x.id,z.sw,'',false):x.k==='active'?cellActive(op.char,z.sw,'',false,fo):cellCard(x.id,z.sw)});opTag='지난 턴';opCls='old'}
  chosen.forEach(function(u){var c=me.hand.find(function(x){return x.uid===u});if(c){var it=cellCard(c.id,z.sw,' data-unpick="'+u+'"');it.skey='u'+u;meItems.push(it)}});
  var sp=sub?sub.spell:S.sel.spell,ac=sub?sub.active:S.sel.active;
  if(sp){var a1=cellSpell(sp,z.sw,sub?'':' data-unspell="1"',!!sub);a1.skey='sp';meItems.push(a1)}if(ac){var a2=cellActive(me.char,z.sw,sub?'':' data-unact="1"',!!sub,fm);a2.skey='ac';meItems.push(a2)}
  meItems=sortCells(meItems)}
 var tl=left(m.deadline),red=tl<=10,ast=actState(me),lines=(S.logLines||[]).slice(-2);
 var prevR={};document.querySelectorAll('.slots.me [data-skey]').forEach(function(el){prevR[el.dataset.skey]=el.getBoundingClientRect()});
 var P=function(l,t,w,h){return 'left:'+l+'px;top:'+t+'px'+(w!=null?';width:'+w+'px':'')+(h!=null?';height:'+h+'px':'')};
 var opB=badgesHtml(op,'opp',b.turn),opN=(opB.match(/class="bg/g)||[]).length,oz=opN>=5?Object.assign({},z,{ch:Math.max(Math.min(110,z.ch),z.ch-20*(opN-4))}):z,opSlotsW=Math.max(3,Math.min(5,opItems.length))*z.sw+(Math.max(3,Math.min(5,opItems.length))-1)*16,waiting=!!sub&&!reveal;
 var h='<div class="bt bt2 bt3'+(S.lefty?' lefty':'')+(z.short?' short':'')+(z.wide?' wide':'')+(reveal?' rev':'')+'" id="bt" data-turn="'+b.turn+'" style="--g:'+z.g+'px;--topH:'+z.topH+'px;--pad:'+z.pl+'px;--handH:'+z.handH+'px">'
 +'<div class="icons" style="'+P(z.pl,z.pt,null,z.topH)+'">'+iconsHtml(op)+'</div>'
 +'<div class="logline" id="logline" title="눌러서 전체 로그 (L)" style="'+P(z.pl+220,z.pt,Math.max(120,z.opSRight-opSlotsW-z.g-(z.pl+220)),z.topH)+'">'+(lines.length?lines.map(function(x){return '<div>'+x+'</div>'}).join(''):'<div class="mu">전투 로그 · 누르면 전체</div>')+'</div>'
 +'<div class="oppc" style="'+P(z.opX,z.pt,z.cw)+';max-height:'+(z.H-z.pb-z.pt-118)+'px">'+vCard(op,'opp',m,oz)+'<div class="bdg" id="bdg_opp">'+opB+'</div></div>'
 +'<div class="opslots" style="right:'+(z.W-z.opSRight)+'px;top:'+z.opSY+'px">'+slotsHtml3(opItems,false,z,opTag,opCls)+recentHtml(op)+'</div>'
 +'<div class="center" style="top:'+z.midY+'px;left:'+z.midX+'px">'
 +'<div class="chips" id="phc">'+PH.map(function(t,i){return '<span class="chip" data-ph="'+i+'">'+(z.short?i:i+' '+t)+'</span>'}).join('')+'</div>'
 +'<div class="ring'+(red&&!reveal&&!waiting?' red':'')+(waiting?' wait':'')+'" id="ring"><span id="rt">'+(reveal?'':tl)+'</span></div><div class="cap" id="cap">'+(waiting?'상대 기다리는 중':'')+'</div></div>'
 +'<div class="mec" style="left:'+z.pl+'px;bottom:'+z.pb+'px;width:'+z.cw+'px;max-height:'+(z.H-z.pb-z.colTop)+'px">'+vCard(me,'me',m,z)+'<div class="bdg" id="bdg_me">'+badgesHtml(me,'me',b.turn)+'</div>'
 +'<button class="act'+(ast==='ready'&&!sub&&!reveal?' ready':'')+(ast==='lock'?' lockb':'')+(!reveal&&(S.sel.active||(sub&&sub.active))?' on':'')+'" id="act" style="height:'+z.actH+'px"'+(sub||reveal||ast!=='ready'?' disabled':'')+' data-tip="'+esc((ch(me.char).active_name||'')+' — '+(ch(me.char).active_text||''))+'">'+(ast==='lock'?'🔒 침묵':ast==='ready'?'액티브 (E)':'게이지 '+Math.min(100,me.gauge)+'%')+'</button></div>'
 +'<div class="meslots" style="'+P(z.meSX,z.meSY)+'">'+slotsHtml3(meItems,true,z)+'</div>'
 +'<div class="hand'+(z.ov?' ov':'')+'" style="'+P(z.handL,z.handTop,z.handW,z.handH)+';--cw:'+z.ccw+'px">'+hand.map(function(c,i){var picked=chosen.indexOf(c.uid)>=0,sb=blockSkill&&card(c.id).kind==='skill',cant=!picked&&sumCost(me,chosen.concat([c.uid]))>me.energy,cls=picked?'picked':(c.sealed||sb)?'lock':cant?'cant':full?'dim':(reveal||sub)?'':'can';
  return bcCard(c.id,{w:z.ccw,mode:'hand',face:true,cls:cls,attr:' data-uid="'+c.uid+'" data-i="'+i+'" data-cid="'+c.id+'"',extra:sb&&!picked?'<span class="lockt">이번 턴 사용 불가</span>':''})}).join('')+'</div>'
 +'<div class="ctl" style="right:'+(z.W-z.bR)+'px;bottom:'+z.pb+'px;width:'+z.ctlW+'px"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div class="orbs" data-tip="내 에너지: 고른 카드 비용만큼 비워서 보여 줘요">'+Array.from({length:Math.max(me.energy,0)},function(_,i){return '<i class="'+(i>=me.energy-used?'use':'')+'"></i>'}).join('')+'<span class="small" style="margin-left:4px">'+(me.energy-used)+'/'+me.energy+'</span>'
 +(me.freeOneCost&&!reveal?'<span class="small fr1" data-tip="실피 패시브: 매 턴 처음 내는 1E 카드 비용 0">순풍</span>':'')+'</div>'
 +'<div class="spl">'+spellBtns(me,true,sub)+'</div></div>'
 +(reveal?'<div class="row" style="flex-wrap:nowrap"><button id="spd" title="연출 속도">'+SPD_LAB[S.rspd||'normal']+'</button><button class="pri confirm skip" id="skip" style="flex:1">건너뛰기 ▶▶</button></div>'
  :'<div class="row" style="flex-wrap:nowrap"><button id="tb"'+(m.timebankUsed||sub?' disabled':'')+' title="판당 1회 (T)">+15초</button><button class="pri confirm" id="ok" style="flex:1"'+(sub?' disabled':'')+'>'+(sub?'상대 대기…':'확정 (Space)')+'</button></div>')+'</div>'
 +(z.wide?'<div class="wpanel" style="left:'+(z.bR+16)+'px;top:'+z.pt+'px;bottom:'+z.pb+'px;width:'+z.panelW+'px"><div class="wdet" id="wdet">'+wdetHelp()+'</div><div class="wlog log" id="wlog">'+logHtml()+'</div></div>':'')
 +(S.showLog&&!z.wide?'<div class="log" id="logp">'+logHtml()+'</div>':'')+(S.menu&&!reveal?menuHtml():'')+'</div>';
 $('app').innerHTML=h;
 S.wide=z.wide;if(!reveal)turnBanner(b);
 if(S.lefty){var bt=$('bt'),BW=bt.clientWidth;Array.prototype.forEach.call(bt.children,function(el){if(el.classList.contains('center')||el.classList.contains('log')||el.classList.contains('menu'))return;var l=el.offsetLeft,w=el.offsetWidth;el.style.left=(BW-l-w)+'px';el.style.right='auto'});bt.querySelectorAll('.opslots,.slots.opp').forEach(function(x){x.style.alignItems='flex-start'})}  // 왼손 모드: 좌우 반전
 fitHand();
 document.querySelectorAll('.slots.me [data-skey]').forEach(function(el){var r0=prevR[el.dataset.skey];if(!r0||!el.animate)return;var r1=el.getBoundingClientRect(),dx=r0.left-r1.left,dy=r0.top-r1.top;if(Math.abs(dx)>2||Math.abs(dy)>2)el.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],{duration:300,easing:'ease-out'})});
 $('logline').onclick=function(){S.showLog=!S.showLog;refreshLog()};bindLog();
 document.querySelectorAll('.pop').forEach(function(el){el.onclick=function(e){e.stopPropagation();tipShow(el)}});
 if(reveal)return;
 if(m.reveal&&!m.reveal.done&&S.revSent!==b.turn){S.revSent=b.turn;send({type:'revealed',turn:b.turn})}
 document.querySelectorAll('.hand [data-uid]').forEach(function(el){el.onclick=function(){pickCard(Number(el.dataset.uid))}});
 document.querySelectorAll('[data-unpick]').forEach(function(el){el.onclick=function(){pickCard(Number(el.dataset.unpick))}});
 document.querySelectorAll('[data-unspell]').forEach(function(el){el.onclick=function(){S.sel.spell=null;render()}});
 document.querySelectorAll('[data-unact]').forEach(function(el){el.onclick=function(){S.sel.active=false;render()}});
 document.querySelectorAll('[data-spell]').forEach(function(el){el.onclick=function(){if(sub)return;S.sel.spell=S.sel.spell===el.dataset.spell?null:el.dataset.spell;render()}});
 $('act').onclick=function(){S.sel.active=!S.sel.active;render()};
 $('ok').onclick=function(){submitTurn()};$('tb').onclick=function(){send({type:'timebank'})};
 $('menu').onclick=function(){S.menu=!S.menu;render()};
 if(S.menu){$('mSur').onclick=function(){S.menu=false;render();if(b.turn<4)return toast('항복은 4턴부터 할 수 있어요');ask('항복할까요? 패배로 끝나요.','항복',function(){send({type:'surrender'})})};
  $('mLeft').onclick=function(){S.lefty=!S.lefty;lsSet('play_lefty',S.lefty?'1':'');S.menu=false;render()};$('mHelp').onclick=function(){S.menu=false;lsSet(firstKey(),'{}');guide(true)};
  $('mSpd').onclick=function(){S.rspd=SPD_NEXT[S.rspd||'normal'];lsSet('play_rspd',S.rspd);render()};if($('mMan'))$('mMan').onclick=function(){S.manual=!S.manual;lsSet('play_manual',S.manual?'1':'');render()}}
 if(S.guideOn&&S.guideShow)S.guideShow();
 if(b.turn===1&&!sub&&S.guideTurn!==m.code+':1'&&(S.forceGuide||Number(lsGet('play_games_'+(lsGet('play_dev')||''))||0)<3)){S.guideTurn=m.code+':1';setTimeout(function(){guide(false)},300)}}
var SPD_LAB={slow:'느리게',normal:'보통',fast:'빠르게'},SPD_NEXT={slow:'normal',normal:'fast',fast:'slow'},SPD_K={slow:1.5,normal:1,fast:0.5};
function menuHtml(){return '<div class="menu"><button id="mSur">항복</button><button id="mLeft">왼손 모드 '+(S.lefty?'끄기':'켜기')+'</button><button id="mHelp">도움말 다시 보기</button><button id="mSpd">연출 속도: '+SPD_LAB[S.rspd||'normal']+'</button>'+(manualOk()?'<button id="mMan">탭하면 다음 행동: '+(S.manual?'켜짐':'꺼짐')+'</button>':'')+'</div>'}
function manualOk(){var m=S.st;return !!m&&(m.mode==='practice'||m.mode==='friend')}  // 랭킹전은 수동 진행 숨김(기획답변 36차 2, 지연 플레이 방지)
/* 첫 턴 안내 3장(상세 01). AI 대전은 안내 중 선택 타이머 정지(서버 pause), 사람 상대 모드는 정지 없는 말풍선 */
var GUIDE=[['처리 순서','카드는 종류에 따라 정해진 순서로 발동해요. 고른 순서와는 상관없어요.<br><b>0 스펠 · 1 보호(방어·반격·면역) · 2 방해(침묵·방해) · 3 스킬 · 4 공격 · 5 종료</b><br>내가 낸 칸 위 번호가 이 순서예요.','.meslots'],
 ['내기','에너지 구슬만큼 한 턴에 최대 3장 낼 수 있어요. 확정하기 전에는 바꿀 수 있어요.','.orbs'],
 ['상세 보기','카드를 길게 누르면(마우스는 올리면) 효과를 볼 수 있어요.','.hand']];
function guide(manual){var m=S.st;if(!m||m.phase!=='battle'||S.anim)return;var pause=m.mode==='practice',i=0;S.guideOn=true;if(pause)send({type:'pause',on:true});
 var close=function(){var g=$('guide');if(g)g.remove();document.querySelectorAll('.hl').forEach(function(x){x.classList.remove('hl')});S.guideOn=false;S.guideShow=null;S.forceGuide=false;if(pause)send({type:'pause',on:false});document.removeEventListener('keydown',key,true)};
 var key=function(e){if(e.code==='Space'||e.key==='Enter'){e.preventDefault();e.stopPropagation();next()}else if(e.key==='Escape')close()};
 var show=function(){var g=$('guide');if(!g){g=document.createElement('div');g.id='guide';$('bt').appendChild(g)}g.className='guide'+(pause?'':' bubble');var x=GUIDE[i];
  document.querySelectorAll('.hl').forEach(function(y){y.classList.remove('hl')});var t=document.querySelector(x[2]);if(t)t.classList.add('hl');
  g.innerHTML='<div class="gc"><h4>'+(i+1)+'/3 · '+x[0]+'</h4><p>'+x[1]+'</p><div class="row"><button id="gskip" class="sm">건너뛰기</button><span class="small mu">'+(pause?'안내 중에는 시간이 멈춰요':'시간은 계속 흘러요')+'</span><button class="pri sm" id="gnext">'+(i<2?'다음 (Space)':'시작')+'</button></div></div>';
  $('gnext').onclick=function(e){e.stopPropagation();next()};$('gskip').onclick=function(e){e.stopPropagation();close()}};
 var next=function(){i++;if(i>=GUIDE.length)return close();show()};
 S.guideShow=show;document.addEventListener('keydown',key,true);show()}
function pickCard(uid){var m=S.st,b=m.battle,me=b.me;if(me.mySubmission)return;var c=me.hand.find(function(x){return x.uid===uid});if(!c)return;
 var i=S.sel.cards.indexOf(uid);if(i>=0){S.sel.cards.splice(i,1);return render()}
 if(c.sealed)return toast('봉인된 카드예요');
 if(S.sel.cards.length>=(b.rules.cards_per_turn_max||3))return toast('한 턴에 3장까지');
 if(sumCost(me,S.sel.cards.concat([uid]))>me.energy){if(navigator.vibrate)navigator.vibrate(30);return toast('에너지가 부족해요')}
 S.sel.cards.push(uid);render()}
function submitTurn(force){var m=S.st;if(!m||m.phase!=='battle'||m.battle.me.mySubmission||S.anim||S.guideOn||document.querySelector('.dlg'))return;
 if(!force&&!S.sel.cards.length&&m.battle.me.energy>0)return ask('아무것도 내지 않고 확정할까요?','확정',function(){submitTurn(true)});
 send({type:'act',turn:m.battle.turn,cards:S.sel.cards,spell:S.sel.spell,active:S.sel.active})}

/* ---------- 카드 상세(호버 0.2초 / 길게 누르기 0.35초, 상세 01) ---------- */
function peekHide(){var o=$('peek');if(o)o.remove()}
function peekShow(id){peekHide();var k=card(id),p=phOf(id),w=Math.floor(Math.min(300,innerHeight*0.42*5/7,innerWidth*0.62)),d=document.createElement('div');d.id='peek';d.className='peek';
 d.innerHTML=bcCard(id,{w:w,mode:w>=257?'detail':'hand'})+'<div class="pinfo" style="width:'+Math.max(w,260)+'px"><b>'+esc(k.name)+'</b><div class="mu small">'+esc(KIND_KO[k.kind]||k.kind)+' · 비용 '+k.cost+' · 처리 단계 '+phLab(id)+(k.owner_character?' · '+esc(ch(k.owner_character).name)+' 전용':'')+'</div><p>'+esc(k.effect_text)+'</p><div class="aff">'+(AFF[k.kind]||'')+'</div></div>';document.body.appendChild(d)}
var PK={t:0,lp:false,key:null};
/* 카드 상세·한 줄 설명: 호버 0.2초 / 길게 누르기 0.35초. 다시 그려져도 같은 대상이면 닫지 않음(효과연출 5: 누르는 동안 계속 표시) */
function tipHide(){var o=$('tip');if(o)o.remove()}
function tipShow(el){tipHide();var t=document.createElement('div');t.id='tip';t.className='tip';t.textContent=el.dataset.tip;document.body.appendChild(t);
 var r=el.getBoundingClientRect(),w=t.offsetWidth,h=t.offsetHeight,x=Math.min(innerWidth-w-6,Math.max(6,r.left+r.width/2-w/2)),y=r.top-h-6;if(y<4)y=r.bottom+6;t.style.left=x+'px';t.style.top=y+'px'}
function infoEl(e){return e.target.closest&&e.target.closest('[data-cid],[data-tip]')}
function infoKey(el){return el?(el.dataset.cid||'')+'|'+(el.dataset.tip||'')+'|'+(el.dataset.uid||el.id||el.dataset.bi||''):null}
function infoShow(el){if(el.dataset.cid){if(S.wide&&$('wdet')&&S.st&&S.st.phase==='battle')wdetCard(el.dataset.cid);else peekShow(el.dataset.cid)}else tipShow(el)}
function infoHide(){peekHide();tipHide()}
document.addEventListener('pointerover',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;var el=infoEl(e),k=infoKey(el);if(k===PK.key)return;PK.key=k;clearTimeout(PK.t);infoHide();if(el)PK.t=setTimeout(function(){if(document.body.contains(el))infoShow(el)},200)});
/* 터치: 길게 누르기 0.35초 = 상세. 손가락이 8pt 넘게 움직이면(스와이프) 상세를 띄우지 않는다.
   스펠·덱 화면의 덱 카드는 짧게 탭해도 상세(스와이프는 무시). 상세는 다음 탭에서 닫힘 */
document.addEventListener('pointerdown',function(e){if(!e.pointerType||e.pointerType==='mouse')return;var el=infoEl(e);PK.lp=false;PK.mv=false;PK.x=e.clientX;PK.y=e.clientY;PK.at=Date.now();PK.el2=el;clearTimeout(PK.t);if(!el)return;
 PK.t=setTimeout(function(){if(PK.mv)return;PK.lp=true;infoShow(el);if(navigator.vibrate)navigator.vibrate(10)},350)});
document.addEventListener('pointermove',function(e){if(!e.pointerType||e.pointerType==='mouse'||PK.mv)return;if(Math.abs(e.clientX-PK.x)>8||Math.abs(e.clientY-PK.y)>8){PK.mv=true;clearTimeout(PK.t);if(PK.lp){PK.lp=false;infoHide()}}},{passive:true});
['pointerup','pointercancel'].forEach(function(n){document.addEventListener(n,function(e){if(!e.pointerType||e.pointerType==='mouse')return;clearTimeout(PK.t);
 if(n==='pointerup'&&!PK.mv&&!PK.lp&&PK.el2&&PK.el2.closest('.deck2')&&Date.now()-PK.at<350){PK.tap=true;infoShow(PK.el2);return}  // 덱 카드: 탭 = 상세
 if(PK.lp)setTimeout(infoHide,1200)})});
document.addEventListener('click',function(e){if(PK.lp){PK.lp=false;e.stopPropagation();e.preventDefault();return}
 if(PK.tap){PK.tap=false;e.stopPropagation();return}  // 방금 탭으로 연 덱 카드 상세는 이 클릭으로 닫지 않음
 if(PK.mv){PK.mv=false}
 var cb=e.target.closest&&e.target.closest('[data-calc]');if(cb){e.stopPropagation();calcShow(cb.dataset.calc);return}
 if(!e.target.closest('[data-cid]')){infoHide();PK.key=null}
 if(S.anim&&e.target.closest('#bt')&&!e.target.closest('#spd,#logline,#menu,[data-cid],[data-tip],.log,.menu,.pop')){if(S.anim.waiting)S.anim.next();else S.anim.skip()}},true);
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
  case 'spell':nw({k:'spell',seat:e.seat,id:e.id,ph:0,bad:e.void?'스펠 무효: 상대 스펠에 막힘':'',lock:e.void?'무효':''});return;
  case 'card':nw({k:'card',seat:e.seat,id:e.id,ph:e.phase});return;
  case 'active':nw({k:'active',seat:e.seat,ph:3,bad:e.void?'침묵: 액티브 무효':'',lock:e.void?'침묵':''});return;
  case 'countered':nw({k:'counter',seat:1-e.seat,id:e.by,victim:e.card,ph:4});return;
  case 'void':nw({k:'void',seat:e.seat,id:e.card,ph:phOf(e.card),bad:({energy:'에너지 부족',silence:'침묵'}[e.why]||e.why)+': 이 카드는 무효',lock:({energy:'에너지',silence:'침묵'}[e.why]||'무효')});cur=null;return;
  case 'rush':nw({k:'rush',ph:5});cur=null;return;
  case 'end':nw({k:'end',ph:5,reason:e.reason});cur=null;return;
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
  case 'end':return {html:'■ 종료 · '+esc(REASON[g.reason]||g.reason),text:'■ 종료'};
  default:head=g.ev.some(function(e){return e.src==='burn'})?'작열':g.ev.some(function(e){return e.t==='heal'})&&chr==='SE'?esc(ch(chr).passive_name||'재생'):g.ev.some(function(e){return e.t==='burnout'})?'손패':'효과'}
 var body=g.bad||(res.length?res.join(', '):esc(fx||''));
 var calcs=g.ev.filter(function(e){return e.t==='dmg'&&e.calc}).map(function(e){return '<button class="calcb" data-calc="'+esc(JSON.stringify(Object.assign({},e.calc,{v:e.v,abs:e.absorbed||0})))+'">내역</button>'}).join('');
 return {html:'<i class="kd" style="background:'+KCOL[kindOf(g)]+'"></i>'+(who?who+' · ':'')+head+': '+body+calcs,dmg:dm}}
/* 전투 로그: 턴 탭(1~10) + 페이지 넘김(스크롤 없음, 기획지시 전투화면정리 5) */
function logHtml(){var T=S.hlog||{},turns=Object.keys(T).map(Number).sort(function(a,b){return a-b});if(!turns.length)return '<div class="mu">아직 기록이 없어요</div>';
 var t=T[S.logTab]?S.logTab:turns[turns.length-1],lines=T[t]||[],per=Math.max(3,Math.floor((innerHeight-(innerHeight<=500?48:56)-10-20-(innerHeight<=500?56:62)-30)/20)),pages=Math.max(1,Math.ceil(lines.length/per)),pg=Math.min(S.logPage||0,pages-1),mx=(S.st&&S.st.battle&&S.st.battle.rules.max_turn)||10,tabs='';
 for(var n=1;n<=mx;n++)tabs+='<button data-lt="'+n+'" class="'+(n===t?'on':'')+'"'+(T[n]?'':' disabled')+'>'+n+'</button>';
 return '<div class="ltabs">'+tabs+'</div><div class="lbody">'+(lines.slice(pg*per,(pg+1)*per).map(function(x){return '<div>'+x+'</div>'}).join('')||'<div class="mu">행동 없음</div>')+'</div><div class="lnav"><button id="lprev"'+(pg<=0?' disabled':'')+'>이전</button><span class="small mu">'+t+'턴 · '+(pg+1)+'/'+pages+'</span><button id="lnext"'+(pg>=pages-1?' disabled':'')+'>다음</button></div>'}
function bindLog(){document.querySelectorAll('[data-lt]').forEach(function(b){b.onclick=function(){S.logTab=Number(b.dataset.lt);S.logPage=0;refreshLog()}});
 if($('lprev'))$('lprev').onclick=function(){S.logPage=Math.max(0,(S.logPage||0)-1);refreshLog()};if($('lnext'))$('lnext').onclick=function(){S.logPage=(S.logPage||0)+1;refreshLog()}}
function refreshLog(){var wl=$('wlog');if(wl){wl.innerHTML=logHtml();bindLog();return}var p=$('logp');if(!S.showLog){if(p)p.remove();return}if(!p){p=document.createElement('div');p.id='logp';p.className='log';if(!$('bt'))return;$('bt').appendChild(p)}p.innerHTML=logHtml();bindLog()}

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
function play(ob,log,next){var you=next.you,side=function(s){return s===you?'me':'opp'};
 var rv={me:[],opp:[]};(log||[]).forEach(function(e){if(e.t==='reveal')rv[side(e.seat)]=revealCells(e)});
 var fake=JSON.parse(JSON.stringify(S.st));fake.phase='battle';fake.battle=JSON.parse(JSON.stringify(ob));var gone=(ob.me.mySubmission&&ob.me.mySubmission.cards)||(S.selTurn===ob.turn?S.sel.cards.slice():[]);fake.battle.me.hand=fake.battle.me.hand.filter(function(c){return gone.indexOf(c.uid)<0});fake.battle.me.mySubmission=null;fake.battle.opp.submitted=false;fake.reveal=null;
 var keep=S.st;S.st=fake;renderBattle(fake,rv);S.st=keep;
 var G=groupsOf(log,you),hp={me:ob.me.hp,opp:ob.opp.hp},sh={me:ob.me.shield,opp:ob.opp.shield},mx={me:ob.me.maxHp,opp:ob.opp.maxHp},used={me:{},opp:{}};
 var caps=G.map(function(g){return capOf(g,you,ob)}),sum=summaryOf(G,you);
 S.hlog=S.hlog||{};S.hlog[ob.turn]=caps.map(function(c){return c.html}).concat(['<span class="sumL">요약 · '+esc(sum)+'</span>']);S.logTab=ob.turn;S.logPage=0;if(S.showLog)refreshLog();
 S.oppRecent=(S.oppRecent||[]).filter(function(r){return r.turn!==ob.turn}).concat([{turn:ob.turn,ids:rv.opp.filter(function(x){return x.k!=='spell'&&x.k!=='active'}).map(function(x){return x.id})}]).slice(-3);
 // 시간(기획지시 전투UI개편 2): 확대 기본 2초(글자 수 따라 최대 3초, 행동 7개 이상이면 1초) + 이동 0.4 + 도착 0.3, 상한 reveal_max_sec(20초 가안), 속도 느리게/보통/빠르게
 var R=(next.battle&&next.battle.rules)||ob.rules||{},zb=(R.reveal_zoom_sec||2)*1000,cap=(R.reveal_max_sec||20)*1000,capAt=Date.now()+cap;
 var acts=G.filter(function(g){return g.k!=='end'}),big=acts.filter(function(g){return g.k!=='tick'&&g.k!=='rush'&&g.k!=='auto'}).length<7,spd=spk;
 var ztext=function(g){return g.k==='spell'?((S.data.spells[g.id]||{}).effect_text||''):g.k==='active'?(ch(g.seat===you?ob.me.char:ob.opp.char).active_text||''):g.id?(card(g.id).effect_text||''):''};
 var zt=function(g){return g.k==='tick'||g.k==='rush'||g.k==='auto'?0:big?Math.min(3000,zb+Math.max(0,Array.from(ztext(g)).length-20)*50):1000};
 var per=function(g){return g.k==='rush'?900:g.k==='tick'||g.k==='auto'?600:zt(g)+700},tot=400+acts.reduce(function(a,g){return a+per(g)},0)+(acts.length?0:1500),k=Math.min(1,cap/tot);
 // 처리 순서 막대(효과연출 3): 지금 행동은 빛나고 끝난 건 흐리게, 내/상대 테두리 구분, 최대 10개
 var bar=acts.filter(function(g){return g.k!=='rush'&&g.k!=='auto'}).slice(0,10),phc=$('phc');
 if(phc){phc.className='obar';phc.innerHTML=bar.map(function(g,i){var kd=kindOf(g),sd=g.seat==null?'':side(g.seat),ic=null;
  return '<i data-bi="'+G.indexOf(g)+'" class="'+sd+'" style="background:'+(ic?'url('+ic.url+') center/80% no-repeat,':'')+KCOL[kd]+'" data-tip="'+esc((sd==='me'?'나':sd?'상대':'')+' · '+(g.k==='card'||g.k==='void'||g.k==='counter'?card(g.id).name:g.k==='spell'?'스펠 '+sname(g.id):g.k==='active'?'액티브':'턴 끝')+' ('+g.ph+' '+PH[g.ph]+')')+'">'+(ic?'':KSH[kd])+'<sub>'+g.ph+'</sub></i>'}).join('')}
 var cellOf=function(sd,g,mark){var arr=rv[sd],kd=g.k==='active'?'active':g.k==='spell'?'spell':null;for(var i=0;i<arr.length;i++){var x=arr[i];if((kd?x.k===kd:x.id===g.id)&&!(mark&&used[sd][i])){if(mark)used[sd][i]=1;return $('rv_'+sd+i)}}return null};
 var face=function(sd){return $('side_'+sd)};
 var firsts=(function(){try{return JSON.parse(lsGet(firstKey())||'{}')}catch(e){return {}}})();
 var steps=[{d:400,f:function(){}}],lit=null,tm=null,done=false,i=0;
 var applyEv=function(e){var t=side(e.seat);
  if(e.t==='dmg'){if(e.absorbed){sh[t]=Math.max(0,sh[t]-e.absorbed);float(t,'-'+e.absorbed,'abs')}if(e.guard)float(t,'수호 0','abs');else if(e.v||!e.absorbed){hp[t]=Math.max(0,hp[t]-e.v);float(t,'-'+e.v,e.crit?'crit':e.src==='burn'?'burn':'')}if(e.crit&&navigator.vibrate)navigator.vibrate(40)}
  else if(e.t==='heal'){hp[t]=Math.min(mx[t],hp[t]+e.v);float(t,'+'+e.v,'heal')}else if(e.t==='shield'){sh[t]+=e.v;float(t,'실드 +'+e.v,'abs')}
  else if(e.t==='selfcost'){hp[t]=Math.max(0,hp[t]-e.v);float(t,'-'+e.v,'burn')}else if(e.t==='rewind'){hp[t]=e.to;float(t,'↺ '+e.to,'heal')}
  else if(e.t==='debuff')float(t,(ST[e.debuff]||[e.debuff])[0],'abs');else if(e.t==='blocked')float(t,'면역','abs');else if(e.t==='draw')float(t,'+'+e.n+'장','heal');else if(e.t==='gauge')float(t,'게이지 '+(e.v>0?'+':'')+e.v,'abs');
  bars(t,hp,sh,mx)};
 acts.forEach(function(g){var gi=G.indexOf(g),sd=g.seat==null?null:side(g.seat),kd=kindOf(g),col=KCOL[kd],D=per(g)*k;
  var tgt=(function(){var e=g.ev.find(function(x){return x.t==='dmg'||x.t==='debuff'||x.t==='blocked'});if(e)return side(e.seat);if(g.ev.length)return side(g.ev[0].seat);return kd==='attack'||kd==='silence'||kd==='disrupt'?(sd==='me'?'opp':'me'):sd})();
  var zoomD=zt(g)*k,flyD=(D-zoomD)*0.57,arrD=D-zoomD-flyD;
  steps.push({d:zoomD,f:function(){
   var bi=document.querySelector('.obar [data-bi="'+gi+'"]');document.querySelectorAll('.obar i.now').forEach(function(x){x.classList.remove('now');x.classList.add('past')});if(bi)bi.classList.add('now');
   document.querySelectorAll('.chips .chip').forEach(function(c){c.classList.toggle('on',Number(c.dataset.ph)===g.ph)});
   if(lit){lit.classList.remove('lit');lit.classList.add('done')}lit=sd?cellOf(sd,g,true):null;if(g.k==='counter'){lit=cellOf(sd,{k:'card',id:g.id},false)}if(lit){lit.classList.remove('done');lit.classList.add('lit');lit.style.setProperty('--kc',col)}if(g.lock&&lit)lockCell(lit,g.lock);if(lit&&g.ev.some(function(e){return e.t==='blocked'}))stamp(lit,'면역')
   bubble(lit||(sd?face(sd):null),sd,caps[gi].html,col,!!g.bad);logPush(caps[gi].html);
   if(g.k==='rush')banner('★ 폭주 시작 ★');
   var fk=g.k==='active'?'active':kd;if(FIRST[fk]&&!firsts[fk]&&g.k!=='tick'){firsts[fk]=1;lsSet(firstKey(),JSON.stringify(firsts));firstTip(FIRST[fk])}
   if(zoomD)zoom(g,sd,kd,col,zoomD,ob,lit)}});
  steps.push({d:flyD,f:function(){
   if(g.k==='counter'){var vEl=cellOf(side(1-g.seat),{k:'card',id:g.victim},false);fly(vEl,face(sd),col,flyD*0.5,false,function(){fly(face(sd),face(side(1-g.seat)),col,flyD*0.5)});lockCell(vEl,'반격')}
   else if(g.k==='void'){fly(lit||face(sd),face(tgt===sd?(sd==='me'?'opp':'me'):tgt),col,flyD,true);}
   else if(kd==='counter'&&g.k==='card'){fly(lit,face(sd),col,flyD);markWait(sd)}
   else if(g.k!=='rush'&&g.k!=='auto')fly(g.k==='tick'?null:lit,face(tgt),col,flyD,!!g.bad)}});
  steps.push({d:arrD,f:function(){g.ev.forEach(applyEv);if(g.ev.length&&tgt)pulse(face(tgt),col)}});
  steps.push({wait:1,d:0,f:function(){}})});
 steps.push({d:(acts.length?0:1500)*k,f:function(){logPush('<span class="sumL">요약 · '+esc(sum)+'</span>');var bb=$('bub');if(bb)bb.remove();if(!acts.length){var cp=$('cap');if(cp){cp.innerHTML='<span class="sumL">'+esc(sum)+'</span>';cp.className='cap show';cp.style.color=''}}document.querySelectorAll('.obar i.now').forEach(function(x){x.classList.remove('now');x.classList.add('past')})}});
 var finish=function(){if(done)return;done=true;clearTimeout(tm);dimOff();document.querySelectorAll('.zoom,.orb,#bub').forEach(function(x){x.remove()});S.anim=null;S.lastOpp=rv.opp;S.lastTurn=ob.turn;var p=S.pending||S.st;S.pending=null;S.st=p;
  if(p&&p.phase==='battle'&&p.battle&&p.battle.turn>ob.turn){S.revSent=p.battle.turn;send({type:'revealed',turn:p.battle.turn})}render()};
 S.anim={skip:finish};$('skip').onclick=finish;$('spd').onclick=function(){S.rspd=SPD_NEXT[S.rspd||'normal'];lsSet('play_rspd',S.rspd);this.textContent=SPD_LAB[S.rspd]};
 // 수동 진행(탭하면 다음 행동): 서버 공개 상한이 지나면 자동으로 이어 감(랭킹전에서 상대를 무한정 기다리게 하지 않음)
 var hint=null,waitOff=function(){S.anim.waiting=false;if(hint){hint.remove();hint=null}};
 S.anim.next=function(){if(!S.anim||!S.anim.waiting)return;waitOff();clearTimeout(tm);tick()};
 var tick=function(){if(done)return;if(i>=steps.length)return finish();var s=steps[i++];
  if(s.wait){if(S.manual&&manualOk()&&Date.now()<capAt-300){S.anim.waiting=true;hint=document.createElement('div');hint.className='manual';hint.textContent='탭하면 다음 행동 ▶';$('bt').appendChild(hint);tm=setTimeout(function(){waitOff();tick()},capAt-Date.now())}else tick();return}
  try{s.f()}catch(err){}tm=setTimeout(tick,s.d*spd())};tick()}
function spk(){return SPD_K[S.rspd||'normal']||1}
function logPush(html){S.logLines=(S.logLines||[]).concat([html]).slice(-6);var l=$('logline');if(l)l.innerHTML=S.logLines.slice(-2).map(function(x){return '<div>'+x+'</div>'}).join('')}
/* 확대(전투UX2차 1): 낸 슬롯에서 커져 나와 슬롯 쪽으로 돌아감. 가운데 띄우기 폐지. 확대 동안 행동 주체 캐릭터 카드·슬롯 줄만 남기고 어둡게 */
function dimOn(sd){var b=$('bt');if(!b||!sd)return;var d=$('dimv');if(!d){d=document.createElement('div');d.id='dimv';d.className='dimv';b.appendChild(d)}
 b.querySelectorAll('.up').forEach(function(x){x.classList.remove('up')});b.querySelectorAll(sd==='me'?'.mec,.meslots':'.oppc,.opslots').forEach(function(x){x.classList.add('up')})}
function dimOff(){var d=$('dimv');if(d)d.remove();document.querySelectorAll('#bt .up').forEach(function(x){x.classList.remove('up')})}
function zoom(g,sd,kd,col,d,ob,from){var b=$('bt');if(!b)return;var z=document.createElement('div');z.className='zoom';z.style.setProperty('--kc',col);var ms=Math.round(d*spk());
 var w=Math.round(Math.min(150,innerHeight*0.3*5/7)),who=sd==='me'?'나':'상대',body,title;
 if(g.k==='spell'){var ic=S.A.slots['SPELL_'+g.id];title='스펠 '+sname(g.id);body='<div class="zi" style="'+(ic?'background-image:url('+ic.url+')':'')+'"></div><p>'+esc((S.data.spells[g.id]||{}).effect_text||'')+'</p>'}
 else if(g.k==='active'){var chr=sd==='me'?ob.me.char:ob.opp.char;title='액티브 '+(ch(chr).active_name||'');body='<div class="zi face" style="'+faceCss(chr)+'"></div><p>'+esc(ch(chr).active_text||'')+'</p>'}
 else{title=card(g.id).name;body=bcCard(g.id,{w:w,mode:'hand'})+'<p>'+esc(card(g.id).effect_text||'')+'</p>'}
 z.innerHTML='<div class="zw '+(sd||'')+'"><div class="zt"><span>'+who+'</span> '+esc(title)+'</div>'+body+'</div>';b.appendChild(z);
 var br=b.getBoundingClientRect(),zr=z.getBoundingClientRect(),src=from||$('side_'+sd)||b,r=src.getBoundingClientRect(),cx=r.left-br.left+r.width/2,bw=(S.wide&&$('wdet'))?$('wdet').getBoundingClientRect().left-br.left-12:br.width;
 var x=Math.max(8,Math.min(bw-zr.width-8,cx-zr.width/2)),y=sd==='opp'?r.bottom-br.top+10:r.top-br.top-zr.height-10;y=Math.max(8,Math.min(br.height-zr.height-8,y));
 z.style.left=x+'px';z.style.top=y+'px';var dx=cx-(x+zr.width/2),dy=(r.top-br.top+r.height/2)-(y+zr.height/2),s0=Math.max(0.12,Math.min(0.5,r.width/zr.width));
 var at='translate('+dx+'px,'+dy+'px) scale('+s0+')';dimOn(sd);
 z.animate([{transform:at,opacity:.3},{transform:'none',opacity:1,offset:0.18},{transform:'none',opacity:1,offset:0.82},{transform:at,opacity:0}],{duration:ms,easing:'ease-out',fill:'both'});
 setTimeout(function(){z.remove();if(!document.querySelector('.zoom'))dimOff()},ms+40)}
/* 잠금 연출(전투UX2차 2): 무효가 된 카드는 그 카드 차례에 자물쇠 + 흑백, 이후 흐리게 유지 */
function lockCell(el,why){if(!el||el.classList.contains('locked'))return;el.classList.add('locked');var k=document.createElement('div');k.className='lk';k.innerHTML='🔒<small>'+esc(why)+'</small>';el.appendChild(k)}
function ctr(el){var r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}}
/* 빛 경로(사선구도 3): 낸 칸 → (반대편이면 가운데 사선 띠를 거쳐) → 대상 카드. 내 카드는 위쪽 30%, 상대 카드는 아래쪽 75% 지점을 겨눠 내 칸·상대 칸 위를 지나지 않게 */
function aimPt(el){var r=el.getBoundingClientRect();if(el.classList.contains('vc')){var me=el.id==='side_me';return {x:r.left+r.width/2,y:r.top+r.height*(me?0.3:0.75)}}return {x:r.left+r.width/2,y:r.top+r.height/2}}
function fly(from,to,col,d,breakMid,then){if(!to){then&&then();return}var b=$('bt');if(!b)return;var a=from?ctr(from):{x:innerWidth/2,y:innerHeight/2},z=aimPt(to),o=document.createElement('div');o.className='orb';o.style.setProperty('--kc',col);
 o.style.left=a.x+'px';o.style.top=a.y+'px';b.appendChild(o);var ms=Math.max(60,Math.round(d*spk()));
 var mid=null,cEl=b.querySelector('.center');if(cEl&&from&&(a.x-innerWidth/2)*(z.x-innerWidth/2)<0){var cr=cEl.getBoundingClientRect();mid={x:cr.left+cr.width/2,y:cr.top+cr.height/2}}
 var T=function(p,sc){return {transform:'translate(calc(-50% + '+(p.x-a.x)+'px),calc(-50% + '+(p.y-a.y)+'px)) scale('+sc+')'}};
 var end=breakMid?{x:a.x+(z.x-a.x)*0.5,y:a.y+(z.y-a.y)*0.5}:z,frames=[{transform:'translate(-50%,-50%) scale(.6)'}];if(mid&&!breakMid)frames.push(Object.assign(T(mid,0.85),{offset:0.5}));frames.push(T(end,1));
 o.animate(frames,{duration:ms,easing:'ease-in'}).onfinish=function(){if(breakMid){o.classList.add('brk');setTimeout(function(){o.remove()},250)}else o.remove();then&&then()}}
function pulse(el,col){if(!el)return;el.style.setProperty('--kc',col);el.classList.remove('hit');void el.offsetWidth;el.classList.add('hit')}
function markWait(sd){var f=$('face_'+sd);if(!f)return;var w=document.createElement('span');w.className='wait';w.textContent='반격 대기';f.parentElement.appendChild(w)}
/* 효과 자막 = 해당 슬롯 옆 말풍선(사선구도 4-1): 내 칸은 위, 상대 칸은 아래 */
function bubble(el,sd,html,col,bad){var b=$('bt');if(!b)return;var o=$('bub');if(!o){o=document.createElement('div');o.id='bub';b.appendChild(o)}o.className='bub '+(sd||'')+(bad?' bad':'');o.style.setProperty('--kc',col||'#8a90a8');o.innerHTML=html;
 if(!el){o.style.left='50%';o.style.top='50%';o.style.transform='translate(-50%,-50%)';return}var r=el.getBoundingClientRect(),br=b.getBoundingClientRect(),x=r.left-br.left+r.width/2,w=o.offsetWidth;x=Math.max(w/2+6,Math.min(br.width-w/2-6,x));o.style.left=x+'px';
 if(sd==='opp'){o.style.top=(r.bottom-br.top+6)+'px';o.style.transform='translateX(-50%)'}else{o.style.top=(r.top-br.top-6)+'px';o.style.transform='translate(-50%,-100%)'}}
function firstTip(t){var b=$('bt');if(!b)return;var e=document.createElement('div');e.className='first';e.innerHTML='<b>처음 보는 종류</b> '+esc(t);b.appendChild(e);setTimeout(function(){e.remove()},3200)}
function bars(sd,hp,sh,mx){var w=Math.max(0,100*hp[sd]/mx[sd]),sw=Math.min(100-w,100*sh[sd]/mx[sd]);
 $('hp_'+sd).style.width=w+'%';$('gh_'+sd).style.width=w+'%';var s=$('sh_'+sd);s.style.left=w+'%';s.style.width=sw+'%';$('hpt_'+sd).textContent=hp[sd]+'/'+mx[sd];$('sht_'+sd).textContent=sh[sd]?'+'+sh[sd]:''}
function float(sd,txt,cls){var host=$('side_'+sd);if(!host)return;var f=document.createElement('div');f.className='float '+(cls||'');f.textContent=txt;var n=host.querySelectorAll('.float').length;f.style.left='50%';f.style.top=(28+n*14)+'%';host.appendChild(f);setTimeout(function(){f.remove()},1700)}
function banner(t){var b=document.createElement('div');b.className='banner';b.textContent=t;$('bt').appendChild(b);setTimeout(function(){b.remove()},1300)}
function stamp(el,t){if(!el)return;var s=document.createElement('div');s.className='stamp';s.textContent=t;el.appendChild(s)}

/* ---------- 결과 ---------- */
/* 결과(재배치 4): 1:1 분할. 왼쪽 50% = 전신 PNG의 카드 영역(3:4)만, 공용 어두운 배경, 폭을 꽉 채우고 위 맞춤(넘치는 아래는 잘림), 아래 35% 마스크. 오른쪽 50% = 데이터 */
function artFill(id,w){var a=((S.A.art||{})[id]||{})['000']||{},src=a.full;if(!src)return '';return 'background-image:url('+src.url+')'}
function renderResult(m){var L=m.last||{},you=m.you,win=L.outcome!=='draw'&&L.outcome!=='void'&&((L.outcome==='a')===(you===0)),draw=L.outcome==='draw',mine=(L.picks||[])[you];
 var f=safe(),st=(L.stats||[])[you]||{},hp=(L.hp||[])[you]||[0,1],half=Math.floor((innerWidth-f.l-f.r)/2),stat=function(lab,v){return '<div class="st"><small>'+lab+'</small><b>'+v+'</b></div>'};
 var mode=m.mode,rk=L.rank&&L.rank[you],ec=L.econ&&L.econ[you];
 $('app').innerHTML='<div class="res3'+(win?' win':draw?' draw':' lose')+'"><div class="rl"><div class="rimg" style="'+(mine?artFill(mine,half):'')+'"></div></div>'
  +'<div class="rr"><button class="ib rmenu" id="rmore" title="더보기">⋯</button><h2>'+(draw?'무승부':L.outcome==='void'?'결과 없음':win?'승리':'패배')+'</h2><div class="mu small">'+esc(REASON[L.reason]||L.reason||'')+(mine?' · '+esc(ch(mine).name):'')+'</div>'
  +'<div class="stats">'+stat('판 길이',(L.turn||0)+'턴')+stat('준 피해',st.dealt!=null?st.dealt:'-')+stat('받은 피해',st.taken!=null?st.taken:'-')+stat('실드로 막은 피해',st.blocked!=null?st.blocked:'-')+stat('남은 HP',Math.round(100*hp[0]/hp[1])+'%')+'</div>'
  +'<div class="rew">'+(rk?'<div>RP '+(rk.rpDelta>=0?'+':'')+rk.rpDelta+' → '+rk.rp+'</div>':'')+(ec&&ec.gold?'<div>골드 +'+ec.gold+'</div>':'')+(mode==='practice'?'<div class="mu small">AI 대전은 RP·숙련도 변화가 없어요(총괄 8장)</div>':'')+'</div>'
  +'<div class="row" style="gap:8px"><button id="home">로비</button><button class="pri confirm" id="again">다시 하기 (Enter)</button></div></div></div>';
 $('home').onclick=function(){quit();home()};$('again').onclick=again;
 $('rmore').onclick=function(){ask('신고 — 상대: '+(m.members[1-you]&&m.members[1-you].ai?'AI (신고 대상 아님)':'상대 플레이어')+'. 정식 신고는 상세 13 사유로 접수돼요(테스트 화면은 접수하지 않음).','닫기',function(){})}}
function again(){quit();var d=localStorage.getItem('play_dev');api('/v1/practice',{difficulty:S.diff,defaults:defs()}).then(function(j){S.st=null;S.load=null;connect(j.code)}).catch(function(){login(d).then(function(){return api('/v1/practice',{difficulty:S.diff,defaults:defs()})}).then(function(j){connect(j.code)}).catch(function(e){home(e.message)})})}

/* ---------- 타이머·홀로·키 ---------- */
setInterval(function(){var m=S.st;if(!m||S.anim)return;var t=m.phase==='battle'?m.deadline:m.phaseDeadline,s=left(t);
 var tm=$('tm');if(tm){tm.textContent=t?s+'초':'';tm.className='timer'+(s<=5?' red':'')}
 var rt=$('rt'),rg=$('ring');if(rt&&rg){rt.textContent=s;var tot=((m.battle&&m.battle.rules.turn_select_sec)||60)*1000;rg.style.setProperty('--p',Math.max(0,Math.min(1,(t-now())/tot)));rg.classList.toggle('red',s<=10&&!m.battle.me.mySubmission);if(m.phase==='battle'&&s<=10&&s>0&&!m.battle.me.mySubmission&&S.vibTurn!==m.battle.turn){S.vibTurn=m.battle.turn;if(navigator.vibrate)navigator.vibrate(60)}}
 var cp=$('cap');if(cp&&m.phase==='battle'&&!m.battle.me.mySubmission){var any=S.sel.cards.length||S.sel.spell||S.sel.active,msg=s<=10?'⏱ 확정 안 하면 이번 턴은 아무것도 안 나가요'+(any?'(고른 것 포함)':''):'';if(cp.textContent!==msg){cp.textContent=msg;cp.className='cap'+(msg?' show warn':'')}}},250);
function holo(){if(S.hraf)return;var t0=performance.now(),step=function(n){var els=document.querySelectorAll('.pvc');if(!els.length){S.hraf=0;return}
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
var rz;addEventListener('resize',function(){clearTimeout(rz);rz=setTimeout(function(){applySafe();if(S.st&&!S.anim)render()},150)});
boot();
</script></body></html>`;
