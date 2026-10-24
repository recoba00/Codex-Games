// 백오피스 화면(GET /bo). 디자인은 기획 시안 prototypes/backoffice.html, 데이터는 /bo/v1 API(직원 로그인).
// 외부 스크립트 없음(CSP: self + inline). 토큰은 sessionStorage(탭을 닫으면 로그아웃).
export const BO_PAGE = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>성좌 결투 백오피스</title>
<style>
:root{--bg:#EEF1F6;--panel:#FFF;--panel2:#F6F8FB;--ink:#1A2036;--muted:#5E6681;--line:#D5DAE5;--accent:#34508F;--accent-ink:#FFF;--ok:#2F7A45;--ok-bg:#E3F2E7;--warn:#9A6A00;--warn-bg:#FFF3D6;--bad:#B2392E;--bad-bg:#FBE6E3;--side:#1E2540;--side-ink:#C9D1E8;--side-on:#34508F;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0E1326;--panel:#161D36;--panel2:#1B2342;--ink:#E4E8F4;--muted:#9AA3C0;--line:#2A3354;--accent:#8FAEE8;--accent-ink:#0E1326;--ok:#7CC891;--ok-bg:#173323;--warn:#E5BD5A;--warn-bg:#33290F;--bad:#F08C80;--bad-bg:#3A1B18;--side:#0A0F20;--side-ink:#AEB8D6;--side-on:#2B3F73;color-scheme:dark}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;font-size:14px;line-height:1.5}
.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
@media(max-width:900px){.app{grid-template-columns:1fr}.side{display:none}.mnav{display:block!important}}
.side{background:var(--side);color:var(--side-ink);padding:16px 10px;position:sticky;top:0;height:100vh;overflow:auto}
.side .brand{font-weight:600;color:#fff;padding:4px 10px 14px;font-size:15px}
.side .grp{font-size:11px;letter-spacing:.04em;opacity:.7;padding:12px 10px 4px}
.side button{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:0;padding:8px 10px;border-radius:8px;cursor:pointer}
.side button[aria-current=page]{background:var(--side-on);color:#fff}.side button:disabled{opacity:.35;cursor:not-allowed}
.mnav{display:none;padding:10px 16px 0}.mnav select{width:100%}
.top{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.top h1{font-size:16px;margin:0}.top .sp{flex:1}.main{min-width:0}.content{padding:18px 20px 40px;max-width:1400px}
h2{font-size:18px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{font-size:14px;margin:0 0 10px}
.grid{display:grid;gap:14px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
@media(max-width:1100px){.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:1fr 1fr}}@media(max-width:700px){.g2,.g3,.g4{grid-template-columns:1fr}}
label.f{display:grid;gap:4px;font-size:12px;color:var(--muted)}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}button,a,input,select,textarea,label{touch-action:manipulation}
@media(max-width:900px),(pointer:coarse){input,select,textarea{font-size:16px!important}}
input,select,textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 9px;min-width:0}
textarea{resize:vertical;min-height:56px;width:100%}
.btn{font:inherit;font-size:14px;border-radius:8px;padding:7px 12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);cursor:pointer;white-space:nowrap}
.btn.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.btn.bad{color:var(--bad)}.btn[disabled]{opacity:.45;cursor:not-allowed}.btn.sm{padding:3px 8px;font-size:12px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.tw{overflow-x:auto}
.agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.agrid.sm{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}button.card.acard{width:100%;text-align:center;cursor:pointer;font:inherit;color:inherit;border:1px solid var(--line)}button.card.acard:hover{border-color:var(--accent)}
@media(max-width:700px){.tw table,.tw tbody,.tw tr,.tw td{display:block;width:auto}.tw tr:first-child{display:none}.tw tr{border-bottom:1px solid var(--line);padding:10px 0}.tw td{border:none!important;padding:3px 0!important}.tw td[data-l]:before{content:attr(data-l);display:block;font-size:11px;color:var(--muted)}}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);white-space:nowrap;vertical-align:top}
th{color:var(--muted);font-weight:500;background:var(--panel2);position:sticky;top:0}td.wrap{white-space:normal;min-width:200px}
tr.click{cursor:pointer}tr.click:hover td{background:var(--panel2)}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--line);background:var(--panel2)}
.tag.ok{background:var(--ok-bg);color:var(--ok);border-color:transparent}.tag.warn{background:var(--warn-bg);color:var(--warn);border-color:transparent}
.tag.bad{background:var(--bad-bg);color:var(--bad);border-color:transparent}.tag.acc{background:var(--accent);color:var(--accent-ink);border-color:transparent}
.kpi{font-size:24px;font-weight:600}.muted{color:var(--muted)}.small{font-size:12px}
.checks{list-style:none;margin:0;padding:0;display:grid;gap:4px}.checks li{display:flex;gap:8px;font-size:13px}
.checks li::before{content:"✓";color:var(--ok);font-weight:600;width:14px;flex:none}.checks li.no::before{content:"✕";color:var(--bad)}.checks li.wn::before{content:"!";color:var(--warn)}
.note{background:var(--warn-bg);color:var(--warn);border-radius:8px;padding:8px 10px;font-size:13px}
.code{font-family:ui-monospace,monospace;font-size:20px;letter-spacing:2px;color:var(--accent);user-select:all}
.toast{position:fixed;right:18px;bottom:18px;background:var(--ink);color:var(--bg);padding:10px 14px;border-radius:10px;font-size:13px;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:none;z-index:20;max-width:420px}
.toast.on{opacity:1;transform:none}.hr{height:1px;background:var(--line);margin:12px 0}
.login{max-width:380px;margin:12vh auto;display:grid;gap:12px}
pre{white-space:pre-wrap;font-size:12px;margin:0}
</style></head><body>
<div id="root"></div><div class="toast" id="toast" role="status"></div>
<script>
(function(){
var $=function(id){return document.getElementById(id)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var T={token:sessionStorage.getItem('bo_tok'),me:null,perms:{},route:(location.hash||'#dashboard').slice(1),cache:{}};
var ROLE={planner:'기획자',reviewer:'검수자',admin:'관리자',ops:'운영·CS'};
var ERR={name_banned:'금칙어가 들어간 닉네임',word_exists:'이미 있는 금칙어',word_invalid:'글자가 없는 금칙어',word_not_found:'없는 금칙어',login_failed:'아이디 또는 비밀번호가 맞지 않아요',login_locked:'5번 틀려서 15분 잠겼어요',forbidden:'이 역할로는 할 수 없어요',self_review:'자기가 만든·요청한 초안은 승인·반려할 수 없어요(상세 14)',
 validation_failed:'검증 차단 항목이 있어 검수 요청을 할 수 없어요',state_invalid:'지금 상태에서는 할 수 없는 작업이에요',reason_required:'사유를 적어 주세요',not_approved:'승인된 초안만 배포할 수 있어요',
 invite_invalid:'초대 코드가 틀렸거나 만료·사용됐어요',login_taken:'이미 쓰는 아이디예요',password_weak:'비밀번호는 10자 이상',gold_short:'잔액보다 많이 회수할 수 없어요',last_admin:'관리자가 최소 1명은 있어야 해요',
 schedule_invalid:'예약 시각은 지금 이후여야 해요',session_ended:'로그인이 끝났어요. 다시 로그인해 주세요',auth_expired:'로그인이 끝났어요. 다시 로그인해 주세요',xlsx_invalid:'xlsx 파일을 읽지 못했어요',
 days_required:'기간(일)을 적어 주세요',query_too_short:'2자 이상 입력',sanction_invalid:'이미 해제된 제재예요',reward_invalid:'보상 형식 오류',price_required:'골드 또는 원화 가격 하나는 있어야 해요'};
function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove('on')},3200)}
function api(path,body,raw){return fetch('/bo/v1'+path,{method:body===undefined?'GET':'POST',headers:Object.assign(raw?{'content-type':'application/octet-stream'}:{'content-type':'application/json'},T.token?{authorization:'Bearer '+T.token}:{}),body:body===undefined?undefined:(raw?body:JSON.stringify(body))})
 .then(function(r){return r.json().catch(function(){return {ok:false,error:'http_'+r.status}}).then(function(j){if(!j.ok&&j.error!=='validation_errors'){if(j.error==='session_ended'||j.error==='auth_expired'||j.error==='auth_invalid'){logout(true)}var e=new Error(ERR[j.error]||j.error);e.body=j;throw e}return j})})}
function fail(e){toast('⚠ '+e.message)}
function fmt(t){if(!t)return '-';var d=new Date(t);var p=function(n){return String(n).padStart(2,'0')};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())}
function num(n){return n==null?'-':Number(n).toLocaleString()}
function logout(silent){if(T.token&&!silent)api('/logout',{}).catch(function(){});T.token=null;T.me=null;sessionStorage.removeItem('bo_tok');render()}

/* ---------- 로그인·가입 ---------- */
function loginView(){var reg=T.reg;
 return '<div class="login card"><h2>성좌 결투 백오피스</h2><p class="sub">'+(reg?'관리자에게 받은 초대 코드로 직원 계정을 만들어요.':'직원 계정으로 로그인')+'</p>'
 +(reg?'<label class="f">초대 코드<input id="lgCode" placeholder="XXXX-XXXX-XXXX"></label><label class="f">이름(표시용)<input id="lgName" maxlength="24"></label>':'')
 +'<label class="f">아이디<input id="lgId" autocomplete="username"></label><label class="f">비밀번호'+(reg?'(10자 이상)':'')+'<input id="lgPw" type="password" autocomplete="'+(reg?'new-password':'current-password')+'"></label>'
 +'<button class="btn pri" id="lgGo">'+(reg?'가입하고 로그인':'로그인')+'</button><button class="btn" id="lgSwitch">'+(reg?'로그인으로':'초대 코드로 가입')+'</button></div>'}
function bindLogin(){$('lgSwitch').onclick=function(){T.reg=!T.reg;render()};
 var go=function(){var id=$('lgId').value.trim(),pw=$('lgPw').value;
  var p=T.reg?api('/register',{code:$('lgCode').value,login:id,name:$('lgName').value,password:pw}):Promise.resolve();
  p.then(function(){return api('/login',{login:id,password:pw})}).then(function(j){T.token=j.token;sessionStorage.setItem('bo_tok',j.token);T.reg=false;boot()}).catch(fail)};
 $('lgGo').onclick=go;$('lgPw').onkeydown=function(e){if(e.key==='Enter')go()}}

/* ---------- 메뉴 ---------- */
var MENU=[['운영',[['dashboard','대시보드','dashboard'],['metrics','지표(KPI)','dashboard']]],
 ['게임 데이터',[['data','데이터 배포(xlsx)','data_view'],['characters','캐릭터','data_view'],['cards','전투카드','data_view'],['spells','스펠','data_view'],['settings','설정값','data_view'],['assets','에셋 등록','data_view']]],
 ['운영 도구',[['shop','상점·상품','shop'],['events','배너·공지·우편','events'],['users','유저 조회·제재','users'],['reports','신고','users'],['words','금칙어·닉네임','users'],['suspects','어뷰징 의심','users']]],
 ['배포·관리',[['audit','감사 로그','audit'],['staff','권한 관리','dashboard']]]];
function shell(inner){var nav='<div class="brand">성좌 결투 BO</div>'+MENU.map(function(g){return '<div class="grp">'+g[0]+'</div>'+g[1].map(function(m){return '<button data-k="'+m[0]+'" '+((T.route===m[0]||(m[0]==='assets'&&/^asset[A-Z]/.test(T.route)))?'aria-current="page"':'')+(T.perms[m[2]]?'':' disabled title="권한 없음"')+'>'+m[1]+'</button>'}).join('')}).join('');
 var opts=MENU.reduce(function(a,g){return a.concat(g[1])},[]).filter(function(m){return T.perms[m[2]]}).map(function(m){return '<option value="'+m[0]+'" '+((T.route===m[0]||(m[0]==='assets'&&/^asset[A-Z]/.test(T.route)))?'selected':'')+'>'+m[1]+'</option>'}).join('');
 return '<div class="app"><nav class="side" id="side">'+nav+'</nav><div class="main"><div class="top"><h1>성좌 결투 백오피스 <span class="tag ok">테스트 서버</span>'+(T.solo?' <span class="tag warn" title="관리자가 자기 초안도 승인할 수 있음(상세 14)">1인 운영 모드</span>':'')+'</h1><span class="sp"></span><span class="small muted">'+esc(T.me.name)+' ('+esc(T.me.login)+') · <b>'+ROLE[T.me.role]+'</b></span><button class="btn sm" id="btnOut">로그아웃</button></div><div class="mnav"><select id="mnav">'+opts+'</select></div><div class="content" id="view">'+inner+'</div></div></div>'}
function go(k){T.route=k;history.replaceState(null,'','#'+k);render()}
function render(){var root=$('root');
 if(!T.token||!T.me){root.innerHTML=loginView();bindLogin();return}
 root.innerHTML=shell('<p class="muted">불러오는 중…</p>');
 $('side').onclick=function(e){var b=e.target.closest('button[data-k]');if(b&&!b.disabled)go(b.dataset.k)};$('mnav').onchange=function(e){go(e.target.value)};$('btnOut').onclick=function(){logout()};
 var v=V[T.route]||V.dashboard;Promise.resolve(v()).then(function(h){if(typeof h==='string')$('view').innerHTML=h;labelTables();if(v.bind)v.bind()}).catch(function(e){$('view').innerHTML='<div class="note">'+esc(e.message)+'</div>'})}
