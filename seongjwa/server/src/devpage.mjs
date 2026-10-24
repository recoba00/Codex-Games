// 개발용 브라우저 테스트 화면 (DEV_LOGIN=1 환경의 GET /dev 에서만 제공).
// 탭 2개를 열어 각각 다른 개발 ID로 로그인하면 친구방 한 판을 처음부터 끝까지 해볼 수 있다. 실제 클라이언트는 Godot.
export const TEST_PAGE = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>성좌 결투 서버 테스트</title>
<style>
:root{--bg:#0f1220;--panel:#1a1f33;--line:#2c3350;--text:#e8eaf3;--dim:#9aa1bd;--acc:#7aa2ff;--bad:#ff7a7a;--ok:#6fdc9a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,sans-serif;padding:16px}
h1{font-size:18px;margin:0 0 12px}section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px}
button,input,select{font:inherit;color:var(--text);background:#232a45;border:1px solid var(--line);border-radius:8px;padding:6px 10px}
button{cursor:pointer}button.on{background:var(--acc);color:#0b0e1a}button:disabled{opacity:.4;cursor:default}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.dim{color:var(--dim)}.bad{color:var(--bad)}.ok{color:var(--ok)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:700px){.grid{grid-template-columns:1fr}}
.card{min-width:120px;text-align:left}.bar{height:8px;background:#232a45;border-radius:4px;overflow:hidden}.bar>i{display:block;height:100%;background:var(--ok)}
pre{white-space:pre-wrap;margin:0;font-size:12px;color:var(--dim);max-height:220px;overflow:auto}
</style></head><body>
<h1>성좌 결투 · 서버 테스트 <span class="dim" id="who" style="font-size:12px;font-weight:400"></span></h1>
<section id="login"><div class="row"><input id="devId" placeholder="개발 ID (예: alice)"><button id="btnLogin">로그인</button></div>
<p class="dim">탭 2개에서 서로 다른 ID로 로그인 → 한쪽이 방을 만들고 다른 쪽이 코드로 참가합니다.</p></section>
<section id="lobby" hidden><div class="row">
<label><input type="checkbox" id="optBans" checked> 밴 켜기</label>
<select id="optTurn"><option value="20">턴 20초</option><option value="30">턴 30초</option></select>
<button id="btnCreate">방 만들기</button><span class="dim">또는</span>
<input id="joinCode" placeholder="상대의 방 코드 6자리" maxlength="6" size="8"><button id="btnJoin">참가</button></div></section>
<section id="ranked" hidden><div class="row"><b>랭킹전</b> <span id="rankInfo" class="dim"></span></div>
<div class="row" style="margin-top:8px"><button id="btnQueue">랭킹전 찾기</button><label><input type="checkbox" id="humanOnly"> 사람 상대만 기다리기</label><button id="btnCancelQ" hidden>취소</button><span id="qInfo" class="dim"></span></div>
<div class="row" style="margin-top:8px"><b>AI 대전(연습)</b><button data-d="easy" class="pr">쉬움</button><button data-d="normal" class="pr">보통</button><button data-d="hard" class="pr">어려움</button><button id="btnBoard">랭킹 보드</button></div>
<pre id="board" hidden></pre></section>
<section id="econ" hidden><div class="row"><b>경제</b> <span id="gold" style="color:var(--acc);font-weight:600"></span><span id="econInfo" class="dim"></span>
<button id="btnEcon">새로고침</button><button id="btnAtt">출석 받기</button><button id="btnMail">우편함</button><button id="btnShop">상점</button><button id="btnInv">보관함</button>
<input id="newName" placeholder="새 닉네임(2~12자)" size="14"><button id="btnName">닉네임 변경</button></div>
<div id="missions" style="margin-top:8px"></div><div id="econBox" style="margin-top:8px"></div></section>
<section id="room" hidden></section>
<section><b>로그</b><pre id="log"></pre></section>
<script>
var S={token:sessionStorage.getItem('tok'),acc:sessionStorage.getItem('acc'),data:null,ws:null,st:null,sel:{cards:[],spell:null,active:false}};
var $=function(id){return document.getElementById(id)};
function log(m){$('log').textContent=new Date().toLocaleTimeString()+' '+m+'\n'+$('log').textContent}
function api(path,body){return fetch(path,{method:body===undefined?'GET':'POST',headers:Object.assign({'content-type':'application/json'},S.token?{authorization:'Bearer '+S.token}:{}),body:body===undefined?undefined:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!j.ok)throw new Error(j.error||r.status);return j})})}
function nm(kind,id){var d=S.data&&S.data[kind]&&S.data[kind][id];return d?d.name:id}
function start(){$('login').hidden=!!S.token;$('lobby').hidden=!S.token;$('ranked').hidden=!S.token;$('econ').hidden=!S.token;if(S.token){loadRank();loadEcon()}$('who').textContent=S.acc?'계정 '+S.acc.slice(0,8):'';
 if(S.token&&!S.data)fetch('/v1/data/live').then(function(r){return r.json()}).then(function(j){S.data=j.data;log('데이터 버전 '+j.version)});
 var code=sessionStorage.getItem('room');if(S.token&&code)connect(code)}
