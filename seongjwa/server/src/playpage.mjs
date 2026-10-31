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
#net{position:fixed;left:0;right:0;top:0;z-index:120;text-align:center;font-weight:700;font-size:13px;padding:max(6px,env(safe-area-inset-top)) 12px 6px;background:#c99a1f;color:#1b1400}
#net.off{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(8,10,22,.92);color:var(--tx);font-size:18px}
.hint{max-width:420px;background:rgba(127,180,255,.12);border:1px solid rgba(127,180,255,.35);border-radius:12px;padding:8px 12px;font-size:13px}
#app::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(8,10,22,.25),rgba(8,10,22,.75))}
.scr{position:absolute;inset:0;display:flex;flex-direction:column;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
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
.grid{flex:1;overflow:auto;display:flex;flex-wrap:wrap;gap:22px 18px;justify-content:center;align-content:flex-start;padding:18px 6px}
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
.bc.picked{transform:translateY(-16%);box-shadow:0 0 0 3px var(--acc),0 10px 22px -6px rgba(79,141,255,.8)}
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
.hand .bc:hover{z-index:6;transform:translateY(-8%)}.hand .bc.picked:hover{transform:translateY(-18%)}
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
.res h2{margin:0;font-size:56px;letter-spacing:6px}.res h2.win{color:var(--gold);text-shadow:0 0 24px rgba(255,213,107,.6)}.res h2.lose{color:#c8cbe0;opacity:.85}
.lo{display:flex;gap:16px;flex:1;min-height:0;align-items:flex-start;justify-content:center;flex-wrap:wrap;overflow:auto;padding:10px 0}
.vs{display:flex;align-items:center;gap:14px}.vs b{font-size:22px;color:var(--mu)}
.box{background:var(--pan);border:1px solid var(--line);border-radius:14px;padding:12px;max-width:560px;width:100%}
.box h3{margin:0 0 8px;font-size:14px}
.spg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.spb{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;font-size:12px;border-radius:10px}
.spb i{width:40px;height:40px;background:center/contain no-repeat}.spb small{color:var(--mu);font-size:10px;line-height:1.3}
.deck{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;justify-content:center}
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
@media (max-height:500px){
 .scr{padding:max(4px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}
 .home{gap:10px}h1{font-size:22px}.bt{gap:2px}.top{min-height:0}
 .face{width:34px;height:34px}.side{padding:3px 8px;gap:6px;border-radius:10px}.hpbar{height:8px;margin:2px 0}.hptx{font-size:10px}.nmrow{font-size:13px}
 .sp{width:30px;height:30px}.sp small{display:none}.opps button{padding:4px 8px;font-size:12px}.eng{font-size:10px}.eng b{font-size:13px!important}
 .ring{width:36px;height:36px;font-size:13px}.ring::before{inset:4px}.chip{padding:1px 6px;font-size:10px}.turn{font-size:12px;min-width:44px}.turn small{font-size:9px}
 .cap{min-height:16px;font-size:12px}.field{gap:1px}.slots.opp{margin-bottom:12px}.slots:not(.opp){margin-top:13px}.slot .lab{font-size:9px;padding:0 5px;top:calc(-1.45em - 2px)}.slots.opp .slot .lab{bottom:calc(-1.45em - 2px)}
 .ctl{padding:5px 7px;gap:4px;border-radius:10px}.act{padding:4px;font-size:11px;margin-top:0}.confirm{padding:7px 6px;font-size:13px}#tb,#spd{padding:6px;font-size:11px}.orbs i{width:11px;height:11px}
 .hand{padding-top:10px}.bot{grid-template-columns:minmax(150px,1fr) auto minmax(170px,1fr)}
 .grid{gap:12px 10px;padding:8px 4px}.res{gap:8px}.res h2{font-size:38px}.box{padding:8px}.spb{padding:4px 2px}.spb i{width:28px;height:28px}
}
</style></head><body><div id="app"></div><div id="rot"><i>📱</i><b>가로로 돌려 주세요</b><span class="mu small">전투 화면은 가로 전용이에요</span></div>
<script>
var S={tok:null,data:null,A:null,ws:null,st:null,prev:null,sel:{cards:[],spell:null,active:false},selTurn:0,diff:localStorage.getItem('play_diff')||'normal',anim:null,pending:null,load:null,off:0,showLog:false,hist:[],spd:localStorage.getItem('play_spd')==='2',lastOpp:null,lastTurn:0};
var KIND_KO={immune:'면역',defense:'방어',counter:'반격',silence:'침묵',disrupt:'방해',skill:'스킬',attack:'공격'};
var KIND_SLOT={immune:'IMMUNE',defense:'DEFENSE',counter:'COUNTER',silence:'SILENCE',disrupt:'DISRUPT',skill:'SKILL',attack:'ATTACK'};
var KIND_ORD={attack:0,defense:1,counter:2,silence:3,disrupt:4,skill:5,immune:6};
var FAC={'불':'FIRE','물':'WATER','바람':'WIND'};
var ST={burn:['작열','BURN'],mark:['표식','MARK'],weak:['약화','WEAKEN'],activeSeal:['액티브 봉인','SILENCE'],skillBlock:['스킬 봉쇄','SKILL_LOCK'],energyDown:['에너지 감소','ENERGY_DOWN'],immune:['면역','IMMUNE'],healBoost:['회복 증가',''],spdUp:['속도 증가',''],inferno:['업화','ATK_UP'],greatTide:['대조류','TIDE'],noCarry:['실드 이월 불가',''],handSeal:['손패 봉인','HAND_SEAL'],tide:['조류','TIDE']};
var ERR={surrender_too_early:'항복은 4턴부터 할 수 있어요',timebank_used:'타임뱅크는 판당 1회예요',turn_mismatch:'이미 지난 턴이에요'};
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
function bcCard(id,o){var k=card(id),sl=S.A.slots,art=sl['CARD_ART_'+id],ks=sl['KIND_'+KIND_SLOT[k.kind]],lay='',own=k.owner_character;
 if(own){var c=ch(own),a=((S.A.art||{})[own]||{})['000']||{},f=a.full,cr=a.card,fb=slotU('CARD_BG_'+(FAC[c.faction]||'NEUTRAL'));
  lay='<div class="l art" style="'+(fb?'background-image:'+fb:'background:#334')+'"></div>';
  if(f){if(cr){var iw=100/cr.w,ih=iw*(f.h/f.w)*(5/7);lay+='<div class="l" style="background-image:url('+f.url+');background-repeat:no-repeat;background-size:'+iw.toFixed(1)+'% '+ih.toFixed(1)+'%;background-position:'+(cr.w>=1?0:cr.x/(1-cr.w)*100).toFixed(1)+'% '+(cr.h>=1?0:cr.y/(1-cr.h)*100).toFixed(1)+'%"></div>'}else lay+='<div class="l" style="background:url('+f.url+') center 10%/cover no-repeat"></div>'}}
 else if(art)lay='<div class="l art" style="background-image:url('+art.url+')"></div>';
 else lay='<div class="l art" style="'+(sl.CARD_BG_NEUTRAL?'background-image:'+slotU('CARD_BG_NEUTRAL'):'background:linear-gradient(160deg,#3a4058,#1b1f2e)')+'"></div><div class="symt">'+esc(KIND_KO[k.kind]||k.kind)+'</div>';
 var fr=sl.CARD_FRAME,cost=o.cost==null?k.cost:o.cost,kicon=ks?'<i style="width:70%;aspect-ratio:1;background:url('+ks.url+') center/contain no-repeat"></i>':'<i class="kt">'+esc(KIND_KO[k.kind]||k.kind)+'</i>';
 return '<div class="bc'+(o.mode==='hand'?' hand':'')+(o.cls?' '+o.cls:'')+'" style="--w:'+o.w+'px;width:'+o.w+'px"'+(o.attr||'')+' title="'+esc(k.name+' · '+(KIND_KO[k.kind]||'')+' '+cost+'E\n'+(k.effect_text||''))+'">'+lay+'<div class="l shade"></div>'+(fr?'<div class="l frm" style="background-image:url('+fr.url+')"></div>':'')
  +'<div class="sock c'+(fr?'':' nos')+'"><b>'+cost+'</b></div><div class="sock k'+(fr?'':' nos')+'">'+kicon+'</div>'
  +(own?'<div class="own">전용</div>':'')+'<div class="txt"><div class="nm">'+esc(k.name)+'</div>'+(o.mode==='hand'?'':'<div class="tx">'+esc(k.effect_text)+'</div>')+'</div>'+(o.extra||'')+'</div>'}
function backCard(w,extra){return '<div class="bc back" style="--w:'+w+'px;width:'+w+'px;'+(S.A.slots.CARD_BACK?'background-image:'+slotU('CARD_BACK'):'background:linear-gradient(160deg,#2a3a7a,#141a3a)')+'">'+(extra||'')+'</div>'}
function faceCss(id){var a=((S.A.art||{})[id]||{})['000']||{},f=a.full,r=a.faceRect;
 if(f&&r){var s=100/r.w;return 'background-image:url('+f.url+');background-size:'+s.toFixed(1)+'% auto;background-position:'+(r.w>=1?0:r.x/(1-r.w)*100).toFixed(1)+'% '+(r.h>=1?0:r.y/(1-r.h)*100).toFixed(1)+'%'}
 if(a.thumb||f)return 'background-image:url('+(a.thumb||f).url+');background-size:220% auto;background-position:50% 8%';return ''}

/* ---------- 시작 ---------- */
function boot(){
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
 +'<div class="small mu" style="max-width:420px">소리·컷인·다듬은 효과는 빠진 느낌 확인용이에요. 키: 1~7 카드 · Q/W 스펠 · E 액티브 · Space 확정 · T 타임뱅크 · L 로그</div></div>';
 document.querySelectorAll('[data-d]').forEach(function(b){b.onclick=function(){S.diff=b.dataset.d;localStorage.setItem('play_diff',S.diff);home()}});
 if($('inst'))$('inst').onclick=function(){PWA.install()};if($('ihok'))$('ihok').onclick=function(){lsSet('pwa_ios_hint','1');$('ihint').remove()};
 $('go').onclick=function(){var d=$('dev').value.trim().toLowerCase();if(!/^[a-z0-9_-]{3,32}$/.test(d)){toast('아이디는 영문 소문자·숫자 3~32자');return}localStorage.setItem('play_dev',d);start(d)};
 var code=sessionStorage.getItem('play_room');if(code&&!msg){if(S.tok)connect(code);else login(dev).then(function(){connect(code)}).catch(function(){sessionStorage.removeItem('play_room')})}}
window.onPwaChange=function(){if(!S.st&&S.data&&$('go'))home()};
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function login(d){return api('/v1/auth/dev',{devId:d}).then(function(j){S.tok=j.accessToken})}
function start(d){$('go').disabled=true;login(d).then(function(){return api('/v1/practice',{difficulty:S.diff,defaults:{preferred:['SE','AU','UM'],spells:['SP01','SP04'],preset:2}})}).then(function(j){connect(j.code)}).catch(function(e){home('시작 실패: '+e.message)})}
function connect(code){sessionStorage.setItem('play_room',code);if(S.room!==code){S.room=code;S.hist=[];S.lastOpp=null}api('/v1/rooms/'+code+'/ticket',{}).then(function(j){
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
function renderPick(m){var P=m.prep,vw=innerWidth,W=Math.min(vw>=1000?150:vw>=700?130:Math.max(92,Math.floor((vw-60)/3)),Math.max(80,Math.floor((innerHeight-110)/2.15/1.4))),fm=frameOf(P.frame.mine);
 var h='<div class="scr">'+topBar(m,P.myPick?'선택 완료 · 상대 '+(P.oppPickDone?'완료':'선택 중'):'캐릭터를 고르세요 (동시·비공개)')+'<div class="grid pick">';
 P.characters.forEach(function(id){var c=ch(id),ban=P.banned.indexOf(id)>=0,badge=(P.mastery.mine||{})[id]||1;
  h+=pvCard(id,{w:W,tier:fm.tier,holo:fm.holo,badge:badge,sub:(c.job||'')+' · '+(c.role||''),cls:(ban?'ban':'')+(P.myPick===id?' sel':''),attr:' data-pick="'+id+'"'})});
 h+='</div><div class="row" style="justify-content:space-between"><button id="qt">나가기</button><div class="small mu" id="pinfo">카드를 누르면 바로 확정돼요</div></div></div>';
 $('app').innerHTML=h;
 document.querySelectorAll('[data-pick]').forEach(function(el){el.onclick=function(){if(P.myPick||P.banned.indexOf(el.dataset.pick)>=0)return;send({type:'pick',characterId:el.dataset.pick})};
  el.onmouseenter=function(){var c=ch(el.dataset.pick);$('pinfo').textContent=c.name+' · 패시브 '+c.passive_name+': '+c.passive_text+' / 액티브 '+c.active_name+': '+c.active_text}});
 $('qt').onclick=function(){quit();home()};holo()}
function renderLoadout(m){var P=m.prep,vw=innerWidth,W=Math.min(vw>=700?150:110,Math.max(80,Math.floor((innerHeight-130)/1.4))),fm=frameOf(P.frame.mine),fo=frameOf(P.frame.opp);
 S.load=S.load||{spells:['SP01','SP04'],preset:2};var L=P.myLoadout||S.load,done=!!P.myLoadout;
 var mine=(S.data.presets[P.myPick]||[]).find(function(x){return x.slot===L.preset})||{cards:[]};
 var h='<div class="scr">'+topBar(m,done?'준비 완료 · 상대 '+(P.oppLoadoutDone?'완료':'선택 중'):'스펠 2개와 덱을 고르세요')+'<div class="lo">'
 +'<div class="vs">'+pvCard(P.myPick,{w:W,tier:fm.tier,holo:fm.holo,badge:(P.mastery.mine||{})[P.myPick]||1,sub:'나'})+'<b>VS</b>'+pvCard(P.oppPick,{w:W,tier:fo.tier,holo:fo.holo,badge:(P.mastery.opp||{})[P.oppPick]||1,sub:'상대 (AI)'})+'</div>'
 +'<div class="box"><h3>스펠 (2개)</h3><div class="spg">'+Object.keys(S.data.spells).map(function(id){var s=S.data.spells[id],ic=S.A.slots['SPELL_'+id];
  return '<button class="spb'+(L.spells.indexOf(id)>=0?' on':'')+'" data-sp="'+id+'"'+(done?' disabled':'')+'>'+(ic?'<i style="background-image:url('+ic.url+')"></i>':'')+'<b>'+esc(s.name)+'</b><small>쿨 '+s.cooldown+'턴 · '+esc(s.effect_text)+'</small></button>'}).join('')+'</div>'
 +'<h3 style="margin-top:14px">덱</h3><div class="row">'+(S.data.presets[P.myPick]||[]).map(function(p){return '<button data-pre="'+p.slot+'" class="'+(L.preset===p.slot?'on':'')+'"'+(done?' disabled':'')+'>'+({aggro:'공세',balance:'균형',defense:'수비'}[p.style]||p.style)+' 덱</button>'}).join('')+'</div>'
 +'<div class="deck">'+mine.cards.map(function(id){return bcCard(id,{w:vw>=700?74:58,mode:'hand',attr:' data-cid="'+id+'"'})}).join('')+'</div></div></div>'
 +'<div class="row" style="justify-content:space-between"><button id="qt">나가기</button><button class="pri confirm" id="ok"'+(done||L.spells.length!==2?' disabled':'')+'>'+(done?'대기 중…':'준비 완료 (Space)')+'</button></div></div>';
 $('app').innerHTML=h;
 document.querySelectorAll('[data-sp]').forEach(function(b){b.onclick=function(){var id=b.dataset.sp,i=S.load.spells.indexOf(id);if(i>=0)S.load.spells.splice(i,1);else{if(S.load.spells.length>=2)S.load.spells.shift();S.load.spells.push(id)}render()}});
 document.querySelectorAll('[data-pre]').forEach(function(b){b.onclick=function(){S.load.preset=Number(b.dataset.pre);render()}});
 $('ok').onclick=confirmLoad;$('qt').onclick=function(){quit();home()};holo()}
function confirmLoad(){var P=S.st.prep;if(P.myLoadout||S.load.spells.length!==2)return;send({type:'loadout',spells:S.load.spells,preset:S.load.preset})}

/* ---------- 전투 ---------- */
function effCosts(me,uids){var free=me.freeOneCost||0;return uids.map(function(u){var c=me.hand.find(function(x){return x.uid===u});if(!c)return 0;if(free>0&&c.cost===1){free--;return 0}return c.cost})}
function sumCost(me,uids){return effCosts(me,uids).reduce(function(a,b){return a+b},0)}
function phOf(id){var p=card(id).phase;return p==null?4:Number(p)}
function phLab(id){var p=phOf(id);return p+' '+PH[p]+(card(id).kind==='counter'?' · 반격 대기':'')}
function byPhase(list,idOf){return list.map(function(x,i){return {x:x,i:i,p:phOf(idOf(x))}}).sort(function(a,b){return a.p-b.p||a.i-b.i}).map(function(o){return o.x})}
function sizes(n){var W=innerWidth,H=innerHeight,narrow=W<=760;
 var short=H<=500,cwH=H*(narrow?0.2:0.26)*5/7,avail=narrow?W-20:W-2*(short?175:230)-40,ov=false,cw=cwH;
 if(n*cw+(n-1)*6>avail){ov=true;cw=Math.min(cwH,avail/(n*0.7+0.3))}
 var sw=Math.min(H*(narrow?0.135:short?0.17:0.165)*5/7,(W-60)/3.4);
 return {cw:Math.floor(cw),sw:Math.floor(sw),ov:ov,detail:cw>=257,narrow:narrow}}
function sideHtml(p,who,m){var c=ch(p.char),fac=S.A.slots['FACTION_'+FAC[c.faction]],max=p.maxHp,hp=p.hp,sh=Math.min(p.shield,max);
 var w=Math.max(0,100*hp/max),sw=Math.min(100-w,100*sh/max),lim=innerWidth<=760?3:5,st=p.status.slice();if(p.shield>0)st.unshift({k:'shield',v:p.shield});
 var icons=st.slice(0,lim).map(function(s){var d=s.k==='shield'?['실드','SHIELD']:ST[s.k]||[s.k,''],u=d[1]?S.A.slots['STATUS_'+d[1]]:null,n=s.n||s.left||'';
  var lab=s.k==='tide'?(s.flood?'만조':s.ebb?'간조':'조류'):d[0];return '<i title="'+esc(lab+(s.left?' '+s.left+'턴':'')+(s.n?' ×'+s.n:''))+'" style="'+(u?'background-image:url('+u.url+')':'')+'">'+(u?'':esc(lab.slice(0,2)))+(n&&s.k!=='shield'?'<b>'+n+'</b>':'')+'</i>'}).join('')+(st.length>lim?'<i>+'+(st.length-lim)+'</i>':'');
 return '<div class="face" id="face_'+who+'" style="'+faceCss(p.char)+'"></div><div class="info"><div class="nmrow">'+(fac?'<i style="background-image:url('+fac.url+')"></i>':'')+esc(c.name)+(who==='opp'&&p.submitted&&m.phase==='battle'?' <span class="chip on" style="font-size:10px;padding:0 6px">확정</span>':'')+'</div>'
  +'<div class="hpbar"><div class="gh" id="gh_'+who+'" style="width:'+w+'%"></div><div class="hp" id="hp_'+who+'" style="width:'+w+'%"></div><div class="sh" id="sh_'+who+'" style="left:'+w+'%;width:'+sw+'%"></div></div>'
  +'<div class="hptx"><span id="hpt_'+who+'">'+hp+'/'+max+'</span><span id="sht_'+who+'" style="color:var(--sh)">'+(sh?'실드 '+sh:'')+'</span><div class="sts">'+icons+'</div></div>'
  +'<div class="gauge" title="게이지 '+p.gauge+'"><i style="width:'+Math.min(100,p.gauge)+'%"></i></div></div>'}
function spellBtns(p,mine,sub){return Object.keys(p.spells).map(function(id,i){var cd=p.spells[id],ic=S.A.slots['SPELL_'+id],on=mine&&(S.sel.spell===id||(sub&&sub.spell===id));
 return '<button class="sp'+(on?' on':'')+'" '+(mine?'data-spell="'+id+'"':'')+' title="'+esc(sname(id)+' · '+(S.data.spells[id]||{}).effect_text)+'" style="'+(ic?'background-image:url('+ic.url+')':'')+'"'+(mine&&(sub||cd>0)?' disabled':'')+'>'+(ic?'':'<span style="font-size:10px">'+esc(sname(id))+'</span>')+(cd>0?'<b>'+cd+'</b>':'')+(mine?'<small>'+(i?'W':'Q')+'</small>':'')+'</button>'}).join('')}
/* 슬롯: 처리 순서(0→5)로 정렬, 단계 라벨은 슬롯 바깥(기획지시 전투가독성 1) */
function slotsHtml(items,mine,sw,tag,cls){var h='';for(var i=0;i<3;i++){var x=items[i];h+='<div class="slot'+(mine?' mine':'')+'">'+(x?(x.ph==null?'':'<span class="lab">'+phLab(x.id)+'</span>')+x.html:'')+'</div>'}
 return '<div class="slots'+(mine?'':' opp')+(cls?' '+cls:'')+'" style="--sw:'+sw+'px">'+h+(tag?'<span class="tag">'+tag+'</span>':'')+'</div>'}
function renderBattle(m,reveal){var b=m.battle,me=b.me,op=b.opp,sub=me.mySubmission,z=sizes(me.hand.length);
 if(S.selTurn!==b.turn){S.sel={cards:[],spell:null,active:false};S.selTurn=b.turn}
 var hand=me.hand.slice().sort(function(x,y){var a=card(x.id),c=card(y.id);return x.cost-y.cost||(KIND_ORD[a.kind]-KIND_ORD[c.kind])||x.uid-y.uid});
 var chosen=sub?sub.cards:S.sel.cards,used=sumCost(me,chosen);
 var max=b.rules.cards_per_turn_max||3,full=chosen.length>=max,opItems=[],meItems=[],opTag='',opCls='';
 var it=function(id,o){return {id:id,ph:phOf(id),html:bcCard(id,Object.assign({w:z.sw,mode:'hand',attr:' data-cid="'+id+'"'+(o&&o.attr||'')},o&&o.cost!=null?{cost:o.cost}:{}))}};
 if(reveal){opItems=reveal.opp.map(function(id,i){return it(id,{attr:' id="rv_opp'+i+'"'})});meItems=reveal.me.map(function(id,i){return it(id,{attr:' id="rv_me'+i+'"'})})}
 else{
  if(op.submitted){for(var i=0;i<3;i++)opItems.push({ph:null,html:backCard(z.sw)});opTag='확정'}
  else if(S.lastOpp&&S.lastTurn===b.turn-1&&S.lastOpp.length){opItems=S.lastOpp.map(function(id){return it(id)});opTag='지난 턴';opCls='old'}
  byPhase(chosen,function(u){var c=me.hand.find(function(x){return x.uid===u});return c?c.id:''}).forEach(function(u){var c=me.hand.find(function(x){return x.uid===u});if(c)meItems.push(it(c.id,{attr:' data-unpick="'+u+'"'}))})}
 var tl=left(m.deadline),red=tl<=5;
 var h='<div class="scr bt" id="bt">'
 +'<div class="top" style="align-items:stretch"><div class="side" id="side_opp" style="flex:1;max-width:380px">'+sideHtml(op,'opp',m)+'</div>'
 +'<div class="backs" style="--w:'+Math.round(z.sw*0.42)+'px">'+Array.from({length:Math.min(op.handCount,7)},function(){return backCard(Math.round(z.sw*0.42))}).join('')+'</div>'
 +'<div class="side opps" style="gap:8px"><div class="spl">'+spellBtns(op,false)+'</div><div class="small eng" style="text-align:center">상대 에너지<br><b style="font-size:16px">'+op.energy+'</b></div><button id="logb" title="전투 로그 (L)">로그</button><button id="menu">⋯</button></div></div>'
 +'<div class="field">'+slotsHtml(opItems,false,z.sw,opTag,opCls)
 +'<div class="mid"><div class="turn">턴 '+b.turn+'/'+b.rules.max_turn+(b.turn>=b.rules.rush_start_turn?'<small class="rush">폭주 중</small>':b.turn===b.rules.rush_start_turn-1?'<small class="rush">다음 턴 폭주</small>':'<small>&nbsp;</small>')+'</div>'
 +'<div class="chips" id="phc">'+PH.map(function(t,i){return '<span class="chip" data-ph="'+i+'">'+(z.narrow?i:i+' '+t)+'</span>'}).join('')+'</div>'
 +'<div class="ring'+(red&&!reveal?' red':'')+'" id="ring"><span id="rt">'+(reveal?'':tl)+'</span></div></div>'
 +'<div class="cap" id="cap">'+(sub&&!reveal?'확정했어요 · 상대를 기다리는 중':'')+'</div>'
 +slotsHtml(meItems,true,z.sw)+'</div>'
 +'<div class="bot"><div class="side me" id="side_me">'+sideHtml(me,'me',m)+'</div>'
 +'<div class="hand'+(z.ov?' ov':'')+'" style="--cw:'+z.cw+'px">'+hand.map(function(c,i){var picked=chosen.indexOf(c.uid)>=0,cant=!picked&&sumCost(me,chosen.concat([c.uid]))>me.energy,cls=picked?'picked':c.sealed?'lock':cant?'cant':full?'dim':'';
  return bcCard(c.id,{w:z.cw,mode:z.detail?'detail':'hand',cls:cls,attr:' data-uid="'+c.uid+'" data-i="'+i+'" data-cid="'+c.id+'"'})}).join('')+'</div>'
 +'<div class="ctl"><div class="row" style="justify-content:space-between"><div class="orbs" title="내 에너지: 고른 카드 비용만큼 비워서 보여 줘요">'+Array.from({length:Math.max(me.energy,0)},function(_,i){return '<i class="'+(i>=me.energy-used?'use':'')+'"></i>'}).join('')+'<span class="small" style="margin-left:4px">'+(me.energy-used)+'/'+me.energy+'</span>'
 +(me.freeOneCost&&!reveal?'<span class="small" style="color:var(--hp);margin-left:4px" title="실피 패시브: 매 턴 처음 내는 1E 카드 비용 0">순풍 첫 1E 무료</span>':'')+'</div>'
 +'<div class="spl">'+spellBtns(me,true,sub)+'</div></div>'
 +'<button class="act'+(me.gauge>=100&&!sub&&!reveal?' ready':'')+(!reveal&&(S.sel.active||(sub&&sub.active))?' on':'')+'" id="act"'+(sub||reveal||me.gauge<100?' disabled':'')+'>액티브 · '+esc(ch(me.char).active_name||'')+' (E) '+Math.min(100,me.gauge)+'%</button>'
 +(reveal?'<div class="row" style="flex-wrap:nowrap"><button id="spd" class="'+(S.spd?'on':'')+'">2배속</button><button class="pri confirm skip" id="skip" style="flex:1">건너뛰기 ▶▶</button></div>'
  :'<div class="row" style="flex-wrap:nowrap"><button id="tb"'+(m.timebankUsed||sub?' disabled':'')+' title="판당 1회 (T)">+15초</button><button class="pri confirm" id="ok" style="flex:1"'+(sub?' disabled':'')+'>'+(sub?'상대 대기…':'확정 (Space)')+'</button></div>')+'</div></div>'
 +(S.showLog?'<div class="log" id="logp">'+logHtml()+'</div>':'')+'</div>';
 $('app').innerHTML=h;
 $('logb').onclick=function(){S.showLog=!S.showLog;render()};
 if(reveal)return;
 document.querySelectorAll('.hand [data-uid]').forEach(function(el){el.onclick=function(){pickCard(Number(el.dataset.uid))}});
 document.querySelectorAll('[data-unpick]').forEach(function(el){el.onclick=function(){pickCard(Number(el.dataset.unpick))}});
 document.querySelectorAll('[data-spell]').forEach(function(el){el.onclick=function(){if(sub)return;S.sel.spell=S.sel.spell===el.dataset.spell?null:el.dataset.spell;render()}});
 $('act').onclick=function(){S.sel.active=!S.sel.active;render()};
 $('ok').onclick=submitTurn;$('tb').onclick=function(){send({type:'timebank'})};
 $('menu').onclick=function(){if(b.turn<4)return toast('항복은 4턴부터 할 수 있어요');ask('항복할까요? 패배로 끝나요.','항복',function(){send({type:'surrender'})})}}
function pickCard(uid){var m=S.st,b=m.battle,me=b.me;if(me.mySubmission)return;var c=me.hand.find(function(x){return x.uid===uid});if(!c)return;
 var i=S.sel.cards.indexOf(uid);if(i>=0){S.sel.cards.splice(i,1);return render()}
 if(c.sealed)return toast('봉인된 카드예요');
 if(S.sel.cards.length>=(b.rules.cards_per_turn_max||3))return toast('한 턴에 3장까지');
 if(sumCost(me,S.sel.cards.concat([uid]))>me.energy){if(navigator.vibrate)navigator.vibrate(30);return toast('에너지가 부족해요')}
 S.sel.cards.push(uid);render()}
function submitTurn(){var m=S.st;if(!m||m.phase!=='battle'||m.battle.me.mySubmission||S.anim)return;send({type:'act',turn:m.battle.turn,cards:S.sel.cards,spell:S.sel.spell,active:S.sel.active})}

/* ---------- 카드 상세(호버 0.2초 / 길게 누르기 0.35초, 상세 01) ---------- */
function peekHide(){var o=$('peek');if(o)o.remove()}
function peekShow(id){peekHide();var k=card(id),p=phOf(id),w=Math.floor(Math.min(300,innerHeight*0.42*5/7,innerWidth*0.62)),d=document.createElement('div');d.id='peek';d.className='peek';
 d.innerHTML=bcCard(id,{w:w,mode:w>=257?'detail':'hand'})+'<div class="pinfo" style="width:'+Math.max(w,260)+'px"><b>'+esc(k.name)+'</b><div class="mu small">'+esc(KIND_KO[k.kind]||k.kind)+' · 비용 '+k.cost+' · 처리 단계 '+phLab(id)+(k.owner_character?' · '+esc(ch(k.owner_character).name)+' 전용':'')+'</div><p>'+esc(k.effect_text)+'</p></div>';document.body.appendChild(d)}
var PK={t:0,lp:false,el:null};
document.addEventListener('pointerover',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;var el=e.target.closest&&e.target.closest('[data-cid]');if(el===PK.el)return;PK.el=el;clearTimeout(PK.t);peekHide();if(el)PK.t=setTimeout(function(){peekShow(el.dataset.cid)},200)});
document.addEventListener('pointerdown',function(e){if(!e.pointerType||e.pointerType==='mouse')return;var el=e.target.closest&&e.target.closest('[data-cid]');PK.lp=false;clearTimeout(PK.t);if(!el)return;PK.t=setTimeout(function(){PK.lp=true;peekShow(el.dataset.cid);if(navigator.vibrate)navigator.vibrate(10)},350)});
['pointerup','pointercancel'].forEach(function(n){document.addEventListener(n,function(e){if(!e.pointerType||e.pointerType==='mouse')return;clearTimeout(PK.t);if(PK.lp)setTimeout(peekHide,1200)})});
document.addEventListener('click',function(e){if(PK.lp){PK.lp=false;e.stopPropagation();e.preventDefault();return}peekHide();PK.el=null;
 if(S.anim&&e.target.closest('#bt')&&!e.target.closest('#spd,#logb,[data-cid],.log'))S.anim.skip()},true);

/* ---------- 효과 자막(기획지시 전투가독성 3): "누구 · 카드 이름: 결과" ---------- */
function cn(id){return '<span class="cn" data-cid="'+id+'">'+esc(card(id).name)+'</span>'}
function groupsOf(L,you){var G=[],cur=null,end=false,last=null,nw=function(o){o.ev=[];G.push(o);cur=o;return o};
 (L||[]).forEach(function(e){switch(e.t){
  case 'turn':return;case 'reveal':if(e.auto)nw({k:'auto',seat:e.seat,ph:0});cur=null;return;
  case 'phase':end=true;cur=null;return;
  case 'spell':nw({k:'spell',seat:e.seat,id:e.id,ph:0,bad:e.void?'무효(상대 스펠에 막힘)':''});return;
  case 'card':nw({k:'card',seat:e.seat,id:e.id,ph:e.phase});return;
  case 'active':nw({k:'active',seat:e.seat,ph:3,bad:e.void?'무효: 침묵':''});return;
  case 'countered':nw({k:'counter',seat:1-e.seat,id:e.by,victim:e.card,ph:4});return;
  case 'void':nw({k:'void',seat:e.seat,id:e.card,ph:phOf(e.card),bad:'무효: '+({energy:'에너지 부족',silence:'침묵'}[e.why]||e.why)});cur=null;return;
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
 return {html:(who?who+' · ':'')+head+': '+body,dmg:dm}}
function logHtml(){return (S.hist||[]).map(function(x){return '<div'+(x.h?' class="lh"':'')+'>'+x.html+'</div>'}).join('')||'<div class="mu">아직 기록이 없어요</div>'}

/* ---------- 공개 연출(상세 01: 뒤집기 → 처리 단계 0~5, 같은 단계는 SPD 순, 행동당 1~2초·턴당 최대 8초, 2배속은 절반) ---------- */
function play(ob,log,next){var you=next.you,side=function(s){return s===you?'me':'opp'};
 var rv={me:[],opp:[]};(log||[]).forEach(function(e){if(e.t==='reveal')rv[side(e.seat)]=byPhase(e.cards,function(x){return x})});
 var fake=JSON.parse(JSON.stringify(S.st));fake.phase='battle';fake.battle=JSON.parse(JSON.stringify(ob));var gone=(ob.me.mySubmission&&ob.me.mySubmission.cards)||(S.selTurn===ob.turn?S.sel.cards.slice():[]);fake.battle.me.hand=fake.battle.me.hand.filter(function(c){return gone.indexOf(c.uid)<0});fake.battle.me.mySubmission=null;fake.battle.opp.submitted=false;
 var keep=S.st;S.st=fake;renderBattle(fake,rv);S.st=keep;
 var G=groupsOf(log,you),hp={me:ob.me.hp,opp:ob.opp.hp},sh={me:ob.me.shield,opp:ob.opp.shield},mx={me:ob.me.maxHp,opp:ob.opp.maxHp},used={me:{},opp:{}};
 var caps=G.map(function(g){return capOf(g,you,ob)});
 S.hist=S.hist||[];S.hist.push({h:1,html:'── '+ob.turn+'턴'});caps.forEach(function(c){S.hist.push({html:c.html})});
 var spd=S.spd?0.5:1,dur=G.map(function(g){return Math.min(2000,1000+180*g.ev.length)}),tot=dur.reduce(function(a,b){return a+b},0),k=Math.min(1,7400/Math.max(1,tot));
 var slotEl=function(sd,id){var arr=rv[sd];for(var i=0;i<arr.length;i++)if(arr[i]===id&&!used[sd][i]){used[sd][i]=1;return $('rv_'+sd+i)}return null};
 var anyEl=function(sd,id){var arr=rv[sd];for(var i=arr.length-1;i>=0;i--)if(arr[i]===id)return $('rv_'+sd+i);return null};
 var steps=[{d:500*spd,f:function(){}}],lit=null;
 G.forEach(function(g,gi){var sd=g.seat==null?null:side(g.seat),D=Math.max(500,dur[gi]*k)*spd,n=g.ev.length,gap=n?Math.min(320*spd,D*0.6/n):0;
  steps.push({d:Math.min(300*spd,D*0.25),f:function(){
   document.querySelectorAll('#phc .chip').forEach(function(c){c.classList.toggle('on',Number(c.dataset.ph)===g.ph)});
   if(lit)lit.classList.remove('lit');lit=null;var cp=$('cap');if(cp){cp.innerHTML=caps[gi].html;cp.className='cap show'+(g.bad?' bad':'')}
   if(g.k==='card'){lit=slotEl(sd,g.id);if(lit)lit.classList.add('lit')}
   else if(g.k==='counter'){var ce=slotEl(sd,g.id);if(ce){ce.classList.add('lit');lit=ce}stamp(anyEl(side(1-g.seat),g.victim),'반격')}
   else if(g.k==='void')stamp(anyEl(sd,g.id),g.bad.indexOf('에너지')>=0?'에너지':'무효');
   else if(g.k==='spell'||g.k==='active'||g.k==='rush')banner((sd?(sd==='me'?'나':'상대')+' · ':'')+(g.k==='spell'?'스펠 '+sname(g.id):g.k==='active'?'액티브 '+(ch(sd==='me'?ob.me.char:ob.opp.char).active_name||''):'★ 폭주 시작 ★')+(g.bad?' (무효)':''))}});
  g.ev.forEach(function(e){var t=side(e.seat);steps.push({d:gap,f:function(){
   if(e.t==='dmg'){if(e.absorbed){sh[t]=Math.max(0,sh[t]-e.absorbed);float(t,'-'+e.absorbed,'abs')}if(e.guard)float(t,'수호 0','abs');else if(e.v||!e.absorbed){hp[t]=Math.max(0,hp[t]-e.v);float(t,'-'+e.v,e.crit?'crit':e.src==='burn'?'burn':'')}if(e.crit&&navigator.vibrate)navigator.vibrate(40)}
   else if(e.t==='heal'){hp[t]=Math.min(mx[t],hp[t]+e.v);float(t,'+'+e.v,'heal')}else if(e.t==='shield'){sh[t]+=e.v;float(t,'실드 +'+e.v,'abs')}
   else if(e.t==='selfcost'){hp[t]=Math.max(0,hp[t]-e.v);float(t,'-'+e.v,'burn')}else if(e.t==='rewind'){hp[t]=e.to;float(t,'↺ '+e.to,'heal')}
   else if(e.t==='debuff')float(t,(ST[e.debuff]||[e.debuff])[0],'abs');else if(e.t==='blocked')float(t,'면역','abs');
   bars(t,hp,sh,mx)}})});
  steps.push({d:Math.max(0,D-Math.min(300*spd,D*0.25)-gap*n),f:function(){}})});
 var i=0,timer=null,done=false;
 var finish=function(){if(done)return;done=true;clearTimeout(timer);S.anim=null;S.lastOpp=rv.opp;S.lastTurn=ob.turn;var p=S.pending||S.st;S.pending=null;S.st=p;render()};
 S.anim={skip:finish};$('skip').onclick=finish;$('spd').onclick=function(){S.spd=!S.spd;try{localStorage.setItem('play_spd',S.spd?'2':'1')}catch(e){}this.classList.toggle('on',S.spd);spd=S.spd?0.5:1};
 var tick=function(){if(done)return;if(i>=steps.length)return finish();var s=steps[i++];try{s.f()}catch(err){}timer=setTimeout(tick,s.d)};tick()}
function bars(sd,hp,sh,mx){var w=Math.max(0,100*hp[sd]/mx[sd]),sw=Math.min(100-w,100*sh[sd]/mx[sd]);
 $('hp_'+sd).style.width=w+'%';$('gh_'+sd).style.width=w+'%';var s=$('sh_'+sd);s.style.left=w+'%';s.style.width=sw+'%';$('hpt_'+sd).textContent=hp[sd]+'/'+mx[sd];$('sht_'+sd).textContent=sh[sd]?'실드 '+sh[sd]:''}
function float(sd,txt,cls){var host=$('side_'+sd);if(!host)return;var f=document.createElement('div');f.className='float '+(cls||'');f.textContent=txt;f.style.left=(30+Math.random()*40)+'%';host.appendChild(f);setTimeout(function(){f.remove()},1150)}
function banner(t){var b=document.createElement('div');b.className='banner';b.textContent=t;$('bt').appendChild(b);setTimeout(function(){b.remove()},1300)}
function stamp(el,t){if(!el)return;var s=document.createElement('div');s.className='stamp';s.textContent=t;el.appendChild(s)}

/* ---------- 결과 ---------- */
function renderResult(m){var L=m.last||{},you=m.you,win=L.outcome!=='draw'&&L.outcome!=='void'&&((L.outcome==='a')===(you===0)),draw=L.outcome==='draw';
 var picks=L.picks||[],mine=picks[you],opp=picks[1-you],fm=frameOf(m.prep&&m.prep.frame.mine),vw=innerWidth,W=Math.min(vw>=700?170:120,Math.max(70,Math.floor((innerHeight-230)/1.4))),hp=L.hp||[];
 $('app').innerHTML='<div class="scr res"><h2 class="'+(win?'win':'lose')+'">'+(draw?'무승부':L.outcome==='void'?'결과 없음':win?'승리':'패배')+'</h2>'
 +'<div class="mu">'+esc(REASON[L.reason]||L.reason||'')+' · '+(L.turn||0)+'턴</div>'
 +'<div class="vs">'+(mine?pvCard(mine,{w:W,tier:fm.tier,holo:win?Math.max(fm.holo,3):fm.holo,sub:hp[you]?'HP '+hp[you][0]+'/'+hp[you][1]:'',cls:win?'':'dimc'}):'')+'<b>VS</b>'+(opp?pvCard(opp,{w:W,tier:'BRONZE',sub:hp[1-you]?'HP '+hp[1-you][0]+'/'+hp[1-you][1]:''}):'')+'</div>'
 +'<div class="small mu">AI 대전은 랭크 점수·숙련도 변화가 없어요(총괄 8장)</div>'
 +'<div class="row" style="justify-content:center"><button id="home">처음으로</button><button class="pri confirm" id="again">다시 하기 (Enter)</button></div></div>';
 $('home').onclick=function(){quit();home()};$('again').onclick=again;holo()}
function again(){quit();var d=localStorage.getItem('play_dev');api('/v1/practice',{difficulty:S.diff,defaults:{preferred:['SE','AU','UM'],spells:['SP01','SP04'],preset:2}}).then(function(j){S.st=null;S.load=null;connect(j.code)}).catch(function(){login(d).then(function(){return api('/v1/practice',{difficulty:S.diff})}).then(function(j){connect(j.code)}).catch(function(e){home(e.message)})})}

/* ---------- 타이머·홀로·키 ---------- */
setInterval(function(){var m=S.st;if(!m||S.anim)return;var t=m.phase==='battle'?m.deadline:m.phaseDeadline,s=left(t);
 var tm=$('tm');if(tm){tm.textContent=t?s+'초':'';tm.className='timer'+(s<=5?' red':'')}
 var rt=$('rt'),rg=$('ring');if(rt&&rg){rt.textContent=s;var tot=((m.options&&m.options.turnSec)||20)*1000;rg.style.setProperty('--p',Math.max(0,Math.min(1,(t-now())/tot)));rg.classList.toggle('red',s<=5)}
 var cp=$('cap');if(cp&&m.phase==='battle'&&!m.battle.me.mySubmission){var any=S.sel.cards.length||S.sel.spell||S.sel.active,msg=s<=5?'⏱ 확정하지 않으면 이번 턴은 아무것도 내지 않아요'+(any?'(고른 카드·스펠·액티브도 나가지 않아요)':''):'';if(cp.textContent!==msg){cp.textContent=msg;cp.className='cap'+(msg?' show warn':'')}}},250);
function holo(){if(S.hraf)return;var t0=performance.now(),step=function(n){var els=document.querySelectorAll('.pvc');if(!els.length){S.hraf=0;return}
 var k=((n-t0)%4200)/4200,x=0.5-0.5*Math.cos(k*Math.PI*2),y=0.5+Math.sin(k*Math.PI*2)*0.15;
 els.forEach(function(c){if(c.hov)return;c.style.setProperty('--mx',0.1+x*0.8);c.style.setProperty('--my',y);c.style.setProperty('--px',(x-0.5)*1.2);c.style.setProperty('--py',(y-0.5)*1.2)});S.hraf=requestAnimationFrame(step)};S.hraf=requestAnimationFrame(step)}
document.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('.pvc');document.querySelectorAll('.pvc').forEach(function(x){if(x!==c)x.hov=false});if(!c)return;var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.hov=true;c.style.setProperty('--mx',x);c.style.setProperty('--my',y);c.style.setProperty('--px',(x-0.5)*2);c.style.setProperty('--py',(y-0.5)*2)});
document.addEventListener('keydown',function(e){var m=S.st;if(!m||e.target.tagName==='INPUT')return;
 if(m.phase==='loadout'&&e.code==='Space'){e.preventDefault();return confirmLoad()}
 if(m.phase==='result'&&e.key==='Enter')return again();
 if(m.phase!=='battle'||S.anim)return;var me=m.battle.me;
 if(/^[1-7]$/.test(e.key)){var el=document.querySelector('.hand [data-i="'+(Number(e.key)-1)+'"]');if(el)pickCard(Number(el.dataset.uid))}
 else if(e.key==='q'||e.key==='w'){var ids=Object.keys(me.spells),id=ids[e.key==='q'?0:1];if(id&&!me.mySubmission&&!me.spells[id]){S.sel.spell=S.sel.spell===id?null:id;render()}}
 else if(e.key==='e'){if(me.gauge>=100&&!me.mySubmission){S.sel.active=!S.sel.active;render()}}
 else if(e.code==='Space'){e.preventDefault();submitTurn()}
 else if(e.key==='t')send({type:'timebank'});else if(e.key==='l'){S.showLog=!S.showLog;render()}});
var rz;addEventListener('resize',function(){clearTimeout(rz);rz=setTimeout(function(){if(S.st&&!S.anim)render()},150)});
boot();
</script></body></html>`;