function boot(){api('/me').then(function(j){T.me=j.staff;T.perms=j.perms;T.solo=j.soloMode;render()}).catch(function(){T.token=null;render()})}
var V={};
/* 휴대폰(700px 이하): 표를 카드처럼 세로로 쌓고 칸 이름을 붙인다(작업 버튼이 화면 밖으로 밀리지 않게) */
function labelTables(root){(root||document).querySelectorAll('.tw table').forEach(function(t){var hs=[].map.call(t.querySelectorAll('tr:first-child th'),function(h){return h.textContent});t.querySelectorAll('tr').forEach(function(r){[].forEach.call(r.children,function(td,i){if(td.tagName==='TD'&&hs[i]&&!td.hasAttribute('colspan'))td.setAttribute('data-l',hs[i])})})})}
new MutationObserver(function(){labelTables()}).observe(document.documentElement,{childList:true,subtree:true});
function table(head,rows){return '<div class="tw"><table><tr>'+head.map(function(h){return '<th>'+h+'</th>'}).join('')+'</tr>'+(rows.join('')||'<tr><td colspan="'+head.length+'" class="muted">없음</td></tr>')+'</table></div>'}
function val(id){var e=$(id);return e?e.value.trim():''}

/* ---------- 에셋 등록(상세 14·10, 기획답변 18·19차) ---------- */
function kb(n){return n==null?'-':(n>=1048576?(n/1048576).toFixed(2)+'MB':Math.round(n/1024)+'KB')}
function usageBox(u){if(!u)return '<span class="muted small">사용량 정보 없음</span>';
 var bar=function(label,x,note){var c=x.pct>=80?'bad':x.pct>=60?'warn':'ok';return '<div style="margin-bottom:8px"><div class="small">'+label+' <b>'+kb(x.bytes)+'</b> / '+kb(x.quota)+' <span class="tag '+c+'">'+x.pct+'%</span> '+(note||'')+'</div><div style="height:6px;background:var(--line);border-radius:3px"><i style="display:block;height:6px;border-radius:3px;width:'+Math.min(100,x.pct)+'%;background:var(--'+(c==='ok'?'ok':c==='warn'?'warn':'bad')+')"></i></div></div>'};
 return bar('저장 용량',u.storage,u.storage.available?u.storage.files+'개 파일':'(로컬 시험: 확인 불가)')+bar('이번 달 전송량(게임 보고 기준 추정)',u.download,u.download.events+'건')+(u.warn?'<div class="note">⚠ 무료 한도의 80%를 넘었어요. 한도를 넘으면 게임 DB까지 제한될 수 있어요(기획답변 18차).</div>':'')}
function loadImg(src){return new Promise(function(ok,no){var i=new Image();i.crossOrigin='anonymous';i.onload=function(){ok(i)};i.onerror=function(){no(new Error('이미지를 읽지 못했어요'))};i.src=src})}
function toWebp(cv,q){return new Promise(function(ok,no){cv.toBlob(function(b){if(!b||b.type!=='image/webp')return no(new Error('이 브라우저는 WebP 압축을 못 해요. 크롬·엣지에서 해 주세요'));ok(b)},'image/webp',q)})}
function drawTo(img,w,h){var c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(img,0,0,w,h);return c}
/* 투명 검사: 네 모서리 8×8 픽셀. need: true(투명)·'corners'(모서리 투명)·false(불투명, 격자 표본 전체 알파 255) */
function alphaCheck(cv,need){var g=cv.getContext('2d'),W=cv.width,H=cv.height;
 if(need===false){var d=g.getImageData(0,0,W,H).data,step=Math.max(4,Math.floor(d.length/4/4000))*4;for(var i=3;i<d.length;i+=step)if(d[i]<255)return '배경 슬롯은 불투명이어야 해요(투명 픽셀 있음)';return null}
 var cs=[[0,0],[W-8,0],[0,H-8],[W-8,H-8]];for(var k=0;k<4;k++){var p=g.getImageData(cs[k][0],cs[k][1],8,8).data,clear=false;for(var j=3;j<p.length;j+=4)if(p[j]<250){clear=true;break}if(!clear)return '모서리가 투명하지 않아요(체크무늬가 박힌 이미지는 안 돼요)'}return null}
/* 규격 맞추기: kind=full(9:16, 1080~1440 너비, 큰 건 1440×2560으로), slot/face(정해진 크기, 같은 비율이면 줄임) */
function prepare(file,kind,slot){var A=T.ad.spec.art;return loadImg(URL.createObjectURL(file)).then(function(img){var W=img.naturalWidth,H=img.naturalHeight,tw,th,need;
 if(kind==='full'){if(W*16!==H*9)throw new Error('전신은 9:16이어야 해요 (올린 파일 '+W+'×'+H+')');if(W<A.full.min[0])throw new Error('전신은 최소 '+A.full.min.join('×')+' (올린 파일 '+W+'×'+H+')');
  tw=Math.min(W,A.full.max[0]);th=tw*16/9;if(tw%4||th%4)throw new Error('전신 가로·세로는 4의 배수여야 해요 ('+tw+'×'+th+')');need=true}
 else{var ex=kind==='face'?A.face.exact:[slot.w,slot.h];if(W*ex[1]!==H*ex[0])throw new Error('비율이 달라요: '+ex[0]+'×'+ex[1]+' 비율이어야 해요 (올린 파일 '+W+'×'+H+')');if(W<ex[0])throw new Error('최소 '+ex[0]+'×'+ex[1]+'이어야 해요 (올린 파일 '+W+'×'+H+')');tw=ex[0];th=ex[1];need=kind==='face'?true:slot.alpha}
 var cv=drawTo(img,tw,th),bad=alphaCheck(cv,need);if(bad)throw new Error(bad);
 var q=(kind==='full'||kind==='face'||(slot&&slot.alpha===false))?0.9:1;
 return {img:img,cv:cv,kind:kind,slot:slot,w:tw,h:th,orig:file.size,origW:W,origH:H,q:q,src:URL.createObjectURL(file)}})}
function compress(P){return toWebp(P.cv,P.q).then(function(b){P.blob=b;P.url=URL.createObjectURL(b);if(P.kind!=='full')return P;var A=T.ad.spec.art.thumb.exact;return toWebp(drawTo(P.img,A[0],A[1]),0.85).then(function(t){P.thumb=t;return P})})}
function compareBox(P){var cap=P.kind==='full'?T.ad.spec.fullMaxKb:P.kind==='face'?T.ad.spec.faceMaxKb:null,over=cap&&P.blob.size>cap*1024;
 return '<div class="card" style="margin-top:12px"><h3>압축 확인 — 사람이 승인해야 저장돼요</h3><div class="small">원본 '+P.origW+'×'+P.origH+' '+kb(P.orig)+' → WebP '+P.w+'×'+P.h+' <b>'+kb(P.blob.size)+'</b> (−'+Math.max(0,Math.round((1-P.blob.size/P.orig)*100))+'%)'+(P.thumb?' · 밴픽 축소본 '+kb(P.thumb.size):'')+(over?' <span class="tag bad">목표 '+cap+'KB 초과</span>':'')+'</div>'
 +'<div class="row" style="margin:8px 0"><label class="small">품질 <select id="aQ">'+[0.75,0.8,0.85,0.9,0.95,1].map(function(q){return '<option value="'+q+'"'+(q===P.q?' selected':'')+'>'+(q===1?'최고(무손실에 가까움)':Math.round(q*100))+'</option>'}).join('')+'</select></label><span class="small muted">확대 비교(가운데 부분 2배): 왼쪽 원본, 오른쪽 압축</span></div>'
 +'<div class="row"><canvas id="cmpA" width="240" height="240" style="border:1px solid var(--line);max-width:48%"></canvas><canvas id="cmpB" width="240" height="240" style="border:1px solid var(--line);max-width:48%"></canvas></div>'
 +'<div class="row" style="margin-top:10px"><button class="btn pri sm" id="aOk">승인·저장</button><button class="btn sm" id="aNo">취소</button></div></div>'}
function drawCompare(P){loadImg(P.url).then(function(c){[[P.img,'cmpA',P.origW/P.w],[c,'cmpB',1]].forEach(function(x){var cv=$(x[1]);if(!cv)return;var g=cv.getContext('2d'),s=x[2],cx=P.w/2,cy=(P.kind==='full'?P.h*0.2:P.h/2);g.imageSmoothingEnabled=false;g.clearRect(0,0,240,240);g.drawImage(x[0],(cx-60)*s,(cy-60)*s,120*s,120*s,0,0,240,240)})})}
function upload(blob,q){return fetch('/bo/v1/assets/upload?'+q,{method:'POST',headers:{authorization:'Bearer '+T.token,'content-type':'image/webp'},body:blob}).then(function(r){return r.json()}).then(function(j){if(!j.ok){var e=new Error((ERR[j.error]||j.error)+(j.detail?': '+j.detail:''));throw e}return j})}
/* 영역 편집: 카드 그림 창(3:4)과 얼굴(1:1). 둘 다 그림을 끌어 옮기고 슬라이더로 크기 조절. 비율 좌표 0~1 */
function regionEditor(img,W,H,R){var host=$('aReg');if(!host)return;var mode='card';
 var ratioH={card:(4/3)*W/H,face:W/H};  /* 너비(비율) → 높이(비율) */
 R.card=R.card?{x:R.card.x,y:R.card.y,w:R.card.w,h:R.card.w*ratioH.card}:{x:0,y:0,w:1,h:ratioH.card};
 R.face=R.face?{x:R.face.x,y:R.face.y,w:R.face.w,h:R.face.w*ratioH.face}:{x:0.3,y:0.05,w:0.4,h:0.4*ratioH.face};
 var maxW=function(k){return Math.min(1,1/ratioH[k])};
 host.innerHTML='<div class="row" style="margin-bottom:8px"><span class="small">그림을 끌어서 옮길 영역</span><button class="btn sm pri" data-rm="card">카드(3:4)</button><button class="btn sm" data-rm="face">얼굴(1:1)</button></div>'
 +'<div class="row" style="align-items:flex-start"><canvas id="rgFull" width="240" height="'+Math.round(240*H/W)+'" style="border:1px solid var(--line);touch-action:none;cursor:move"></canvas><div><div class="small muted">카드 그림 창(3:4)</div><canvas id="rgCard" width="150" height="200" style="border:1px solid var(--line)"></canvas><div class="small muted" style="margin-top:6px">얼굴(1:1)</div><canvas id="rgFace" width="100" height="100" style="border-radius:50%;border:1px solid var(--line)"></canvas></div></div>'
 +'<label class="small" style="display:block;margin-top:8px">카드 영역 크기 <input type="range" id="rgC" min="150" max="1000" value="'+Math.round(R.card.w/maxW('card')*1000)+'" style="width:100%"></label>'
 +'<label class="small" style="display:block">얼굴 영역 크기 <input type="range" id="rgS" min="50" max="1000" value="'+Math.round(R.face.w/maxW('face')*1000)+'" style="width:100%"></label><div class="small" id="rgWarn"></div><div class="small muted">파란 사각형 = 카드, 주황 사각형 = 얼굴. 위 버튼으로 끌어 옮길 영역을 고르세요.</div>';
 var full=$('rgFull'),sc=full.width/W;
 function clamp(k){var r=R[k];r.w=Math.min(maxW(k),Math.max(0.05,r.w));r.h=r.w*ratioH[k];r.x=Math.min(1-r.w,Math.max(0,r.x));r.y=Math.min(1-r.h,Math.max(0,r.y))}
 function draw(){var g=full.getContext('2d');g.clearRect(0,0,full.width,full.height);g.drawImage(img,0,0,full.width,full.height);
  [['card','#4fa3ff'],['face','#ffb020']].forEach(function(x){var r=R[x[0]];g.lineWidth=x[0]===mode?3:1.5;g.strokeStyle=x[1];g.strokeRect(r.x*W*sc,r.y*H*sc,r.w*W*sc,r.h*H*sc)});
  var c=$('rgCard').getContext('2d');c.clearRect(0,0,150,200);c.drawImage(img,R.card.x*img.naturalWidth,R.card.y*img.naturalHeight,R.card.w*img.naturalWidth,R.card.h*img.naturalHeight,0,0,150,200);
  var f=$('rgFace').getContext('2d');f.clearRect(0,0,100,100);f.drawImage(img,R.face.x*img.naturalWidth,R.face.y*img.naturalHeight,R.face.w*img.naturalWidth,R.face.h*img.naturalHeight,0,0,100,100);
  var px=Math.round(R.face.w*W);var cw=Math.round(R.card.w*W);$('rgWarn').innerHTML=(cw<720?'<span class="tag warn">카드 영역 '+cw+'×'+Math.round(R.card.h*H)+'px — 출력 720×960px보다 작아 흐릴 수 있어요(상세 10)</span> ':'<span class="tag ok">카드 영역 '+cw+'×'+Math.round(R.card.h*H)+'px</span> ')+(px<512?'<span class="tag warn">얼굴 영역 '+px+'px — 출력 512px보다 작아 흐릴 수 있어요(상세 10)</span>':'<span class="tag ok">얼굴 영역 '+px+'px</span>')}
 function resize(k,v){var r=R[k],cx=r.x+r.w/2,cy=r.y+r.h/2;r.w=maxW(k)*v/1000;r.h=r.w*ratioH[k];r.x=cx-r.w/2;r.y=cy-r.h/2;clamp(k);draw()}
 $('rgC').oninput=function(e){resize('card',e.target.value)};$('rgS').oninput=function(e){resize('face',e.target.value)};
 host.querySelectorAll('[data-rm]').forEach(function(b){b.onclick=function(){mode=b.dataset.rm;host.querySelectorAll('[data-rm]').forEach(function(x){x.className='btn sm'+(x.dataset.rm===mode?' pri':'')});draw()}});
 var drag=false;function mv(e){if(!drag)return;var rc=full.getBoundingClientRect(),x=(e.clientX-rc.left)/rc.width,y=(e.clientY-rc.top)/rc.height,r=R[mode];r.x=x-r.w/2;r.y=y-r.h/2;clamp(mode);draw()}
 full.onpointerdown=function(e){drag=true;full.setPointerCapture(e.pointerId);mv(e)};full.onpointermove=mv;full.onpointerup=function(){drag=false};
 clamp('card');clamp('face');draw()}