$('btnLogin').onclick=function(){api('/v1/auth/dev',{devId:$('devId').value.trim().toLowerCase()}).then(function(j){S.token=j.accessToken;S.acc=j.accountId;sessionStorage.setItem('tok',S.token);sessionStorage.setItem('acc',S.acc);log('로그인 '+(j.replacedSessions?'(다른 기기 세션 종료됨)':''));start()}).catch(function(e){log('로그인 실패: '+e.message)})};
$('btnCreate').onclick=function(){api('/v1/rooms',{options:{bans:$('optBans').checked,turnSec:Number($('optTurn').value)}}).then(function(j){log('방 '+j.code);connect(j.code)}).catch(function(e){log(e.message)})};
$('btnJoin').onclick=function(){var c=$('joinCode').value.trim().toUpperCase();if(!/^[2-9A-HJKMNP-Z]{6}$/.test(c)){log('방 코드는 상대 화면의 "방 코드" 6자리입니다(예: JCWBV3)');return}api('/v1/rooms/'+c+'/join',{}).then(function(){connect(c)}).catch(function(e){log('참가 실패: '+({not_found:'방 코드 형식 오류',room_not_found:'그런 방이 없음(코드 확인)',room_full:'방이 가득 참'}[e.message]||e.message))})};
function loadRank(){api('/v1/rank/me').then(function(r){$('rankInfo').textContent=r.tierName+' '+r.rp+'RP · '+r.wins+'승/'+r.games+'판'+(r.streak?' · '+r.streak+'연승':'')+(r.leaver.step?' · 이탈 '+r.leaver.step:'')}).catch(function(e){$('rankInfo').textContent='랭크 정보 없음('+e.message+')'})}
function queue(){api('/v1/queue/ticket',{humanOnly:$('humanOnly').checked}).then(function(j){
 if(j.waitBeforeMin)log('이탈 누적으로 매칭 전 '+j.waitBeforeMin+'분 대기');
 var ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/v1/queue/ws?ticket='+encodeURIComponent(j.ticket));S.qws=ws;$('btnCancelQ').hidden=false;$('btnQueue').disabled=true;
 ws.onmessage=function(e){var m=JSON.parse(e.data);if(m.type==='waiting')$('qInfo').textContent='대기 '+m.waitSec+'초 · MMR ±'+m.range+(j.aiFallback?' · 30초 뒤 AI 랭킹전 전환':'');
  else if(m.type==='matched'){log((m.ai?'AI 랭킹전':'랭킹전')+' 매칭 성사 ('+m.waitSec+'초)');$('qInfo').textContent='';connect(m.code)}else if(m.type==='timeout')log('매칭 시간 초과(120초)')};
 ws.onclose=function(){$('btnCancelQ').hidden=true;$('btnQueue').disabled=false}}).catch(function(e){log('랭킹전 불가: '+({queue_locked:'이탈 누적으로 랭킹전 잠금',dodge_blocked:'닷지로 5분 매칭 제한'}[e.message]||e.message))})}
$('btnQueue').onclick=queue;$('btnCancelQ').onclick=function(){S.qws&&S.qws.send('{"type":"cancel"}')};
Array.prototype.forEach.call(document.querySelectorAll('.pr'),function(b){b.onclick=function(){api('/v1/practice',{difficulty:b.dataset.d}).then(function(j){log('AI 대전 '+b.textContent);connect(j.code)}).catch(function(e){log(e.message)})}});
$('btnBoard').onclick=function(){api('/v1/rank/board').then(function(j){var b=$('board');b.hidden=!b.hidden;b.textContent='시즌 '+j.season.id+'\n'+j.rows.map(function(r){return r.rank+'. '+r.tierName+' '+r.rp+'RP '+r.name}).join('\n')})};
function connect(code){sessionStorage.setItem('room',code);api('/v1/rooms/'+code+'/ticket',{}).then(function(j){
 var ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/v1/rooms/'+code+'/ws?ticket='+encodeURIComponent(j.ticket));S.ws=ws;
 ws.onmessage=function(e){var m=JSON.parse(e.data);if(m.type==='room'){S.st=m;render()}else if(m.type==='error')log('오류: '+m.error+' ('+m.about+')');else if(m.type==='afk_warning')log('⚠ 2턴째 행동 없음: 다음 턴도 없으면 이탈 처리');};
 ws.onclose=function(e){log('연결 끊김 '+e.code+' '+(e.reason||''));if(e.code===4001)return;setTimeout(function(){if(sessionStorage.getItem('room'))connect(code)},1500)};
 setInterval(function(){if(ws.readyState===1)ws.send('{"type":"ping"}')},20000);
}).catch(function(e){log('접속 실패: '+e.message);if(e.message==='room_not_found')sessionStorage.removeItem('room')})}
function leaveRoom(){sessionStorage.removeItem('room');if(S.ws){S.ws.onclose=null;S.ws.close()}S.ws=null;S.st=null;$('room').hidden=true;$('lobby').hidden=false;$('ranked').hidden=false;$('econ').hidden=false;loadRank();loadEcon()}
function send(o){S.ws&&S.ws.readyState===1&&S.ws.send(JSON.stringify(o))}
function btn(label,fn,on,dis){var b=document.createElement('button');b.textContent=label;if(on)b.className='on';if(dis)b.disabled=true;b.onclick=fn;return b}
function left(t){return t?Math.max(0,Math.ceil((t-Date.now())/1000))+'초':''}
function render(){var m=S.st,el=$('room');el.hidden=false;el.innerHTML='';$('lobby').hidden=true;$('ranked').hidden=true;$('econ').hidden=true;
 var head=document.createElement('div');head.className='row';
 var MODE={friend:'친구방',practice:'AI 대전',ranked:'랭킹전',ranked_ai:'AI 랭킹전'};head.innerHTML='<b>'+MODE[m.mode]+'</b>'+(m.mode==='friend'?' <span>방 코드 <b style="font-size:22px;letter-spacing:3px;color:var(--acc)">'+m.code+'</b></span>':'')+'<span class="dim">단계: '+m.phase+' · 밴 '+(m.options.bans?'켜짐':'꺼짐')+' · 턴 '+m.options.turnSec+'초'+(m.dataVersion?' · 데이터 v'+m.dataVersion:'')+'</span><span id="timer"></span>';
 el.appendChild(head);
 var mem=document.createElement('p');mem.className='dim';mem.textContent=m.members.map(function(x){return (x.seat===m.you?'나':(x.ai?'AI('+x.ai.difficulty+')':'상대'))+(x.host&&m.mode==='friend'?'(방장)':'')+(x.connected?' 접속':' 끊김')+(x.ready?' 준비':'')}).join(' / ');el.appendChild(mem);
 var row=document.createElement('div');row.className='row';el.appendChild(row);
 if(m.phase==='closed'){row.appendChild(document.createTextNode('판이 취소됨('+(m.notice||'')+')'+(String(m.notice).indexOf('dodge')===0?' · 상대가 밴픽 중 나감, 대기열 우선권 부여':'')+' '));row.appendChild(btn('로비',leaveRoom));return tick()}
 if(m.phase==='lobby'||m.phase==='result'){
  if(m.last)row.appendChild(document.createTextNode('지난 판: '+({a:'0번 승',b:'1번 승',draw:'무승부',void:'결과 없음'}[m.last.outcome])+' ('+m.last.reason+', '+m.last.turn+'턴) · 내 결과: '+(m.last.outcome==='draw'||m.last.outcome==='void'?'-':((m.last.outcome==='a')===(m.you===0)?'승리':'패배'))+' '));
  if(m.last&&m.last.econ&&m.last.econ[m.you]){var ec=m.last.econ[m.you];row.appendChild(document.createTextNode(' · 골드 +'+ec.gold+(ec.parts&&ec.parts.length?' ('+ec.parts.map(function(x){return ({win:'승리',first_win:'첫 승'}[x.kind]||x.kind)+' '+x.gold}).join(', ')+')':'')+' '))}
  if(m.last&&m.last.rank&&m.last.rank[m.you]){var rk=m.last.rank[m.you];row.appendChild(document.createTextNode(' · RP '+(rk.rpDelta>=0?'+':'')+rk.rpDelta+' → '+rk.rp+' '))}
  if(m.mode==='ranked'||m.mode==='ranked_ai'){row.appendChild(btn('다시 찾기',function(){leaveRoom();queue()}));row.appendChild(btn('로비',leaveRoom));if(m.lastLog){var pl=document.createElement('pre');pl.textContent=fmtLog(m.lastLog,m.you);el.appendChild(pl)}return tick()}
  var me=m.members[m.you];row.appendChild(btn(me&&me.ready?'준비 취소':(m.phase==='result'?'재대결 준비':'준비'),function(){send({type:'ready',ready:!(me&&me.ready),defaults:{preferred:['SE','AU','UM'],spells:['SP01','SP04'],preset:2}})},me&&me.ready));
  if(m.you===0&&m.phase==='lobby'&&m.mode==='friend'){row.appendChild(btn('밴 '+(m.options.bans?'끄기':'켜기'),function(){send({type:'options',bans:!m.options.bans})}))}
  row.appendChild(btn('방 나가기',function(){send({type:'leave'});leaveRoom()}));
  if(m.lastLog){var p=document.createElement('pre');p.textContent=fmtLog(m.lastLog,m.you);el.appendChild(p)}
 }else if(m.phase==='ban'||m.phase==='pick'){var P=m.prep;
  row.appendChild(document.createTextNode((m.phase==='ban'?'밴할 캐릭터(상대 '+(P.oppBanDone?'완료':'선택 중')+'): ':'픽(동시·비공개, 상대 '+(P.oppPickDone?'완료':'선택 중')+'): ')));
  P.characters.forEach(function(id){var dis=m.phase==='pick'&&P.banned.indexOf(id)>=0;row.appendChild(btn(nm('characters',id),function(){send(m.phase==='ban'?{type:'ban',characterId:id}:{type:'pick',characterId:id})},(m.phase==='ban'?P.myBan:P.myPick)===id,dis))});
  if(m.phase==='ban')row.appendChild(btn('밴 안 함',function(){send({type:'ban',characterId:null})}));
  if(P.banned.length){var b=document.createElement('p');b.className='dim';b.textContent='밴됨: '+P.banned.map(function(i){return nm('characters',i)}).join(', ');el.appendChild(b)}
 }else if(m.phase==='loadout'){var P2=m.prep;
  var info=document.createElement('p');info.innerHTML='내 캐릭터 <b>'+nm('characters',P2.myPick)+'</b> vs 상대 <b>'+nm('characters',P2.oppPick)+'</b> · 상대 '+(P2.oppLoadoutDone?'완료':'선택 중');el.appendChild(info);
  S.load=S.load||{spells:[],preset:2};
  Object.keys(S.data.spells).forEach(function(id){row.appendChild(btn(nm('spells',id),function(){var i=S.load.spells.indexOf(id);if(i>=0)S.load.spells.splice(i,1);else if(S.load.spells.length<2)S.load.spells.push(id);render()},S.load.spells.indexOf(id)>=0))});
  var r2=document.createElement('div');r2.className='row';el.appendChild(r2);
  [1,2,3].forEach(function(s){r2.appendChild(btn(['','공세','균형','수비'][s]+' 덱',function(){S.load.preset=s;render()},S.load.preset===s))});
  r2.appendChild(btn('확정',function(){send({type:'loadout',spells:S.load.spells,preset:S.load.preset})},false,S.load.spells.length!==2||!!P2.myLoadout));
 }else if(m.phase==='battle'){S.load=null;renderBattle(m,el)}
 tick()}