/* 목록 → 상세: 에셋 등록(목록: 캐릭터 카드·슬롯 카드) → 캐릭터 상세 / 슬롯 상세 */
function ssGet(k){try{return sessionStorage.getItem(k)}catch(e){return null}}
function ssSet(k,v){try{sessionStorage.setItem(k,v)}catch(e){}}
function assetsLoad(){T.av=T.av||Number(ssGet('bo_av'))||0;return api('/assets'+(T.av?'?version='+T.av:'')).then(function(d){T.ad=d;return d})}
function aImg(f,h,round){var d=T.ad;return f&&f.path?'<img src="'+esc(d.base+f.path)+'" style="height:'+h+'px;max-width:100%;object-fit:contain;background:repeating-conic-gradient(#8884 0 25%,transparent 0 50%) 0 0/12px 12px;border-radius:'+(round?'50%':'6px')+'" loading="lazy">':'<div class="muted small" style="height:'+h+'px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;min-width:'+Math.round(h*0.6)+'px">내장 기본</div>'}
function verBar(d){var P=T.perms,ed=d.editable&&P.data_edit;
 var opts=d.drafts.map(function(v){return '<option value="'+v.id+'"'+(v.id===d.version?' selected':'')+'>v'+v.id+' 초안 · '+esc(v.note)+' ('+esc(v.by||'-')+')</option>'}).join('')+'<option value="'+d.live+'"'+(d.live===d.version?' selected':'')+'>v'+d.live+' 라이브(보기만)</option>';
 return '<div class="card" style="margin-bottom:14px"><div class="row"><b>편집할 버전</b><select id="aVer">'+opts+'</select>'+(P.data_edit?'<button class="btn sm" id="aNew">에셋용 새 초안(라이브 v'+d.live+' 기준)</button>':'')+'</div><p class="small muted" style="margin:8px 0 0">'+(ed?'v'+d.version+' 초안을 고치는 중이에요. 다 고치면 데이터 배포(xlsx) 메뉴에서 검수 요청 → 승인 → 배포.':'이 버전은 보기만 할 수 있어요. 고치려면 편집 중인 초안을 고르거나 새로 만드세요.')+'</p></div>'}
function bindVer(){if($('aVer'))$('aVer').onchange=function(e){T.av=Number(e.target.value);ssSet('bo_av',T.av);render()};
 if($('aNew'))$('aNew').onclick=function(){var note=prompt('초안 메모(감사 로그)','에셋 변경');if(note===null)return;api('/assets/draft',{note:note}).then(function(j){T.av=j.version;ssSet('bo_av',j.version);toast('v'+j.version+' 초안');render()}).catch(fail)}}
function backBtn(){return '<button class="btn sm" id="aBack" style="margin-bottom:10px">← 에셋 목록</button>'}
function bindBack(){if($('aBack'))$('aBack').onclick=function(){go('assets')}}

/* 목록 */
V.assets=function(){return assetsLoad().then(function(d){var tab=T.atab||ssGet('bo_atab')||'chars',groups={};d.spec.slots.forEach(function(s){(groups[s.group]=groups[s.group]||[]).push(s)});
 var slots=d.assets.slots||{},filled=Object.keys(slots).length;
 var chars=d.characters.map(function(c){var skins=d.art[c.id]||{},base=skins['000']||{},n=Object.keys(skins).length,ok=base.full&&base.card&&base.faceRect;
  return '<button class="card acard" data-ach="'+c.id+'"><div style="display:flex;justify-content:center">'+aImg(base.thumb||base.full,150)+'</div><div style="margin-top:8px"><b>'+esc(c.name)+'</b> <span class="small muted">'+c.id+'</span></div><div class="small" style="margin-top:4px">'+(base.full?(ok?'<span class="tag ok">기본 완료</span>':'<span class="tag warn">영역 미지정</span>'):'<span class="tag">이미지 없음</span>')+(n>1?' <span class="tag">스킨 '+(n-1)+'</span>':'')+'</div></button>'}).join('');
 var slotHtml=Object.keys(groups).map(function(g){return '<h3 style="margin:14px 0 8px">'+g+' <span class="small muted">'+groups[g].filter(function(s){return slots[s.id]}).length+'/'+groups[g].length+'</span></h3><div class="agrid sm">'+groups[g].map(function(s){var f=slots[s.id];
  return '<button class="card acard" data-aslot="'+s.id+'"><div style="display:flex;justify-content:center">'+aImg(f,64)+'</div><div class="small" style="margin-top:6px"><b>'+esc(s.name)+'</b></div><div class="small muted">'+s.w+'×'+s.h+'</div></button>'}).join('')+'</div>'}).join('');
 return '<h2>에셋 등록</h2><p class="sub">카드를 눌러 상세 화면에서 이미지를 올려요. 규격·투명 검사 → WebP 압축 → 사람이 승인해야 저장, 바뀐 내용은 데이터 초안에 들어가 검수 → 배포 → 롤백을 따라요(상세 14).</p>'
 +verBar(d)+'<div class="card" style="margin-bottom:14px"><h3>저장소 사용량</h3>'+usageBox(d.usage)+'</div>'
 +'<div class="row" style="margin-bottom:12px"><button class="btn sm'+(tab==='chars'?' pri':'')+'" data-atab="chars">캐릭터 '+d.characters.length+'</button><button class="btn sm'+(tab==='slots'?' pri':'')+'" data-atab="slots">슬롯 '+filled+'/'+d.spec.slots.length+'</button></div>'
 +(tab==='chars'?'<div class="agrid">'+chars+'</div>':slotHtml)})};
V.assets.bind=function(){bindVer();$('view').onclick=function(e){var t=e.target.closest('[data-atab]'),c=e.target.closest('[data-ach]'),s=e.target.closest('[data-aslot]');
 if(t){T.atab=t.dataset.atab;ssSet('bo_atab',T.atab);render()}
 if(c){T.ach=c.dataset.ach;T.askin='000';ssSet('bo_ach',T.ach);ssSet('bo_askin','000');go('assetChar')}
 if(s){T.aslot=s.dataset.aslot;ssSet('bo_aslot',T.aslot);go('assetSlot')}}};

/* 공통: 파일 고르기 → 검사·압축 → 비교 → 승인 */
function askUpload(file,kind,slot,onSaved){$('aPrep').innerHTML='<p class="small muted">검사·압축 중…</p>';
 prepare(file,kind,slot).then(compress).then(function(P){function show(){$('aPrep').innerHTML=compareBox(P);drawCompare(P);
   $('aQ').onchange=function(e){P.q=Number(e.target.value);compress(P).then(show)};
   $('aNo').onclick=function(){$('aPrep').innerHTML=''};
   $('aOk').onclick=function(){$('aOk').disabled=true;onSaved(P).then(function(){toast('저장했어요');render()}).catch(function(e){$('aOk').disabled=false;fail(e)})}}
  show();$('aPrep').scrollIntoView({block:'nearest'})}).catch(function(e){$('aPrep').innerHTML='<div class="note">⚠ '+esc(e.message)+'</div>'})}
function upQ(kind,extra){return 'version='+T.ad.version+'&kind='+kind+(extra||'')}

/* 캐릭터 상세 */
V.assetChar=function(){T.ach=T.ach||ssGet('bo_ach');T.askin=T.askin||ssGet('bo_askin')||'000';return assetsLoad().then(function(d){var c=d.characters.find(function(x){return x.id===T.ach});if(!c){go('assets');return ''}
 var ed=d.editable&&T.perms.data_edit,skins=d.art[c.id]||{},ids=Object.keys(skins);if(ids.indexOf('000')<0)ids.unshift('000');if(ids.indexOf(T.askin)<0)ids.push(T.askin);ids.sort();
 var cur=skins[T.askin]||{};
 return backBtn()+'<h2>'+esc(c.name)+' <span class="small muted">'+c.id+'</span></h2>'+verBar(d)
 +'<div class="card" style="margin-bottom:14px"><div class="row"><b>스킨</b>'+ids.map(function(s){return '<button class="btn sm'+(s===T.askin?' pri':'')+'" data-askin="'+s+'">'+(s==='000'?'000 기본':s)+(skins[s]&&skins[s].full?'':' ·비어 있음')+'</button>'}).join('')+(ed?'<input id="aSkinNew" placeholder="새 스킨 ID(숫자 3자리)" size="12" maxlength="3"><button class="btn sm" id="aSkinAdd">추가</button>':'')+'</div></div>'
 +'<div class="card" style="margin-bottom:14px"><h3>스킨 '+T.askin+' 이미지</h3><div class="row" style="align-items:flex-end;gap:16px"><div><div class="small muted">전신(9:16)</div>'+aImg(cur.full,220)+'</div><div><div class="small muted">밴픽 축소본</div>'+aImg(cur.thumb,110)+'</div><div><div class="small muted">얼굴 파일(선택)</div>'+aImg(cur.face,80,true)+'</div></div>'
 +'<div class="small" style="margin-top:8px">'+(cur.full?cur.full.w+'×'+cur.full.h+' · '+kb(cur.full.bytes):'전신 없음')+' · 카드 영역 '+(cur.card?'<span class="tag ok">지정됨</span>':'<span class="tag warn">미지정</span>')+' · 얼굴 영역 '+(cur.faceRect?'<span class="tag ok">지정됨</span>':'<span class="tag warn">미지정</span>')+'</div>'
 +(ed?'<div class="row" style="margin-top:10px"><label class="btn pri sm">전신 올리기<input type="file" id="aFull" accept="image/png,image/webp" hidden></label><label class="btn sm">얼굴 파일 올리기<input type="file" id="aFace" accept="image/png,image/webp" hidden></label>'+(cur.face?'<button class="btn sm" id="aFaceDel">얼굴 파일 빼기</button>':'')+(cur.full&&T.askin!=='000'?'<button class="btn sm" id="aSkinDel">이 스킨 이미지 빼기</button>':'')+'</div>':'')
 +'<p class="small muted" style="margin:6px 0 0">전신 권장 1440×2560, 최소 1080×1920, 가로·세로 4의 배수, 투명 배경(상세 10). 큰 이미지는 1440×2560으로 줄여 저장. 목표 용량 전신 '+d.spec.fullMaxKb+'KB·얼굴 '+d.spec.faceMaxKb+'KB.</p><div id="aPrep"></div></div>'
 +'<div class="card"><h3>카드·얼굴 영역</h3>'+(cur.full?'<div id="aReg"></div>'+(ed?'<div class="row" id="aRegBtns" style="margin-top:8px"><button class="btn pri sm" id="aRegSave">영역 저장</button></div>':'<p class="small muted">보기만 할 수 있어요.</p>'):'<p class="small muted">전신을 먼저 올리세요.</p>')+'</div>'})};
V.assetChar.bind=function(){var d=T.ad;if(!d||!$('aBack'))return;bindBack();bindVer();var cur=((d.art[T.ach]||{})[T.askin])||{},ch='&char='+T.ach+'&skin='+T.askin;
 $('view').onclick=function(e){var s=e.target.closest('[data-askin]');if(s){T.askin=s.dataset.askin;ssSet('bo_askin',T.askin);render()}};
 if($('aSkinAdd'))$('aSkinAdd').onclick=function(){var s=val('aSkinNew');if(!/^\d{3}$/.test(s))return toast('스킨 ID는 숫자 3자리');T.askin=s;ssSet('bo_askin',s);render()};
 if($('aFull'))$('aFull').onchange=function(e){var f=e.target.files[0];if(f)askUpload(f,'full',null,function(P){return upload(P.blob,upQ('full',ch)).then(function(j){if(j.warnings&&j.warnings.length)toast(j.warnings[0]);return upload(P.thumb,upQ('thumb',ch))})})};
 if($('aFace'))$('aFace').onchange=function(e){var f=e.target.files[0];if(f)askUpload(f,'face',null,function(P){return upload(P.blob,upQ('face',ch))})};
 if($('aFaceDel'))$('aFaceDel').onclick=function(){if(!confirm('얼굴 파일을 빼면 얼굴 영역으로 잘라 써요. 뺄까요?'))return;api('/assets/remove',{version:d.version,char:T.ach,skin:T.askin,kind:'face'}).then(function(){toast('뺐어요');render()}).catch(fail)};
 if($('aSkinDel'))$('aSkinDel').onclick=function(){if(!confirm('스킨 '+T.askin+' 이미지와 영역을 모두 뺄까요?'))return;api('/assets/remove',{version:d.version,char:T.ach,skin:T.askin,kind:'skin'}).then(function(){T.askin='000';ssSet('bo_askin','000');toast('뺐어요');render()}).catch(fail)};
 if(cur.full&&$('aReg'))loadImg(d.base+cur.full.path).then(function(img){var R={card:cur.card,face:cur.faceRect};regionEditor(img,cur.full.w,cur.full.h,R);
  if($('aRegSave'))$('aRegSave').onclick=function(){api('/assets/regions',{version:d.version,char:T.ach,skin:T.askin,card:R.card,face:R.face}).then(function(j){toast('영역 저장'+(j.warnings.length?' · '+j.warnings[0]:''));render()}).catch(fail)}}).catch(fail)};