function renderBattle(m,el){var b=m.battle;
 if(S.selTurn!==b.turn){S.sel={cards:[],spell:null,active:false};S.selTurn=b.turn}
 var g=document.createElement('div');g.className='grid';el.appendChild(g);
 [['나',b.me],['상대',b.opp]].forEach(function(x){var p=x[1],d=document.createElement('div');
  d.innerHTML='<b>'+x[0]+' · '+nm('characters',p.char)+'</b> HP '+p.hp+'/'+p.maxHp+(p.shield?' 실드 '+p.shield:'')+'<div class="bar"><i style="width:'+(100*p.hp/p.maxHp)+'%"></i></div>'
  +'<span class="dim">에너지 '+p.energy+' · 게이지 '+p.gauge+' · 덱 '+p.deck+' · 손패 '+p.handCount+(p.submitted?' · <span class=ok>확정</span>':'')+'</span><br>'
  +'<span class="dim">스펠 '+Object.keys(p.spells).map(function(s){return nm('spells',s)+(p.spells[s]?'('+p.spells[s]+'턴)':'(가능)')}).join(', ')+'</span><br>'
  +'<span class="dim">상태 '+(p.status.map(function(s){return s.k+(s.n?'×'+s.n:'')+(s.left?'('+s.left+')':'')}).join(', ')||'-')+'</span>';g.appendChild(d)});
 var t=document.createElement('p');t.innerHTML='<b>'+b.turn+'턴</b>'+(b.turn>=b.rules.rush_start_turn?' <span class=bad>폭주</span>':'')+' · 남은 시간 <span id="tl"></span>';el.appendChild(t);
 var hand=document.createElement('div');hand.className='row';el.appendChild(hand);var mine=b.me,sub=mine.mySubmission;
 mine.hand.forEach(function(c){var on=S.sel.cards.indexOf(c.uid)>=0||(sub&&sub.cards.indexOf(c.uid)>=0);var k=S.data.cards[c.id];
  var bt=btn(nm('cards',c.id)+' ['+c.cost+'E] '+(k?k.kind:''),function(){var i=S.sel.cards.indexOf(c.uid);if(i>=0)S.sel.cards.splice(i,1);else if(S.sel.cards.length<3)S.sel.cards.push(c.uid);render()},on,!!sub||c.sealed);bt.className+=' card';bt.title=k?k.effect_text:'';hand.appendChild(bt)});
 var ctl=document.createElement('div');ctl.className='row';el.appendChild(ctl);
 Object.keys(mine.spells).forEach(function(s){ctl.appendChild(btn('스펠 '+nm('spells',s),function(){S.sel.spell=S.sel.spell===s?null:s;render()},S.sel.spell===s||(sub&&sub.spell===s),!!sub||mine.spells[s]>0))});
 ctl.appendChild(btn('액티브',function(){S.sel.active=!S.sel.active;render()},S.sel.active||(sub&&sub.active),!!sub||mine.gauge<100));
 ctl.appendChild(btn('확정',function(){send({type:'act',turn:b.turn,cards:S.sel.cards,spell:S.sel.spell,active:S.sel.active})},false,!!sub));
 ctl.appendChild(btn('타임뱅크 +15초',function(){send({type:'timebank'})},false,m.timebankUsed||!!sub));
 ctl.appendChild(btn('항복',function(){if(confirm('항복할까요?'))send({type:'surrender'})}));
 if(mine.revealed&&mine.revealed.length){var rv=document.createElement('p');rv.className='dim';rv.textContent='통찰로 본 상대 손패: '+mine.revealed.map(function(r){return nm('cards',r.id)}).join(', ');el.appendChild(rv)}
 var p=document.createElement('pre');p.textContent=fmtLog(b.log,m.you);el.appendChild(p)}
function fmtLog(L,you){return (L||[]).map(function(e){var who=e.seat===undefined?'':(e.seat===you?'[나] ':'[상대] ');
 switch(e.t){case 'turn':return '── '+e.turn+'턴 결과';case 'reveal':return who+'공개: '+(e.cards.map(function(c){return nm('cards',c)}).join(', ')||'카드 없음')+(e.spell?' / 스펠 '+nm('spells',e.spell):'')+(e.active?' / 액티브':'')+(e.auto?' (자동)':'');
 case 'dmg':return who+'피해 '+e.v+(e.absorbed?' (실드 '+e.absorbed+')':'')+(e.guard?' 수호로 0':'')+' ← '+e.src;case 'heal':return who+'회복 '+e.v;case 'countered':return who+nm('cards',e.card)+' 무효 (반격)';
 case 'blocked':return who+e.debuff+' 막음(면역)';case 'debuff':return who+e.debuff+' 걸림';case 'void':return who+nm('cards',e.card||'')+' 무효 ('+e.why+')';case 'spell':return who+'스펠 '+nm('spells',e.id)+(e.void?' 무효':'');
 case 'active':return who+'액티브'+(e.void?' 무효(게이지 반환)':'');case 'end':return '■ 종료: '+e.outcome+' ('+e.reason+')';case 'rush':return '★ 폭주 시작';case 'card':return '';default:return who+e.t}}).filter(Boolean).join('\n')}