/* 슬롯 상세 */
V.assetSlot=function(){T.aslot=T.aslot||ssGet('bo_aslot');return assetsLoad().then(function(d){var s=d.spec.slots.find(function(x){return x.id===T.aslot});if(!s){go('assets');return ''}
 var ed=d.editable&&T.perms.data_edit,f=(d.assets.slots||{})[s.id],same=d.spec.slots.filter(function(x){return x.group===s.group}),i=same.indexOf(s);
 return backBtn()+'<h2>'+esc(s.name)+' <span class="small muted">'+s.id+'</span></h2>'+verBar(d)
 +'<div class="card"><div class="row" style="align-items:flex-start;gap:16px"><div>'+aImg(f,s.w>=s.h?140:220)+'</div><div class="small"><div>규격 <b>'+s.w+'×'+s.h+'</b> · '+(s.alpha===false?'불투명':s.alpha==='corners'?'모서리 투명':'투명')+'</div><div style="margin-top:4px">'+(f?'현재 '+f.w+'×'+f.h+' · '+kb(f.bytes)+' · '+fmt(f.at):'비어 있음 → 게임 내장 기본 이미지')+'</div>'
 +'<div class="muted" style="margin-top:4px">같은 비율의 큰 이미지는 규격 크기로 줄여 저장해요.</div></div></div>'
 +(ed?'<div class="row" style="margin-top:10px"><label class="btn pri sm">올리기<input type="file" id="aSlotFile" accept="image/png,image/webp" hidden></label>'+(f?'<button class="btn sm" id="aSlotDel">빼기(내장 기본으로)</button>':'')+'</div>':'')
 +'<div id="aPrep"></div><div class="row" style="margin-top:12px">'+(i>0?'<button class="btn sm" data-anext="'+same[i-1].id+'">← '+esc(same[i-1].name)+'</button>':'')+'<span class="sp"></span>'+(i<same.length-1?'<button class="btn sm" data-anext="'+same[i+1].id+'">'+esc(same[i+1].name)+' →</button>':'')+'</div></div>'})};
V.assetSlot.bind=function(){var d=T.ad;if(!d||!$('aBack'))return;bindBack();bindVer();var s=d.spec.slots.find(function(x){return x.id===T.aslot});
 $('view').onclick=function(e){var n=e.target.closest('[data-anext]');if(n){T.aslot=n.dataset.anext;ssSet('bo_aslot',T.aslot);render()}};
 if($('aSlotFile'))$('aSlotFile').onchange=function(e){var f=e.target.files[0];if(f)askUpload(f,'slot',s,function(P){return upload(P.blob,upQ('slot','&slot='+s.id))})};
 if($('aSlotDel'))$('aSlotDel').onclick=function(){if(!confirm(s.id+' 파일을 빼고 내장 기본 이미지를 쓸까요?'))return;api('/assets/remove',{version:d.version,slot:s.id}).then(function(){toast('뺐어요');render()}).catch(fail)}};

/* ---------- 어뷰징 의심(상세 13): 자동 탐지 → 사람이 판단·제재 ---------- */
function who(id,name){return '<button class="btn sm" data-uid="'+id+'">'+esc(name||'-')+'</button>'}
V.suspects=function(){return api('/suspects?days='+(T.sdays||7)).then(function(d){var c=d.cfg;
 return '<h2>어뷰징 의심</h2><p class="sub">자동으로 걸러낸 목록이에요. 이름을 누르면 유저 조회로 가서 전적·턴별 기록을 보고 사람이 판단해요. 기준은 설정값으로 바꿀 수 있어요(상세 13).</p>'
 +'<div class="row" style="margin-bottom:12px"><span class="small">최근</span><select id="sDays">'+[1,3,7,14,30].map(function(n){return '<option value="'+n+'"'+(n===c.days?' selected':'')+'>'+n+'일</option>'}).join('')+'</select></div>'
 +'<div class="grid g2"><div class="card"><h3>매크로 의심 '+d.macro.length+'</h3><p class="small muted">직접 확정한 턴 '+c.macro_min_turns+'번 이상, 확정 시간 표준편차 '+c.macro_std_sec+'초 미만. 자동 대응: 확인 팝업(사람 인증) — 클라이언트 작업 때 연결.</p>'
 +table(['계정','턴','평균','표준편차'],d.macro.map(function(x){return '<tr><td>'+who(x.id,x.name)+'</td><td>'+x.turns+'</td><td>'+x.avg+'초</td><td><span class="tag bad">'+x.std+'초</span></td></tr>'}))+'</div>'
 +'<div class="card"><h3>연속 플레이 '+d.marathon.length+'</h3><p class="small muted">최근 '+c.marathon_hours+'시간에 '+c.marathon_games+'판 이상.</p>'+table(['계정','판'],d.marathon.map(function(x){return '<tr><td>'+who(x.id,x.name)+'</td><td>'+x.games+'</td></tr>'}))+'</div>'
 +'<div class="card"><h3>승점 몰아주기 의심 '+d.pairs.length+'</h3><p class="small muted">같은 두 계정 랭킹전 '+c.pair_games+'판 이상 중 3턴 안 항복·이탈 2판 이상. 자동 대응: 24시간 2판 넘으면 매칭 회피(이미 적용).</p>'
 +table(['계정 A','계정 B','판','일찍 끝남','A 승'],d.pairs.map(function(x){return '<tr><td>'+who(x.a,x.aName)+'</td><td>'+who(x.b,x.bName)+'</td><td>'+x.games+'</td><td><span class="tag bad">'+x.early+'</span></td><td>'+x.aWins+'</td></tr>'}))+'</div>'
 +'<div class="card"><h3>부계정 의심 '+d.smurf.length+'</h3><p class="small muted">가입 '+c.smurf_days+'일 안, 랭킹전 '+c.smurf_games+'판 이상, 승률 '+Math.round(c.smurf_winrate*100)+'% 이상. 자동 대응: 숨은 MMR 갱신 폭 증가(제재 대상 아님).</p>'
 +table(['계정','가입','판','승률'],d.smurf.map(function(x){return '<tr><td>'+who(x.id,x.name)+'</td><td class="small">'+fmt(x.created_at)+'</td><td>'+x.games+'</td><td>'+Math.round(x.winrate*100)+'%</td></tr>'}))+'</div></div>'})};
V.suspects.bind=function(){if(!$('sDays'))return;$('sDays').onchange=function(e){T.sdays=Number(e.target.value);render()};$('view').onclick=function(e){var b=e.target.closest('[data-uid]');if(b){T.uq=b.dataset.uid;go('users')}}};

/* ---------- 지표(상세 12) ---------- */
function pct(v,lo,hi){if(v==null)return '-';var bad=(lo!=null&&v<lo)||(hi!=null&&v>hi);return '<span class="tag '+(bad?'bad':'ok')+'">'+v+'%</span>'}
V.metrics=function(){var q=T.mq||{};return api('/metrics?from='+(q.from||'')+'&to='+(q.to||'')).then(function(d){
 var s=d.searches||{},g=d.gold||{},rv=d.revenue||{},rt=d.retention||{};
 var k=[['랭킹전 판 길이 평균 / 90%',(d.matchMinAvg??'-')+'분 / '+(d.matchMinP90??'-')+'분','목표 3.9분 / 5.5분 이하'],['전투 길이 중앙값 · 평균 턴',(d.battleMinMedian??'-')+'분 · '+(d.avgTurns??'-')+'턴','목표 2.6분 · 7턴'],
  ['매칭 대기 중앙값',(d.waitSecMedian??'-')+'초','목표 15초 이하'],['AI 전환율',pct(d.aiFallbackPct,null,20),'출시 초 20% 이하'],['이탈률',pct(d.leavePct,null,2),'2% 이하'],['항복률',d.surrenderPct==null?'-':d.surrenderPct+'%',''],
  ['신규 계정 · 첫날 랭킹전 진입',num(d.newAccounts)+' · '+(d.rankedEntryPct??'-')+'%','진입 50% 이상'],['리텐션 D1 / D7 / D30',['d1','d7','d30'].map(function(x){return rt[x]&&rt[x].pct!=null?rt[x].pct+'%':'-'}).join(' / '),'40% / 15% / 6%'],
  ['골드 획득 · 소비',num(g.earned)+' · '+num(g.spent),'첫 소비일 중앙값 '+(g.firstSpendDaysMedian??'-')+'일 (목표 14일 이하)'],['매출 · 환불률',num(rv.amount)+'원 · '+(rv.refundPct??'-')+'%',num(rv.orders)+'건'],
  ['매칭 결과(사람·AI·취소)',[s.found||0,s.ai||0,s.cancel||0].join(' · '),''],['신고',num(d.reports),'']];
 var ch=(d.characterGroups||[]).map(function(c){return '<tr><td>'+esc(c.group)+'</td><td>'+esc(c.name)+'</td><td>'+c.games+'</td><td>'+pct(c.winPct,45,55)+'</td></tr>'});
 var sp=Object.keys(d.spells||{}).map(function(id){var x=d.spells[id];return '<tr><td>'+id+'</td><td>'+x.games+'</td><td>'+(x.games?Math.round(1000*x.wins/x.games)/10+'%':'-')+'</td></tr>'});
 var ev=Object.keys(d.events||{}).sort().map(function(n){return '<tr><td>'+n+'</td><td>'+num(d.events[n])+'</td></tr>'});
 var tu=Object.keys(d.tutorial||{}).sort().map(function(n){return '<tr><td>'+esc(n)+'</td><td>'+num(d.tutorial[n])+'</td></tr>'});
 var bs=Object.keys(g.bySource||{}).map(function(n){return '<tr><td>'+esc(n)+'</td><td>'+num(g.bySource[n])+'</td></tr>'});
 var st=Object.keys(d.settings||{}).map(function(n){return '<tr><td>'+esc(n)+'</td><td>'+num(d.settings[n])+'</td></tr>'});
 return '<h2>지표(KPI)</h2><p class="sub">상세 12 기준. 목표값은 출시 전 가정이에요. 판·매칭 지표는 랭킹전(사람+AI) 기준, 기간은 한국 시간 날짜.</p>'
 +'<div class="row" style="margin-bottom:12px"><input type="date" id="mFrom" value="'+(q.from||'')+'"> ~ <input type="date" id="mTo" value="'+(q.to||'')+'"><button class="btn sm" id="mGo">조회</button><span class="small muted">비우면 최근 7일 · '+fmt(d.range.from)+' ~ '+fmt(d.range.to)+'</span></div>'
 +'<div class="grid g4">'+k.map(function(x){return '<div class="card"><div class="muted small">'+x[0]+'</div><div class="kpi">'+x[1]+'</div><div class="small muted">'+x[2]+'</div></div>'}).join('')+'</div>'
 +'<div class="grid g2" style="margin-top:14px"><div class="card"><h3>캐릭터 승률(티어 구간별, 목표 45~55%)</h3>'+table(['구간','캐릭터','판수','승률'],ch)+'</div>'
 +'<div class="card"><h3>스펠 승률</h3>'+table(['스펠','판수','승률'],sp)+'<h3 style="margin-top:12px">골드 출처별</h3>'+table(['사유','합계'],bs)+'</div>'
 +'<div class="card"><h3>튜토리얼 단계 도달(유저 수)</h3>'+table(['단계','유저'],tu)+'<h3 style="margin-top:12px">설정 변경(유저 수)</h3>'+table(['설정','유저'],st)+'</div>'
 +'<div class="card"><h3>이벤트 수</h3>'+table(['이벤트','건수'],ev)+'</div></div>'})};
V.metrics.bind=function(){var b=$('mGo');if(b)b.onclick=function(){T.mq={from:val('mFrom'),to:val('mTo')};render()}};