function tick(){var m=S.st;if(!m)return;var t=m.phase==='battle'?m.deadline:m.phaseDeadline;var a=$('tl')||$('timer');if(a)a.textContent=left(t)}
var MK={daily:'일일',weekly:'주간',season:'시즌'};
function loadEcon(){api('/v1/econ').then(function(e){S.econ=e;$('gold').textContent=e.gold.toLocaleString()+' 골드';
 $('econInfo').textContent=' · '+e.name+' · 우편 '+e.mailUnread+' · 출석 '+(e.attendance.claimedToday?'완료':'가능('+e.attendance.nextCycleDay+'일차)')+' · 오늘 '+e.today.wins+'승(승리 골드 '+e.today.winGoldLeft+'회 남음, 첫 승 '+(e.today.firstWinDone?'받음':e.firstWinGold+'골드')+') · AI 대전 인정 '+e.today.aiCounted+'/3';
 $('btnAtt').disabled=e.attendance.claimedToday;$('btnName').textContent='닉네임 변경'+(e.nameChangeGold?' ('+e.nameChangeGold+'골드)':' (무료)');
 if(e.recovered&&e.recovered.length)log('결제 확인된 주문 '+e.recovered.length+'건 → 우편 지급');
 var box=$('missions');box.innerHTML='';
 ['daily','weekly','season'].forEach(function(k){var r=document.createElement('div');r.className='row';r.innerHTML='<b>'+MK[k]+'</b>'+(k==='daily'?' <span class=dim>교체 '+e.rerollLeft+'회</span>':'');
  e[k].forEach(function(x){var b=btn(x.name+' '+x.progress+'/'+x.target+' · '+x.gold+'G'+(x.claimed?' ✓':''),function(){api('/v1/missions/claim',{kind:k,id:x.id}).then(function(j){log('미션 보상 +'+j.gold);loadEcon()}).catch(function(er){log(er.message)})},x.done&&!x.claimed,!x.done||x.claimed);r.appendChild(b);
   if(k==='daily'&&!x.claimed&&e.rerollLeft)r.appendChild(btn('↻',function(){api('/v1/missions/reroll',{id:x.id}).then(function(){log('미션 교체');loadEcon()}).catch(function(er){log(er.message)})}))});
  box.appendChild(r)})}).catch(function(er){log('경제 정보 실패: '+er.message)})}
$('btnEcon').onclick=loadEcon;
$('btnAtt').onclick=function(){api('/v1/attendance/claim',{}).then(function(j){log('출석 '+j.cycleDay+'일차 +'+j.gold);loadEcon()}).catch(function(e){log(e.message)})};
$('btnName').onclick=function(){api('/v1/profile/name',{name:$('newName').value.trim(),requestId:crypto.randomUUID()}).then(function(j){log('닉네임 '+j.name+' (−'+j.cost+'골드)');loadEcon()}).catch(function(e){log('닉네임 변경 실패: '+e.message)})};
$('btnMail').onclick=function(){api('/v1/mail').then(function(j){var b=$('econBox');b.innerHTML='<b>우편함</b> ';
 b.appendChild(btn('모두 받기',function(){api('/v1/mail/claim',{}).then(function(r){log('우편 '+r.claimed+'통 받음: 골드 +'+r.gold+(r.items.length?' / 상품 '+r.items.join(','):''));loadEcon();$('btnMail').onclick()})}));
 var pre=document.createElement('pre');pre.textContent=j.mail.map(function(m){return (m.claimed?'[받음] ':'[ ] ')+m.title+' · '+m.rewards.map(function(r){return r.type==='gold'?r.amount+'골드':r.id}).join(', ')+' · 만료 '+new Date(m.expiresAt).toLocaleDateString()}).join('\n')||'우편 없음';b.appendChild(pre)})};
$('btnShop').onclick=function(){api('/v1/shop').then(function(j){var b=$('econBox');b.innerHTML='<b>상점</b> <span class=dim>'+j.note+' · 테스트 환경 현금 결제는 가짜(dev)</span>';
 var r=document.createElement('div');r.className='row';b.appendChild(r);
 if(!j.offers.length)r.appendChild(document.createTextNode('판매 중인 상품 없음'));
 j.offers.forEach(function(o){var t=document.createElement('span');t.textContent=o.name+(o.owned?' (보유)':'')+' ';r.appendChild(t);
  if(o.priceGold)r.appendChild(btn(o.priceGold+'골드',function(){if(!confirm(o.name+'을(를) '+o.priceGold+'골드로 살까요?'))return;api('/v1/shop/buy',{offerId:o.offer,price:o.priceGold,requestId:crypto.randomUUID()}).then(function(x){log('구매 '+o.name+' 잔액 '+x.gold);loadEcon();$('btnShop').onclick()}).catch(function(e){log('구매 실패: '+e.message)})},false,o.owned));
  if(o.priceKrw)r.appendChild(btn('₩'+o.priceKrw.toLocaleString(),function(){api('/v1/shop/orders',{offerId:o.offer,price:o.priceKrw}).then(function(x){log('주문 '+x.order+' ('+x.provider+')');return api('/v1/shop/orders/'+x.order+'/finalize',{})}).then(function(x){log('결제 완료 → 지급 '+x.item);$('btnShop').onclick()}).catch(function(e){log('결제 실패: '+e.message)})},false,o.owned))})})};
$('btnInv').onclick=function(){api('/v1/inventory').then(function(j){var b=$('econBox');b.innerHTML='<b>보관함</b>';var pre=document.createElement('pre');
 pre.textContent=j.items.map(function(i){return i.kind+' · '+i.name+(i.character?' ('+i.character+')':'')+' · '+i.source}).join('\n')+'\n장착: '+JSON.stringify(j.equipped);b.appendChild(pre)})};
setInterval(tick,500);start();
</script></body></html>`;