/* ---------- 금칙어·닉네임(상세 13) ---------- */
var WK={profanity:'욕설',hate:'혐오',impersonation:'사칭',staff:'운영자 사칭',other:'기타'},WM={contains:'포함',prefix:'앞부분',exact:'전체 일치'};
V.words=function(){return Promise.all([api('/words?q='+encodeURIComponent(T.wq||'')),api('/words/flagged'),api('/words/allowed')]).then(function(r){var w=r[0].words,f=r[1].users,al=r[2].words,ADM=T.me.role==='admin';
 return '<h2>금칙어·닉네임</h2><p class="sub">닉네임 변경 때 검사해요. 비교는 대소문자·띄어쓰기·기호 무시, 흔한 숫자 바꿔 쓰기(0→o, 1→i, 3→e…)도 같은 글자로 봐요. 추가·삭제는 감사 로그에 남아요(상세 13).</p>'
 +'<div class="card" style="margin-bottom:14px"><h3>금칙어 추가</h3><div class="row"><input id="wWord" placeholder="단어" maxlength="40"><select id="wKind">'+Object.keys(WK).map(function(k){return '<option value="'+k+'">'+WK[k]+'</option>'}).join('')+'</select><select id="wMatch">'+Object.keys(WM).map(function(k){return '<option value="'+k+'">'+WM[k]+'</option>'}).join('')+'</select><select id="wLang"><option value="ko">한국어</option><option value="en">영어</option><option value="ja">일본어</option><option value="any">공통</option></select><input id="wNote" placeholder="메모" style="flex:1"><button class="btn pri sm" id="wAdd">추가</button></div>'
 +'<div class="row" style="margin-top:8px"><input id="wTest" placeholder="닉네임 미리 검사"><button class="btn sm" id="wTry">검사</button><span id="wTestOut" class="small"></span></div></div>'
 +'<div class="grid g2" style="margin-bottom:14px"><div class="card"><h3>일괄 추가</h3><p class="small muted">쉼표나 줄바꿈으로 나눠 붙여 넣어요(최대 500개). 위에서 고른 종류·방식·언어·메모가 모두에 적용돼요. 이미 있는 단어는 건너뛰고, 감사 로그는 한 줄로 남아요.</p><textarea id="wBulk" rows="5" style="width:100%" placeholder="씨발, 시발, 병신"></textarea><div class="row" style="margin-top:8px"><button class="btn pri sm" id="wBulkGo">일괄 추가</button><span id="wBulkOut" class="small"></span></div></div>'
 +'<div class="card"><h3>여러 닉네임 미리 검사(오탐 점검)</h3><p class="small muted">평범한 닉네임을 쉼표·줄바꿈으로 넣으면 걸리는 것과 걸린 단어를 보여 줘요.</p><textarea id="wMany" rows="5" style="width:100%" placeholder="사랑해, 새끼고양이, 성기사"></textarea><div class="row" style="margin-top:8px"><button class="btn sm" id="wManyGo">검사</button></div><div id="wManyOut" class="small" style="margin-top:8px"></div></div></div>'
 +'<div class="grid g2"><div class="card"><h3>금칙어 '+w.length+'개</h3><div class="row" style="margin-bottom:8px"><input id="wq" placeholder="찾기" value="'+esc(T.wq||'')+'"><button class="btn sm" id="wFind">찾기</button></div>'
 +table(['단어','종류','방식','언어','메모','추가','작업'],w.map(function(x){return '<tr><td><b>'+esc(x.word)+'</b></td><td>'+WK[x.kind]+'</td><td><select class="sm" data-wm="'+x.id+'" data-cur="'+x.match+'">'+Object.keys(WM).map(function(k){return '<option value="'+k+'"'+(k===x.match?' selected':'')+'>'+WM[k]+'</option>'}).join('')+'</select></td><td>'+x.lang+'</td><td class="small">'+esc(x.note)+'</td><td class="small">'+esc(x.by||'기본')+'<br>'+fmt(x.createdAt)+'</td><td><button class="btn sm" data-wdel="'+x.id+'">삭제</button></td></tr>'}))+'</div>'
 +'<div class="card"><h3>허용 단어(예외) '+al.length+'개</h3><p class="small muted">닉네임에서 허용 단어를 먼저 빼고 남은 글자로 금칙어를 검사해요. 성기사는 통과, 성기사성기는 거부(기획답변 19차). 추가·삭제는 관리자만.</p>'
 +(ADM?'<textarea id="aBulk" rows="3" style="width:100%" placeholder="성기사, 시발점, 새끼고양이"></textarea><div class="row" style="margin:8px 0"><input id="aNote" placeholder="메모" style="flex:1"><button class="btn pri sm" id="aGo">허용 단어 추가</button></div>':'')
 +table(['단어','메모','추가','작업'],al.map(function(x){return '<tr><td><b>'+esc(x.word)+'</b></td><td class="small">'+esc(x.note)+'</td><td class="small">'+esc(x.by||'-')+'<br>'+fmt(x.createdAt)+'</td><td>'+(ADM?'<button class="btn sm" data-adel="'+x.id+'">삭제</button>':'')+'</td></tr>'}))+'</div>'
 +'<div class="card"><h3>지금 걸리는 닉네임 '+f.length+'명</h3><p class="small muted">검토 후 강제 변경하면 임시 닉네임 + 무료 변경권 + 경고(상세 13).</p>'
 +table(['닉네임','걸린 단어','작업'],f.map(function(u){return '<tr><td>'+esc(u.name)+'<div class="small muted">'+u.id+'</div></td><td>'+u.hits.map(function(h){return esc(h.word)}).join(', ')+'</td><td><button class="btn sm" data-ren="'+u.id+'">강제 변경</button></td></tr>'}))+'</div></div>'})};
V.words.bind=function(){var v=$('view');if(!$('wAdd'))return;
 $('wAdd').onclick=function(){api('/words',{word:val('wWord'),kind:val('wKind'),match:val('wMatch'),lang:val('wLang'),note:val('wNote')}).then(function(){toast('금칙어 추가');render()}).catch(fail)};
 $('wFind').onclick=function(){T.wq=val('wq');render()};
 $('wBulkGo').onclick=function(){var t=val('wBulk');if(!t)return toast('단어를 넣어 주세요');api('/words/bulk',{text:t,kind:val('wKind'),match:val('wMatch'),lang:val('wLang'),note:val('wNote')}).then(function(j){toast('추가 '+j.added+'개'+(j.skipped.length?' · 이미 있음 '+j.skipped.length:'')+(j.invalid.length?' · 형식 오류 '+j.invalid.length:''));T.wBulkMsg='추가 '+j.added+'개'+(j.skipped.length?' · 건너뜀: '+j.skipped.join(', '):'')+(j.invalid.length?' · 형식 오류: '+j.invalid.join(', '):'');render()}).catch(fail)};
 if(T.wBulkMsg){$('wBulkOut').textContent=T.wBulkMsg;T.wBulkMsg=null}
 $('wManyGo').onclick=function(){api('/words/check',{names:val('wMany')}).then(function(j){var bad=j.results.filter(function(r){return r.hits.length});$('wManyOut').innerHTML='<b>'+j.results.length+'개 중 '+bad.length+'개 걸림</b><br>'+j.results.map(function(r){return r.hits.length?'<span class="tag bad">'+esc(r.name)+' ← '+r.hits.map(function(h){return esc(h.word)+'('+WM[h.match]+')'}).join(', ')+'</span>':'<span class="tag ok">'+esc(r.name)+'</span>'}).join(' ')}).catch(fail)};
 $('wTry').onclick=function(){api('/words/test?name='+encodeURIComponent(val('wTest'))).then(function(j){$('wTestOut').innerHTML=j.hits.length?'<span class="tag bad">걸림: '+j.hits.map(function(h){return esc(h.word)}).join(', ')+'</span>':'<span class="tag ok">통과</span>'}).catch(fail)};
 if($('aGo'))$('aGo').onclick=function(){var t=val('aBulk');if(!t)return toast('단어를 넣어 주세요');api('/words/allowed',{text:t,note:val('aNote')}).then(function(j){toast('허용 단어 '+j.added+'개 추가'+(j.skipped.length?' · 이미 있음 '+j.skipped.length:''));render()}).catch(fail)};
 v.onchange=function(e){var m=e.target.closest('[data-wm]');if(!m)return;var why=prompt('방식 변경 사유(감사 로그)','오탐');if(!why){m.value=m.dataset.cur;return}api('/words/match',{id:Number(m.dataset.wm),match:m.value,reason:why}).then(function(){toast('방식 변경');render()}).catch(function(er){m.value=m.dataset.cur;fail(er)})};
 v.onclick=function(e){var d=e.target.closest('[data-wdel]'),r=e.target.closest('[data-ren]'),ad=e.target.closest('[data-adel]');
  if(ad){var w3=prompt('허용 단어 삭제 사유(감사 로그)');if(!w3)return;api('/words/allowed/remove',{id:Number(ad.dataset.adel),reason:w3}).then(function(){toast('삭제');render()}).catch(fail)}
  if(d){var why=prompt('삭제 사유(감사 로그)');if(!why)return;api('/words/remove',{id:Number(d.dataset.wdel),reason:why}).then(function(){toast('삭제');render()}).catch(fail)}
  if(r){var why2=prompt('강제 변경 사유(감사 로그·유저 경고)','부적절한 닉네임');if(!why2)return;api('/user/sanction',{account:r.dataset.ren,kind:'rename',reason:why2}).then(function(){toast('강제 변경 완료');render()}).catch(fail)}}};

/* ---------- 대시보드 ---------- */
V.dashboard=function(){return api('/dashboard').then(function(d){var m=d.matchesToday||{};
 var k=[['전체 계정',num(d.accounts)],['오늘 신규',num(d.newToday)],['오늘 접속',num(d.activeToday)],['오늘 판(랭킹·AI랭킹·연습·친구)',[m.ranked||0,m.ranked_ai||0,m.practice||0,m.friend||0].join(' · ')],
  ['AI 전환율(오늘)',d.aiFallbackRate==null?'-':d.aiFallbackRate+'%'],['랭킹전 이탈률(오늘)',d.leaveRate==null?'-':d.leaveRate+'%'],['판 길이 평균',d.avgTurns==null?'-':d.avgTurns+'턴 · '+(d.avgBattleSec||0)+'초'],['오늘 매출',' ₩'+num(d.revenueToday)],
  ['오늘 지급 골드',num(d.goldIssuedToday)],['검수·배포 대기',num(d.pendingReviews)],['처리 안 한 신고',num(d.openReports)],['라이브 데이터','v'+d.liveVersion]];
 return '<h2>대시보드</h2><p class="sub">오늘 = 05:00(한국 시간) 기준. 캐릭터 표는 최근 7일 랭킹전('+num(d.rankedGames7d)+'판). 승률 45~55% 밖·밴률 40% 이상은 빨간 표시(상세 11).</p>'
 +'<div class="grid g4">'+k.map(function(x){return '<div class="card"><div class="muted small">'+x[0]+'</div><div class="kpi">'+x[1]+'</div></div>'}).join('')+'</div>'
 +(d.assetUsage?'<div class="card" style="margin-top:14px"><h3>에셋 저장소(무료 한도)</h3>'+usageBox(d.assetUsage)+'</div>':'')
 +'<div class="card" style="margin-top:14px"><h3>캐릭터 승률·픽률·밴률(최근 7일)</h3>'+table(['캐릭터','판수','승률','픽률','밴률'],(d.characters7d||[]).map(function(c){return '<tr><td>'+c.id+'</td><td>'+c.games+'</td><td><span class="tag '+(c.winRate>55||c.winRate<45?'bad':'ok')+'">'+c.winRate+'%</span></td><td>'+c.pickRate+'%</td><td><span class="tag '+(c.banRate>=40?'bad':'')+'">'+(c.banRate||0)+'%</span></td></tr>'}))+'</div>'})};

/* ---------- 데이터 배포 ---------- */
var STATE={editing:['초안',''],review:['검수 대기','warn'],approved:['승인됨','acc'],scheduled:['배포 예약','acc'],rejected:['반려됨','bad'],published:['배포됨','ok'],discarded:['폐기','']};
function stTag(v,live){if(v.id===live)return '<span class="tag ok">라이브</span>';var s=STATE[v.state]||[v.status,''];return '<span class="tag '+s[1]+'">'+s[0]+(v.state==='scheduled'?' · '+fmt(v.scheduled_for):'')+'</span>'}
function valBox(va){if(!va||!va.summary)return '';var s=va.summary;
 return '<ul class="checks">'+(va.errors||[]).map(function(x){return '<li class="no">'+esc(x)+'</li>'}).join('')+(va.blocks||[]).map(function(x){return '<li class="no">[검수 차단] '+esc(x)+'</li>'}).join('')+(va.warnings||[]).map(function(x){return '<li class="wn">'+esc(x)+'</li>'}).join('')
 +(!(va.errors||[]).length&&!(va.blocks||[]).length?'<li>자동 검증 통과 · 캐릭터 '+s.characters+' · 카드 '+s.cards+' · 스펠 '+s.spells+' · 설정 '+s.settings+' · 추천덱 '+s.presets+' · 표 '+(s.tables||[]).join(',')+'</li>':'')+'</ul>'}
var KIND={characters:'캐릭터',cards:'카드',spells:'스펠',settings:'설정',presets:'추천덱',tables:'표'};
function short(v){if(v&&typeof v==='object'&&v.name&&v.metric)return v.name+' · '+v.metric+' '+v.target+(v.aux&&Object.keys(v.aux).length?' ('+Object.keys(v.aux).map(function(k){return k+'='+v.aux[k]}).join(',')+')':'')+' · '+v.scope+' · '+v.gold+'G';
 var s=typeof v==='object'?JSON.stringify(v):String(v);return s.length>120?s.slice(0,120)+'…':s}
function diffBox(diff){if(!diff)return '';if(!diff.length)return '<p class="muted small">라이브와 차이 없음</p>';
 return table(['구분','ID','항목','이전','이후'],diff.slice(0,300).map(function(x){return '<tr><td>'+KIND[x.kind]+'</td><td>'+esc(x.id)+'</td><td>'+esc(x.field||({added:'추가',removed:'삭제',changed:'변경'})[x.change])+'</td><td class="wrap muted">'+esc(x.from===undefined?'':short(x.from))+'</td><td class="wrap"><b>'+esc(x.to===undefined?'':short(x.to))+'</b></td></tr>'}))+(diff.length>300?'<p class="small muted">… '+diff.length+'건 중 300건</p>':'')}
V.data=function(){return api('/data/versions').then(function(d){T.cache.versions=d;var P=T.perms,live=d.live;
 var rows=d.versions.map(function(v){var a=[];
  if(P.data_edit&&(v.state==='editing'||v.state==='rejected'))a.push('<button class="btn sm pri" data-act="request" data-v="'+v.id+'">검수 요청</button>');
  if(P.data_review&&v.state==='review')a.push('<button class="btn sm pri" data-act="approve" data-v="'+v.id+'">승인</button><button class="btn sm bad" data-act="reject" data-v="'+v.id+'">반려</button>');
  if(P.data_deploy&&(v.state==='approved'||v.state==='scheduled'))a.push('<input type="datetime-local" id="at'+v.id+'" class="small"><button class="btn sm" data-act="schedule" data-v="'+v.id+'">예약</button>'+(v.state==='scheduled'?'<button class="btn sm" data-act="unschedule" data-v="'+v.id+'">예약 취소</button>':'')+'<button class="btn sm pri" data-act="publish" data-v="'+v.id+'">지금 배포</button>');
  if(P.data_edit&&['editing','rejected','review','approved'].indexOf(v.state)>=0)a.push('<button class="btn sm" data-act="discard" data-v="'+v.id+'">폐기</button>');
  if(P.data_deploy&&v.status==='published'&&v.id!==live)a.push('<button class="btn sm bad" data-act="rollback" data-v="'+v.id+'">이 버전으로 롤백</button>');
  if(v.based_on)a.push('<button class="btn sm" data-act="diff" data-v="'+v.id+'" data-base="'+v.based_on+'">기준 v'+v.based_on+' 대비</button>');
  if(v.id!==live)a.push('<button class="btn sm" data-act="diff" data-v="'+v.id+'">라이브 대비</button>');
  var vv=v.validation||{};
  return '<tr><td><b>v'+v.id+'</b>'+(v.based_on?'<div class="small muted">기준 v'+v.based_on+'</div>':'')+'</td><td>'+stTag(v,live)+(v.kind==='rollback'?' <span class="tag">롤백</span>':'')+'</td><td class="wrap">'+esc(v.note)+(v.reject_reason?'<div class="small" style="color:var(--bad)">반려: '+esc(v.reject_reason)+'</div>':'')
  +((vv.blocks||[]).length?'<div class="small" style="color:var(--bad)">검수 차단 '+vv.blocks.length+'건</div>':'')+((vv.warnings||[]).length?'<div class="small" style="color:var(--warn)">경고 '+vv.warnings.length+'건</div>':'')+'</td>'
  +'<td class="small">'+esc(v.created_login||'')+'<br>'+fmt(v.created_at)+'</td><td class="small">'+(v.reviewed_login?esc(v.reviewed_login)+'<br>'+fmt(v.reviewed_at):'-')+'</td><td class="small">'+fmt(v.published_at)+'</td><td><div class="row">'+a.join('')+'</div></td></tr>'});
 return '<h2>데이터 배포</h2><p class="sub">수치 테이블 xlsx 업로드 → 자동 검증 → 검수('+(T.solo?'<b>1인 운영 모드: 관리자는 본인 초안도 승인 가능</b>':'자기 승인 불가')+') → 예약·즉시 배포 → 롤백. 배포하면 다음 판부터 적용되고 진행 중인 판은 시작 시점 데이터 그대로예요(상세 14). 숫자는 xlsx가 기준이라 화면에서 직접 고치지 않아요.</p>'
 +(P.data_edit?'<div class="card" style="margin-bottom:14px"><h3>xlsx 업로드 → 새 초안</h3><div class="row"><input type="file" id="upFile" accept=".xlsx"><input id="upNote" placeholder="변경 사유(패치 노트·감사 로그, 5자 이상)" style="flex:1;min-width:260px"><button class="btn pri" id="upGo">업로드·검증</button></div><div id="upOut" style="margin-top:10px"></div></div>':'')
 +'<div class="card"><h3>버전 (라이브 v'+live+')</h3>'+table(['버전','상태','내용·검증','만든 사람','검수','배포','작업'],rows)+'</div><div class="card" id="diffOut" style="margin-top:14px" hidden></div>'})};
V.data.bind=function(){var up=$('upGo');
 if(up)up.onclick=function(){var f=$('upFile').files[0];if(!f){toast('xlsx 파일을 고르세요');return}if(val('upNote').length<5){toast('변경 사유를 5자 이상 적어 주세요');return}
  up.disabled=true;$('upOut').innerHTML='<span class="muted">검증 중…</span>';
  f.arrayBuffer().then(function(buf){return api('/data/import?note='+encodeURIComponent(val('upNote'))+'&file='+encodeURIComponent(f.name),buf,true)})
   .then(function(j){if(!j.ok){$('upOut').innerHTML='<div class="note">오류가 있어 초안을 만들지 않았어요. xlsx를 고쳐 다시 올려 주세요.</div>'+valBox(j.validation);return}
    toast('초안 v'+j.version+' 저장');V.data().then(function(h){$('view').innerHTML=h;V.data.bind();$('upOut').innerHTML='<b>초안 v'+j.version+'</b>'+valBox(j.validation)+'<div class="hr"></div><b>라이브 대비 변경 '+j.diff.length+'건</b>'+diffBox(j.diff)})})
   .catch(fail).then(function(){up.disabled=false})};
 $('view').onclick=function(e){var b=e.target.closest('button[data-act]');if(!b)return;var v=Number(b.dataset.v),act=b.dataset.act,p;
  if(act==='diff'){var bs=b.dataset.base;api('/data/diff?version='+v+(bs?'&base='+bs:'')).then(function(j){var o=$('diffOut');o.hidden=false;o.innerHTML='<h3>v'+j.base+' → v'+v+' 변경 '+j.diff.length+'건'+(bs?' (기준 버전 대비)':' (라이브 대비)')+'</h3>'+diffBox(j.diff);o.scrollIntoView({behavior:'smooth'})}).catch(fail);return}
  if(act==='publish'){if(!confirm('v'+v+'를 지금 라이브로 배포할까요? 다음 판부터 적용돼요.'))return;p=api('/data/publish',{version:v})}
  else if(act==='rollback'){var r=prompt('v'+v+' 내용으로 롤백(새 버전으로 기록). 사유(5자 이상):');if(!r)return;p=api('/data/rollback',{target:v,reason:r})}
  else{var body={version:v,action:act};
   if(act==='reject'){body.reason=prompt('반려 사유:');if(!body.reason)return}
   if(act==='schedule'){var at=$('at'+v).value;if(!at){toast('예약 일시를 고르세요');return}body.at=new Date(at).toISOString()}
   if(act==='discard'&&!confirm('v'+v+' 초안을 폐기할까요?'))return;p=api('/data/review',body)}
  p.then(function(){toast('완료');render()}).catch(fail)}};

/* ---------- 라이브 데이터 보기 ---------- */
function liveData(){if(T.cache.live)return Promise.resolve(T.cache.live);return api('/data/version').then(function(j){T.cache.live=j;setTimeout(function(){T.cache.live=null},30000);return j})}
var ro='<p class="sub">라이브 데이터(읽기 전용). 바꾸려면 xlsx를 고쳐 <b>데이터 배포</b>에서 올려요(xlsx가 숫자 기준).</p>';
function kv(o){return Object.keys(o||{}).map(function(k){return k+'='+o[k]}).join('; ')||'<span class="muted">기본값</span>'}
V.characters=function(){return liveData().then(function(j){var d=j.data,s=d.settings;
 return '<h2>캐릭터 <span class="tag ok">v'+j.version+'</span></h2>'+ro+'<div class="card">'+table(['ID','이름','진영·등급','역할','HP / ATK / DEF / SPD / CRIT','패시브','액티브'],Object.keys(d.characters).map(function(id){var c=d.characters[id];
  return '<tr><td><b>'+id+'</b></td><td>'+esc(c.name)+'<div class="small muted">'+esc(c.job)+'</div></td><td>'+esc(c.faction)+' · '+esc(c.rarity)+'</td><td>'+esc(c.role)+'</td><td>'+[c.hp,c.atk,c.def,c.spd,c.crit].join(' / ')+'</td>'
  +'<td class="wrap"><b>'+esc(c.passive_name)+'</b> '+esc(c.passive_text)+'<div class="small muted">'+kv(c.passive_params)+'</div></td><td class="wrap"><b>'+esc(c.active_name)+'</b> '+esc(c.active_text)+'<div class="small muted">'+kv(c.active_params)+'</div></td></tr>'}))
  +'<p class="small muted">스탯 예산 기준 '+(s.stat_budget_target||'-')+' ±'+Math.round((s.stat_budget_tol||0)*100)+'% (설정값). 업로드 때 자동 검증해요.</p></div>'})};
V.cards=function(){return liveData().then(function(j){var d=j.data;return '<h2>전투카드 <span class="tag ok">v'+j.version+'</span></h2>'+ro+'<div class="card">'+table(['ID','카드','종류','단계','비용','계수','타수','관통','소속','효과'],Object.keys(d.cards).sort().map(function(id){var c=d.cards[id];
 return '<tr><td>'+id+'</td><td>'+esc(c.name)+'</td><td>'+c.kind+'</td><td>'+c.phase+'</td><td>'+c.cost+'</td><td>'+(c.coef==null?'-':c.coef)+'</td><td>'+c.hits+'</td><td>'+c.pierce+'</td><td>'+(c.owner_character||'공용')+'</td><td class="wrap">'+esc(c.effect_text)+'</td></tr>'}))+'</div>'})};
V.spells=function(){return liveData().then(function(j){var d=j.data;return '<h2>스펠 <span class="tag ok">v'+j.version+'</span></h2>'+ro+'<div class="card">'+table(['ID','스펠','효과','효과값','쿨다운'],Object.keys(d.spells).sort().map(function(id){var c=d.spells[id];return '<tr><td>'+id+'</td><td>'+esc(c.name)+'</td><td class="wrap">'+esc(c.effect_text)+'</td><td>'+(c.value==null?'-':c.value)+'</td><td>'+c.cooldown+'턴</td></tr>'}))+'</div>'})};
V.settings=function(){return liveData().then(function(j){var d=j.data;return '<h2>설정값 <span class="tag ok">v'+j.version+'</span></h2>'+ro+'<div class="card">'+table(['키','값'],Object.keys(d.settings).sort().map(function(k){return '<tr><td>'+k+'</td><td>'+esc(JSON.stringify(d.settings[k]))+'</td></tr>'}))+'</div>'})};

/* ---------- 상점 ---------- */
var OST={live:['판매 중','ok'],scheduled:['예약','acc'],ended:['종료',''],off:['꺼짐','bad']};
function dtl(v){if(!v)return '';var d=new Date(v);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
function iso(id){var v=val(id);return v?new Date(v).toISOString():null}
V.shop=function(){return api('/shop').then(function(d){T.cache.shop=d;
 return '<h2>상점·상품</h2><p class="sub">상품(외형·캐릭터) 등록과 판매 설정(가격·기간·노출). 확률형 없음, 능력치 상품 없음(상세 07). 가격은 가정값.</p>'
 +'<div class="card"><h3>판매 설정</h3>'+table(['판매 ID','상품','탭','골드','원화','기간','슬롯','상태','판매 수',''],d.offers.map(function(o){var s=OST[o.state];return '<tr><td>'+o.id+'</td><td>'+o.item_id+'</td><td>'+o.tab+'</td><td>'+num(o.price_gold)+'</td><td>'+(o.price_krw?'₩'+num(o.price_krw):'-')+'</td><td class="small">'+fmt(o.starts_at)+' ~ '+(o.ends_at?fmt(o.ends_at):'상시')+'</td><td>'+o.slot+'</td><td><span class="tag '+s[1]+'">'+s[0]+'</span></td><td>'+o.sold+'</td><td><button class="btn sm" data-eo="'+o.id+'">수정</button></td></tr>'}))
 +'<div class="hr"></div><div class="grid g4" id="of"><label class="f">판매 ID<input id="ofId" placeholder="O_STAR_BACK"></label><label class="f">상품 ID<select id="ofItem">'+d.items.map(function(i){return '<option>'+i.id+'</option>'}).join('')+'</select></label><label class="f">탭<select id="ofTab"><option>featured</option><option>skin</option><option>cosmetic</option><option>bundle</option><option>character</option></select></label><label class="f">슬롯<input id="ofSlot" type="number" value="0"></label>'
 +'<label class="f">골드 가격(없으면 비움)<input id="ofGold" type="number"></label><label class="f">원화 가격(없으면 비움)<input id="ofKrw" type="number"></label><label class="f">시작<input id="ofStart" type="datetime-local"></label><label class="f">종료(비우면 상시)<input id="ofEnd" type="datetime-local"></label><label class="f">판매<select id="ofOn"><option value="true">켬</option><option value="false">끔</option></select></label></div><div class="row" style="margin-top:8px"><button class="btn pri" id="ofSave">판매 설정 저장</button></div></div>'
 +'<div class="card" style="margin-top:14px"><h3>상품 카탈로그</h3>'+table(['상품 ID','종류','캐릭터','이름','연출 등급','기본 보유','번들 구성','',''],d.items.map(function(i){return '<tr><td>'+i.id+'</td><td>'+i.kind+'</td><td>'+(i.character_id||'-')+'</td><td>'+esc(i.name)+'</td><td>'+i.grade+'</td><td>'+(i.default_owned?'예':'')+'</td><td>'+(i.bundle_items||[]).join(', ')+'</td><td>'+(i.enabled?'':'<span class="tag bad">꺼짐</span>')+'</td><td><button class="btn sm" data-ei="'+i.id+'">수정</button></td></tr>'}))
 +'<div class="hr"></div><div class="grid g4"><label class="f">상품 ID<input id="itId" placeholder="SKIN_AU_SUMMER"></label><label class="f">종류<select id="itKind"><option>skin</option><option>skin_premium</option><option>skin_limited</option><option>holo</option><option>cardback</option><option>frame</option><option>emote</option><option>title</option><option>character</option><option>bundle</option></select></label><label class="f">캐릭터(스킨·홀로)<input id="itChar" placeholder="AU"></label><label class="f">이름<input id="itName"></label>'
 +'<label class="f">연출 등급<input id="itGrade" type="number" value="1"></label><label class="f">번들 구성(쉼표)<input id="itBundle"></label><label class="f">사용<select id="itOn"><option value="true">켬</option><option value="false">끔</option></select></label></div><div class="row" style="margin-top:8px"><button class="btn pri" id="itSave">상품 저장</button></div><p class="small muted">이미지(스킨 그림)는 에셋 저장소(R2) 연결 후 추가돼요.</p></div>'})};
V.shop.bind=function(){var d=T.cache.shop;
 $('view').onclick=function(e){var b=e.target.closest('button');if(!b)return;
  if(b.dataset.eo){var o=d.offers.find(function(x){return x.id===b.dataset.eo});$('ofId').value=o.id;$('ofItem').value=o.item_id;$('ofTab').value=o.tab;$('ofSlot').value=o.slot;$('ofGold').value=o.price_gold||'';$('ofKrw').value=o.price_krw||'';$('ofStart').value=dtl(o.starts_at);$('ofEnd').value=dtl(o.ends_at);$('ofOn').value=String(o.enabled);$('ofId').scrollIntoView({behavior:'smooth'})}
  if(b.dataset.ei){var i=d.items.find(function(x){return x.id===b.dataset.ei});$('itId').value=i.id;$('itKind').value=i.kind;$('itChar').value=i.character_id||'';$('itName').value=i.name;$('itGrade').value=i.grade;$('itBundle').value=(i.bundle_items||[]).join(',');$('itOn').value=String(i.enabled);$('itId').scrollIntoView({behavior:'smooth'})}
  if(b.id==='ofSave')api('/shop/offer',{id:val('ofId').toUpperCase(),item_id:val('ofItem'),tab:val('ofTab'),slot:Number(val('ofSlot')||0),price_gold:val('ofGold')?Number(val('ofGold')):null,price_krw:val('ofKrw')?Number(val('ofKrw')):null,starts_at:iso('ofStart'),ends_at:iso('ofEnd'),enabled:val('ofOn')==='true'}).then(function(){toast('저장');render()}).catch(fail);
  if(b.id==='itSave')api('/shop/item',{id:val('itId').toUpperCase(),kind:val('itKind'),character_id:val('itChar').toUpperCase(),name:val('itName'),grade:Number(val('itGrade')||1),bundle_items:val('itBundle')?val('itBundle').split(',').map(function(s){return s.trim().toUpperCase()}):[],enabled:val('itOn')==='true'}).then(function(){toast('저장');render()}).catch(fail)}};

/* ---------- 배너·공지·우편 ---------- */
V.events=function(){return api('/lobby').then(function(d){T.cache.lobby=d;
 return '<h2>배너·공지·우편</h2><p class="sub">로비 배너(진행 중 최대 5개), 로비 진입 공지 팝업, 전체·조건·개별 우편(상세 05·14). 우편은 계정마다 한 번만 들어가요.</p><div class="grid g2">'
 +'<div class="card"><h3>로비 배너</h3>'+table(['#','제목','이동','기간','',''],d.banners.map(function(b){return '<tr><td>'+b.slot+'</td><td>'+esc(b.title)+'</td><td>'+esc(b.link)+'</td><td class="small">'+fmt(b.starts_at)+' ~ '+(b.ends_at?fmt(b.ends_at):'상시')+'</td><td>'+(b.enabled?'':'<span class="tag bad">꺼짐</span>')+'</td><td><button class="btn sm" data-eb="'+b.id+'">수정</button></td></tr>'}))
 +'<div class="hr"></div><input type="hidden" id="bnId"><div class="grid g2"><label class="f">제목<input id="bnTitle"></label><label class="f">이동(예: shop:OFFER_ID)<input id="bnLink"></label><label class="f">이미지 URL(선택)<input id="bnImg"></label><label class="f">순서 1~5<input id="bnSlot" type="number" value="1"></label><label class="f">시작<input id="bnStart" type="datetime-local"></label><label class="f">종료<input id="bnEnd" type="datetime-local"></label><label class="f">사용<select id="bnOn"><option value="true">켬</option><option value="false">끔</option></select></label></div><div class="row" style="margin-top:8px"><button class="btn pri" id="bnSave">배너 저장</button><button class="btn" id="bnNew">새 배너</button></div></div>'
 +'<div class="card"><h3>공지 팝업</h3>'+table(['제목','기간','',''],d.notices.map(function(n){return '<tr><td>'+esc(n.title)+'</td><td class="small">'+fmt(n.starts_at)+' ~ '+(n.ends_at?fmt(n.ends_at):'상시')+'</td><td>'+(n.enabled?'':'<span class="tag bad">꺼짐</span>')+'</td><td><button class="btn sm" data-en="'+n.id+'">수정</button></td></tr>'}))
 +'<div class="hr"></div><input type="hidden" id="ntId"><label class="f">제목<input id="ntTitle"></label><label class="f">내용<textarea id="ntBody"></textarea></label><div class="grid g3"><label class="f">시작<input id="ntStart" type="datetime-local"></label><label class="f">종료<input id="ntEnd" type="datetime-local"></label><label class="f">사용<select id="ntOn"><option value="true">켬</option><option value="false">끔</option></select></label></div><div class="row" style="margin-top:8px"><button class="btn pri" id="ntSave">공지 저장</button><button class="btn" id="ntNew">새 공지</button></div></div></div>'
 +'<div class="card" style="margin-top:14px"><h3>우편 발송</h3><div class="grid g4"><label class="f">대상<select id="mlType"><option value="all">전체</option><option value="accounts">계정 ID(쉼표·줄바꿈)</option><option value="tier">이번 시즌 티어 이상</option></select></label><label class="f">계정 ID / 최소 티어 번호(골드 III=7)<input id="mlArg"></label><label class="f">골드<input id="mlGold" type="number"></label><label class="f">상품 ID(선택)<input id="mlItem"></label>'
 +'<label class="f">제목<input id="mlTitle" placeholder="점검 보상"></label><label class="f">보관(일)<input id="mlDays" type="number" value="30"></label><label class="f">발송 예약(비우면 바로)<input id="mlAt" type="datetime-local"></label><label class="f">사유(감사 로그)<input id="mlReason"></label></div><label class="f" style="margin-top:8px">내용<textarea id="mlBody"></textarea></label><div class="row" style="margin-top:8px"><button class="btn pri" id="mlSend">발송</button></div>'
 +'<div class="hr"></div>'+table(['#','대상','제목','보상','발송 시각','결과',''],d.mailJobs.map(function(j){return '<tr><td>'+j.id+'</td><td class="small">'+esc(JSON.stringify(j.target))+'</td><td>'+esc(j.title)+'</td><td class="small">'+esc(JSON.stringify(j.rewards))+'</td><td class="small">'+fmt(j.send_at)+'</td><td>'+(j.canceled_at?'<span class="tag">취소</span>':j.sent_at?'<span class="tag ok">'+j.sent_count+'명</span>':'<span class="tag acc">예약</span>')+'</td><td>'+(!j.sent_at&&!j.canceled_at?'<button class="btn sm" data-cj="'+j.id+'">취소</button>':'')+'</td></tr>'}))+'</div>'})};
V.events.bind=function(){var d=T.cache.lobby;
 $('view').onclick=function(e){var b=e.target.closest('button');if(!b)return;
  if(b.dataset.eb){var x=d.banners.find(function(y){return String(y.id)===b.dataset.eb});$('bnId').value=x.id;$('bnTitle').value=x.title;$('bnLink').value=x.link;$('bnImg').value=x.image_url||'';$('bnSlot').value=x.slot;$('bnStart').value=dtl(x.starts_at);$('bnEnd').value=dtl(x.ends_at);$('bnOn').value=String(x.enabled)}
  if(b.dataset.en){var n=d.notices.find(function(y){return String(y.id)===b.dataset.en});$('ntId').value=n.id;$('ntTitle').value=n.title;$('ntBody').value=n.body;$('ntStart').value=dtl(n.starts_at);$('ntEnd').value=dtl(n.ends_at);$('ntOn').value=String(n.enabled)}
  if(b.id==='bnNew'){['bnId','bnTitle','bnLink','bnImg','bnStart','bnEnd'].forEach(function(i){$(i).value=''})}
  if(b.id==='ntNew'){['ntId','ntTitle','ntBody','ntStart','ntEnd'].forEach(function(i){$(i).value=''})}
  if(b.id==='bnSave')api('/lobby/banner',{id:val('bnId')||null,title:val('bnTitle'),link:val('bnLink'),image_url:val('bnImg'),slot:Number(val('bnSlot')||1),starts_at:iso('bnStart'),ends_at:iso('bnEnd'),enabled:val('bnOn')==='true'}).then(function(){toast('저장');render()}).catch(fail);
  if(b.id==='ntSave')api('/lobby/notice',{id:val('ntId')||null,title:val('ntTitle'),body:$('ntBody').value,starts_at:iso('ntStart'),ends_at:iso('ntEnd'),enabled:val('ntOn')==='true'}).then(function(){toast('저장');render()}).catch(fail);
  if(b.dataset.cj)api('/mail/cancel',{id:Number(b.dataset.cj)}).then(function(){toast('취소');render()}).catch(fail);
  if(b.id==='mlSend'){var t=val('mlType'),arg=val('mlArg'),target={type:t};
   if(t==='accounts')target.ids=arg.split(/[\s,]+/).filter(Boolean);if(t==='tier')target.min=Number(arg);
   var rw=[];if(val('mlGold'))rw.push({type:'gold',amount:Number(val('mlGold'))});if(val('mlItem'))rw.push({type:'item',id:val('mlItem').toUpperCase()});
   if(!confirm((t==='all'?'전체 유저':t==='tier'?'티어 '+arg+' 이상':target.ids.length+'명')+'에게 우편을 보낼까요?'))return;
   api('/mail',{target:target,title:val('mlTitle'),body:$('mlBody').value,rewards:rw,days:Number(val('mlDays')||30),send_at:iso('mlAt'),reason:val('mlReason')}).then(function(j){toast(j.sent==null?'예약했어요':j.sent+'명에게 발송');render()}).catch(fail)}}};

/* ---------- 유저 조회·제재 ---------- */
var SK={warn:'경고',rank_restrict:'랭킹전 제한',season_wipe:'시즌 기록 처리',suspend:'계정 정지',rename:'닉네임 강제 변경'};
V.users=function(){return '<h2>유저 조회·제재</h2><p class="sub">계정 검색 → 전적·결제·재화·제재. 모든 조치는 사유 필수, 감사 로그에 남아요(상세 13·14). 조회도 기록돼요.</p>'
 +'<div class="card"><div class="row"><input id="uq" placeholder="계정 ID·닉네임·Steam ID" style="width:320px" value="'+esc(T.uq||'')+'"><button class="btn pri" id="uGo">검색</button></div><div id="uList" style="margin-top:10px"></div></div><div id="uDetail" style="margin-top:14px"></div>'};
V.users.bind=function(){var search=function(){T.uq=val('uq');api('/users?q='+encodeURIComponent(T.uq)).then(function(j){$('uList').innerHTML=table(['계정','닉네임','상태','가입','마지막 접속'],j.users.map(function(u){return '<tr class="click" data-u="'+u.id+'"><td class="small">'+u.id+'</td><td>'+esc(u.name)+'</td><td>'+u.status+'</td><td class="small">'+fmt(u.createdAt)+'</td><td class="small">'+fmt(u.lastLoginAt)+'</td></tr>'}))}).catch(fail)};
 $('uGo').onclick=search;$('uq').onkeydown=function(e){if(e.key==='Enter')search()};if(T.uq)search();if(T.uid)detail(T.uid);
 $('view').onclick=function(e){var r=e.target.closest('tr[data-u]');if(r){detail(r.dataset.u);return}var b=e.target.closest('button');if(!b||!T.uid)return;var id=T.uid,p;
  if(b.id==='gGo'){var dlt=Number(val('gAmt'))*(val('gDir')==='-'?-1:1);p=api('/user/gold',{account:id,delta:dlt,reason:val('gWhy')})}
  if(b.id==='iGo')p=api('/user/item',{account:id,item:val('iId').toUpperCase(),grant:val('iDir')==='+',reason:val('iWhy')});
  if(b.id==='sGo'){if(!confirm(SK[val('sKind')]+' 제재를 할까요?'))return;p=api('/user/sanction',{account:id,kind:val('sKind'),days:val('sDays'),reason:val('sWhy')})}
  if(b.dataset.rv){var r=prompt('제재 해제 사유:');if(!r)return;p=api('/user/sanction/revoke',{id:Number(b.dataset.rv),reason:r})}
  if(p)p.then(function(){toast('완료');detail(id)}).catch(fail)}};
function detail(id){T.uid=id;api('/user?id='+id).then(function(d){var a=d.account,rk=d.rank;
 $('uDetail').innerHTML='<div class="grid g3"><div class="card"><h3>'+esc(a.display_name)+' <span class="tag '+(a.status==='active'?'ok':'bad')+'">'+a.status+(a.banned_until?' ~'+fmt(a.banned_until):'')+'</span></h3><div class="small">'+a.id+'</div><div class="small muted">가입 '+fmt(a.created_at)+' · 마지막 접속 '+fmt(a.last_login_at)+'</div><div class="small">'+d.identities.map(function(i){return i.provider+' '+esc(i.uid)}).join(' · ')+'</div>'
 +'<div class="hr"></div><div>골드 <b>'+num(d.gold)+'</b> · 시즌 '+d.season.id+' '+(rk?'티어 '+rk.tier_no+' · '+rk.rp+'RP'+(rk.excluded?' <span class="tag bad">보드 제외</span>':''):'기록 없음')+' · MMR '+(d.mmr||'-')+'</div></div>'
 +'<div class="card"><h3>재화·상품</h3><div class="row"><select id="gDir"><option value="+">지급</option><option value="-">회수</option></select><input id="gAmt" type="number" placeholder="골드" style="width:100px"><input id="gWhy" placeholder="사유" style="flex:1"><button class="btn" id="gGo">골드</button></div>'
 +'<div class="row" style="margin-top:8px"><select id="iDir"><option value="+">지급</option><option value="-">회수</option></select><input id="iId" placeholder="상품 ID" style="width:140px"><input id="iWhy" placeholder="사유" style="flex:1"><button class="btn" id="iGo">상품</button></div></div>'
 +'<div class="card"><h3>제재(상세 13)</h3><div class="row"><select id="sKind">'+Object.keys(SK).map(function(k){return '<option value="'+k+'">'+SK[k]+'</option>'}).join('')+'</select><input id="sDays" type="number" placeholder="기간(일), 정지는 비우면 영구" style="width:210px"></div><div class="row" style="margin-top:8px"><input id="sWhy" placeholder="사유(필수)" style="flex:1"><button class="btn bad" id="sGo">제재</button></div><p class="small muted">랭킹전 제한 1·7일, 정지 7·30일·영구. 시즌 기록 처리 = 이번 시즌 RP 0·보드 제외(해제하면 복구).</p></div></div>'
 +'<div class="grid g2" style="margin-top:14px"><div class="card"><h3>제재 이력</h3>'+table(['종류','기간','사유','시각',''],d.sanctions.map(function(s){return '<tr><td>'+SK[s.kind]+'</td><td class="small">'+(s.until?'~'+fmt(s.until):s.kind==='suspend'?'영구':'-')+'</td><td class="wrap">'+esc(s.reason)+'</td><td class="small">'+fmt(s.created_at)+(s.revoked_at?'<br><span class="tag">해제 '+fmt(s.revoked_at)+'</span>':'')+'</td><td>'+(s.revoked_at||s.kind==='warn'||s.kind==='rename'?'':'<button class="btn sm" data-rv="'+s.id+'">해제</button>')+'</td></tr>'}))+'</div>'
 +'<div class="card"><h3>최근 판(20)</h3>'+table(['모드','결과','사유','턴','픽','시각'],d.matches.map(function(m){var win=m.outcome===m.seat;return '<tr><td>'+m.mode+'</td><td>'+(m.outcome==='draw'?'무':m.outcome==='void'?'-':win?'<span class="tag ok">승</span>':'<span class="tag bad">패</span>')+'</td><td>'+m.reason+'</td><td>'+m.turns+'</td><td>'+esc((m.picks||[]).join(' vs '))+'</td><td class="small">'+fmt(m.endedAt)+'</td></tr>'}))+'</div>'
 +'<div class="card"><h3>골드 장부(30)</h3>'+table(['변화','잔액','사유','ref','시각'],d.ledger.map(function(l){return '<tr><td style="color:'+(l.delta<0?'var(--bad)':'var(--ok)')+'">'+(l.delta>0?'+':'')+l.delta+'</td><td>'+num(l.balance_after)+'</td><td>'+l.reason+'</td><td class="small">'+esc(l.ref)+'</td><td class="small">'+fmt(l.created_at)+'</td></tr>'}))+'</div>'
 +'<div class="card"><h3>보유 상품·결제</h3>'+table(['상품','종류','출처','시각'],d.inventory.map(function(i){return '<tr><td>'+esc(i.name)+(i.revokedAt?' <span class="tag bad">회수</span>':'')+'</td><td>'+i.kind+'</td><td>'+i.source+'</td><td class="small">'+fmt(i.acquiredAt)+'</td></tr>'}))
 +table(['주문','상품','금액','결제','상태','시각'],d.orders.map(function(o){return '<tr><td>'+o.id+'</td><td>'+o.item_id+'</td><td>₩'+num(o.amount)+'</td><td>'+o.provider+'</td><td>'+o.status+'</td><td class="small">'+fmt(o.created_at)+'</td></tr>'}))+'</div>'
 +'<div class="card"><h3>받은 신고</h3>'+table(['사유','메모','시각','상태'],d.reports.map(function(r){return '<tr><td>'+r.reason+'</td><td class="wrap">'+esc(r.note)+'</td><td class="small">'+fmt(r.created_at)+'</td><td>'+r.status+'</td></tr>'}))+'</div></div>'}).catch(fail)}

/* ---------- 신고 ---------- */
var RR={afk:'고의 지연·잠수',boosting:'승점 몰아주기',cheat:'매크로·버그 악용',name:'부적절한 닉네임',emote_spam:'감정표현 도배'};
V.reports=function(){return api('/reports?status=open').then(function(j){T.cache.reports=j.reports;
 return '<h2>신고</h2><p class="sub">처리 안 한 신고. 같은 상대는 24시간에 1회만 접수돼요. 신고자에게는 "처리됨"만 알려요(상세 13).</p><div class="card">'+table(['','대상','사유','메모','7일 신고 수','시각'],j.reports.map(function(r){return '<tr><td><input type="checkbox" data-rid="'+r.id+'"></td><td><a href="#users" data-user="'+r.target+'">'+esc(r.targetName)+'</a></td><td>'+RR[r.reason]+'</td><td class="wrap">'+esc(r.note)+'</td><td>'+r.targetReports7d+'</td><td class="small">'+fmt(r.createdAt)+'</td></tr>'}))+'<div class="row" style="margin-top:8px"><button class="btn pri" id="rDone">선택 처리 완료</button></div></div>'})};
V.reports.bind=function(){$('view').onclick=function(e){var a=e.target.closest('a[data-user]');if(a){e.preventDefault();T.uid=a.dataset.user;T.uq='';go('users');return}
 if(e.target.id==='rDone'){var ids=[].map.call(document.querySelectorAll('[data-rid]:checked'),function(x){return Number(x.dataset.rid)});if(!ids.length)return;api('/reports/done',{ids:ids}).then(function(){toast('처리');render()}).catch(fail)}}};

/* ---------- 감사 로그 ---------- */
V.audit=function(){return api('/audit?q='+encodeURIComponent(T.aq||'')).then(function(j){T.cache.audit=j.rows;
 return '<h2>감사 로그</h2><p class="sub">누가·언제·무엇을·왜. 수정·삭제할 수 없어요(상세 14).</p><div class="card"><div class="row" style="margin-bottom:8px"><input id="aq" placeholder="대상·행동·아이디 검색" value="'+esc(T.aq||'')+'"><button class="btn" id="aGo">검색</button></div><div id="aRows">'+auditRows(j.rows)+'</div><div class="row" style="margin-top:8px"><button class="btn" id="aMore">더 보기</button></div></div>'})};
function auditRows(rows){return table(['시각','직원','역할','대상','행동','내용','사유'],rows.map(function(l){return '<tr><td class="small">'+fmt(l.at)+'</td><td>'+esc(l.staff_login||'시스템')+'</td><td>'+(ROLE[l.staff_role]||'')+'</td><td>'+esc(l.target)+'</td><td>'+esc(l.action)+'</td><td class="wrap small">'+esc(JSON.stringify(l.detail))+'</td><td class="wrap small">'+esc(l.reason)+'</td></tr>'}))}
V.audit.bind=function(){$('aGo').onclick=function(){T.aq=val('aq');render()};$('aMore').onclick=function(){var r=T.cache.audit;if(!r.length)return;api('/audit?q='+encodeURIComponent(T.aq||'')+'&before='+r[r.length-1].id).then(function(j){T.cache.audit=r.concat(j.rows);$('aRows').innerHTML=auditRows(T.cache.audit)}).catch(fail)}};

/* ---------- 권한 관리 ---------- */
function soloCard(){return '<div class="card" style="margin-top:14px"><h3>1인 운영 모드 <span class="tag '+(T.solo?'warn':'ok')+'">'+(T.solo?'켜짐 · 본인 초안 승인 허용':'꺼짐 · 본인 초안 승인 금지')+'</span></h3><p class="small muted">혼자 운영하는 동안 관리자 1계정으로 업로드·승인·배포까지 하도록 \'본인 초안 승인 금지\' 규칙을 끕니다(관리자만 해당). 팀이 생기면 다시 켜세요. 켜고 끈 기록과 이 모드로 한 승인은 감사 로그에 남아요(상세 14 데이터 반영 경로).</p>'
 +(T.perms.staff?'<div class="row"><input id="soloWhy" placeholder="사유(필수)" style="flex:1"><button class="btn '+(T.solo?'':'pri')+'" id="soloGo">'+(T.solo?'끄기(본인 승인 금지)':'켜기(본인 승인 허용)')+'</button></div>':'<p class="small muted">관리자만 바꿀 수 있어요.</p>')+'</div>'}
V.staff=function(){var pw='<div class="card" style="margin-top:14px"><h3>내 비밀번호 변경</h3><div class="row"><input id="pwCur" type="password" placeholder="현재 비밀번호"><input id="pwNew" type="password" placeholder="새 비밀번호(10자 이상)"><button class="btn" id="pwGo">변경</button></div></div>';
 var perm='<div class="card" style="margin-top:14px"><h3>역할별 권한(상세 14)</h3>'+table(['기능','기획자','검수자','관리자','운영·CS'],[['게임 데이터 업로드·검수 요청','●','','●',''],['검수 승인·반려(자기 초안 제외)','','●','●',''],['배포 예약·실행·롤백','','','●',''],['상점·배너·공지·우편','','','●','●'],['유저 조회, 재화 지급·회수, 제재(사유 필수)','','','●','●'],['감사 로그 보기','●','●','●','●'],['직원 초대·권한 변경','','','●','']].map(function(r){return '<tr>'+r.map(function(x){return '<td>'+(x||'-')+'</td>'}).join('')+'</tr>'}))+'</div>';
 if(!T.perms.staff)return Promise.resolve('<h2>권한 관리</h2>'+soloCard()+perm+pw);
 return api('/staff').then(function(j){return '<h2>권한 관리</h2><p class="sub">직원 초대(초대 코드는 한 번만 보여요, 2일 유효)·역할 변경·비활성화. 관리자는 최소 1명.</p><div class="card">'+table(['아이디','이름','역할','상태','마지막 로그인',''],j.staff.map(function(s){return '<tr><td>'+esc(s.login)+'</td><td>'+esc(s.name)+'</td><td><select data-role="'+s.id+'">'+Object.keys(ROLE).map(function(r){return '<option value="'+r+'" '+(r===s.role?'selected':'')+'>'+ROLE[r]+'</option>'}).join('')+'</select></td><td>'+(s.active?'<span class="tag ok">사용</span>':'<span class="tag bad">비활성</span>')+'</td><td class="small">'+fmt(s.lastLoginAt)+'</td><td><button class="btn sm" data-act="'+s.id+'" data-on="'+!s.active+'">'+(s.active?'비활성화':'다시 사용')+'</button></td></tr>'}))
 +soloCard().replace('<div class="card" style="margin-top:14px">','<div class="hr"></div><div>')+'<div class="hr"></div><div class="row"><select id="invRole">'+Object.keys(ROLE).map(function(r){return '<option value="'+r+'">'+ROLE[r]+'</option>'}).join('')+'</select><button class="btn pri" id="invGo">초대 코드 만들기</button><span id="invOut"></span></div></div>'+perm+pw})};
V.staff.bind=function(){var sg=$('soloGo');if(sg)sg.onclick=function(){var on=!T.solo;if(!confirm(on?'1인 운영 모드를 켤까요? 관리자가 자기 초안을 승인할 수 있게 됩니다.':'1인 운영 모드를 끌까요? 본인 초안 승인이 다시 금지됩니다.'))return;api('/settings',{key:'solo_mode',value:on,reason:val('soloWhy')}).then(function(){T.solo=on;toast(on?'1인 운영 모드 켬':'1인 운영 모드 끔');render()}).catch(fail)};var pg=$('pwGo');if(pg)pg.onclick=function(){api('/password',{current:$('pwCur').value,password:$('pwNew').value}).then(function(){toast('비밀번호를 바꿨어요')}).catch(fail)};
 var ig=$('invGo');if(ig)ig.onclick=function(){api('/staff/invite',{role:val('invRole')}).then(function(j){$('invOut').innerHTML='초대 코드 <span class="code">'+j.code+'</span> <span class="small muted">('+j.expiresInDays+'일, 한 번만 표시)</span>'}).catch(fail)};
 $('view').onchange=function(e){var s=e.target.closest('select[data-role]');if(s)api('/staff/update',{id:s.dataset.role,role:s.value}).then(function(){toast('역할 변경')}).catch(function(er){fail(er);render()})};
 $('view').onclick=function(e){var b=e.target.closest('button[data-act]');if(b)api('/staff/update',{id:b.dataset.act,active:b.dataset.on==='true'}).then(function(){toast('변경');render()}).catch(fail)}};

window.addEventListener('hashchange',function(){var h=location.hash.slice(1);if(h&&h!==T.route){T.route=h;render()}});
if(T.token)boot();else render();
})();
</script></body></html>`;
