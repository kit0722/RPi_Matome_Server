const categories=[['新着','latest'],['主要','top'],['国内','domestic'],['国際','world'],['経済','business'],['エンタメ','entertainment'],['スポーツ','sports'],['IT','it'],['科学','science'],['ライフ','life'],['地域（東海）','local']];
const defaultEnabled=['新着','主要','国内','国際','経済','エンタメ','IT','科学','ライフ','地域（東海）'];
const $=id=>document.getElementById(id),tabs=$('tabs'),list=$('newsList'),statusEl=$('status'),updated=$('updated'),errorEl=$('error'),newestBtn=$('newestBtn'),listPane=$('listPane');
let currentTab='latest',items=[],pending=null,selected='',checking=false,photos=[],photoIndex=0;
function enabled(){try{const v=JSON.parse(localStorage.getItem('yahooSimple:enabledCategories:v1'));if(Array.isArray(v)&&v.length)return new Set(v)}catch{}return new Set(defaultEnabled)}
let enabledSet=enabled();
function fmt(ms){if(!ms)return '';try{return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms))}catch{return ''}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function syncHeader(){document.documentElement.style.setProperty('--header-h',Math.ceil($('appHeader').getBoundingClientRect().height)+'px')}new ResizeObserver(syncHeader).observe($('appHeader'));syncHeader();
function renderTabs(){tabs.innerHTML='';for(const [label,key] of categories){if(label!=='新着'&&!enabledSet.has(label))continue;const b=document.createElement('button');b.className='tab'+(key===currentTab?' active':'');b.textContent=label;b.onclick=()=>{currentTab=key;selected='';document.body.classList.remove('mobile-reading');loadList(true)};tabs.appendChild(b)}}
async function api(path){const r=await fetch(path,{cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw Error(d?.error||'取得できませんでした');return d}
function renderList(){list.innerHTML='';for(const x of items){const row=document.createElement('div');row.className='news-item'+(selected===x.link?' is-selected':'');row.innerHTML=`<div class="thumb-wrap">${x.image_url?`<img class="thumb" src="${esc(x.image_url)}" loading="lazy">`:'<div class="thumb-placeholder">NO IMAGE</div>'}</div><a class="news-link" href="#">${esc(x.title)}</a><span class="time">${esc(fmt(x.date))}</span><span class="source">${esc(x.category_label||'')}</span>`;row.onclick=e=>{e.preventDefault();openArticle(x,row)};list.appendChild(row)}}
async function loadList(manual=false){const token=currentTab;statusEl.textContent='読み込み中...';errorEl.hidden=true;try{const d=await api('/api/list?category='+encodeURIComponent(token)+(manual?'&force=1':''));if(token!==currentTab)return;items=d.items||[];pending=null;newestBtn.hidden=true;renderTabs();renderList();statusEl.textContent=(manual?'更新しました　':'')+items.length+'件';updated.textContent='更新 '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false})}catch(e){errorEl.hidden=false;errorEl.textContent=e.message;statusEl.textContent='取得失敗'}}
async function checkNew(){if(checking||!items.length)return;checking=true;try{const d=await api('/api/list?category='+encodeURIComponent(currentTab));const old=new Set(items.map(x=>x.link));const n=(d.items||[]).filter(x=>!old.has(x.link)).length;if(n){pending=d.items||[];newestBtn.textContent=n>1?'新着あり '+n+'件':'新着あり';newestBtn.hidden=false}}catch{}finally{checking=false}}
newestBtn.onclick=()=>{if(pending){items=pending;pending=null;newestBtn.hidden=true;renderList();listPane.scrollTop=0}};$('refreshBtn').onclick=()=>loadList(true);
async function openArticle(x,row,pushHistory=true){selected=x.link;document.querySelectorAll('.news-item').forEach(n=>n.classList.remove('is-selected'));if(row?.classList)row.classList.add('is-selected');if(pushHistory)history.pushState({view:'article',link:x.link},'',location.pathname+location.search+'#article');$('readerEmpty').hidden=true;$('paneReader').hidden=false;$('paneLoading').hidden=true;$('paneArticle').hidden=false;$('paneError').hidden=true;$('paneOriginalLink').href=x.link;$('paneMeta').textContent=fmt(x.date);$('paneTitle').textContent=x.title||'記事';$('paneHero').hidden=true;$('paneBody').innerHTML='<p>本文を読み込み中...</p>';$('panePhotoGallery').hidden=true;$('paneCommentsStatus').textContent='コメント読み込み中...';$('paneCommentsList').innerHTML='';if(matchMedia('(max-width:700px)').matches)document.body.classList.add('mobile-reading');$('paneReaderScroll').scrollTop=0;try{const d=await api('/api/article?url='+encodeURIComponent(x.link));$('paneMeta').textContent=[d.provider,fmt(d.date)].filter(Boolean).join('　');$('paneTitle').textContent=d.title||x.title;const hero=$('paneHero');hero.hidden=!d.hero_image;if(d.hero_image)hero.src=d.hero_image;const body=$('paneBody');body.innerHTML='';for(const p of d.body||[]){const el=document.createElement('p');el.textContent=p;body.appendChild(el)}photos=[];if(d.hero_image)photos.push({url:d.hero_image,caption:'メイン画像'});for(const p of d.photos||[])photos.push(p);renderPhotos();renderComments(d.comments||[]);$('paneLoading').hidden=true;$('paneArticle').hidden=false;$('paneReaderScroll').scrollTop=0}catch(e){$('paneLoading').hidden=true;$('paneError').hidden=false;$('paneError').textContent=e.message}}
$('mobileBackBtn').onclick=()=>history.back();

function showListFromHistory(){
  document.body.classList.remove('mobile-reading');
  if(matchMedia('(max-width:700px)').matches){
    $('readerEmpty').hidden=false;
    $('paneReader').hidden=true;
  }
}
function restoreHistoryState(state){
  if(state?.view==='article'&&state.link){
    const idx=items.findIndex(v=>v.link===state.link);
    const x=idx>=0?items[idx]:null;
    if(x){
      const row=[...document.querySelectorAll('.news-item')][idx]||null;
      openArticle(x,row,false);
      return;
    }
  }
  showListFromHistory();
}
history.replaceState({view:'list'},'',location.pathname+location.search);
window.addEventListener('popstate',e=>restoreHistoryState(e.state));

let swipeStart=null;
document.addEventListener('touchstart',e=>{
  if(e.touches.length!==1)return;
  const t=e.touches[0];
  swipeStart={x:t.clientX,y:t.clientY,time:performance.now(),target:e.target};
},{capture:true,passive:true});
document.addEventListener('touchend',e=>{
  if(!swipeStart||e.changedTouches.length!==1){swipeStart=null;return}
  const t=e.changedTouches[0],dx=t.clientX-swipeStart.x,dy=t.clientY-swipeStart.y,dt=performance.now()-swipeStart.time;
  const blocked=swipeStart.target?.closest?.('.pane-splitter,.pane-photo-grid,.pane-lightbox');
  swipeStart=null;
  if(blocked||dt>900||Math.abs(dx)<90||Math.abs(dx)<Math.abs(dy)*1.25)return;
  if(dx>0)history.back(); else history.forward();
},{capture:true,passive:true});
function renderPhotos(){const sec=$('panePhotoGallery'),grid=$('panePhotoGrid');grid.innerHTML='';if(!photos.length){sec.hidden=true;return}sec.hidden=false;$('panePhotoGalleryTitle').textContent='記事の写真（'+photos.length+'枚）';photos.forEach((p,i)=>{const b=document.createElement('button');b.className='photo-button';const im=document.createElement('img');im.className='photo-thumb';im.src=p.url;im.alt=p.caption||'記事の写真';b.appendChild(im);b.onclick=()=>openPhoto(i);grid.appendChild(b)})}
function renderComments(cs){$('paneCommentsStatus').textContent=cs.length?cs.length+'件表示（最大30件）':'コメント0件、または取得できませんでした。';const root=$('paneCommentsList');root.innerHTML='';for(const c of cs){const d=document.createElement('div');d.className='comment-card';d.innerHTML=`<div class="comment-user">${esc(c.user||'')}<span class="comment-time">${esc(c.time||'')}</span></div><div class="comment-text">${esc(c.text||'')}</div><div class="comment-reactions">共感 ${Number(c.empathy||0)}　なるほど ${Number(c.insight||0)}　うーん ${Number(c.negative||0)}</div>`;root.appendChild(d)}}
function openPhoto(i){if(!photos.length)return;photoIndex=(i+photos.length)%photos.length;$('paneLightboxImage').src=photos[photoIndex].url;$('paneLightboxCount').textContent=(photoIndex+1)+' / '+photos.length;$('paneLightbox').hidden=false}$('paneLightboxClose').onclick=()=>$('paneLightbox').hidden=true;$('paneLightboxPrev').onclick=e=>{e.stopPropagation();openPhoto(photoIndex-1)};$('paneLightboxNext').onclick=e=>{e.stopPropagation();openPhoto(photoIndex+1)};$('paneLightbox').onclick=e=>{if(e.target===$('paneLightbox'))$('paneLightbox').hidden=true};
async function loadRanks(){const root=$('rankings');root.textContent='読み込み中...';try{const d=await api('/api/rankings');root.innerHTML='';for(const key of ['access','comment']){const g=d.groups?.[key];if(!g)continue;const h=document.createElement('h2');h.textContent=g.title;root.appendChild(h);const ol=document.createElement('ol');for(const x of g.items||[]){const li=document.createElement('li');li.innerHTML=`<div class="rank-row"><div class="rank-thumbbox">${x.image_url?`<img class="rank-thumb" src="${esc(x.image_url)}">`:''}</div><a class="rank-title" href="#">${esc(x.title)}</a></div>`;li.onclick=e=>{e.preventDefault();setRank(false);openArticle(x,li,true)};ol.appendChild(li)}root.appendChild(ol)}}catch(e){root.textContent=e.message}}
function setRank(open){$('rankingDrawer').classList.toggle('open',open);$('rankingToggle').classList.toggle('open',open);$('drawerBackdrop').hidden=!open;if(open)loadRanks()}$('rankingToggle').onclick=()=>setRank(!$('rankingDrawer').classList.contains('open'));$('rankingClose').onclick=()=>setRank(false);$('drawerBackdrop').onclick=()=>setRank(false);
const modal=$('displaySettingsModal'),checks=$('displaySettingsChecks'),fontScale=$('fontScale'),fontScaleValue=$('fontScaleValue');
const FONT_SCALE_KEY='yahooSimple:fontScale:v1';
function clampFontScale(v){return Math.max(80,Math.min(150,Math.round((Number(v)||100)/5)*5))}
function savedFontScale(){return clampFontScale(localStorage.getItem(FONT_SCALE_KEY)||100)}
function applyFontScale(percent){
  const p=clampFontScale(percent),s=p/100,root=document.documentElement.style;
  const set=(name,base)=>root.setProperty(name,(base*s).toFixed(1)+'px');
  set('--news-font',14);set('--time-font',11);set('--source-font',10);set('--meta-font',13);
  set('--article-title-font',30);set('--body-font',18);set('--comment-user-font',14);
  set('--comment-font',16);set('--comment-meta-font',12);set('--rank-font',12);set('--tab-font',14);
  fontScale.value=String(p);fontScaleValue.textContent=p+'%';
  return p;
}
let fontScaleBeforeOpen=savedFontScale();
applyFontScale(fontScaleBeforeOpen);
function openSettings(){
  checks.innerHTML='';
  for(const [label] of categories.filter(x=>x[0]!=='新着')){
    const l=document.createElement('label');l.className='display-settings-check';
    const c=document.createElement('input');c.type='checkbox';c.value=label;c.checked=enabledSet.has(label);
    l.append(c,document.createTextNode(label));checks.appendChild(l)
  }
  fontScaleBeforeOpen=savedFontScale();applyFontScale(fontScaleBeforeOpen);modal.hidden=false
}
function closeSettings(save=false){
  if(!save)applyFontScale(fontScaleBeforeOpen);
  modal.hidden=true
}
fontScale.oninput=()=>applyFontScale(fontScale.value);
$('fontScaleDown').onclick=()=>applyFontScale(clampFontScale(Number(fontScale.value)-5));
$('fontScaleUp').onclick=()=>applyFontScale(clampFontScale(Number(fontScale.value)+5));
$('displaySettingsBtn').onclick=openSettings;
$('displaySettingsClose').onclick=()=>closeSettings(false);
$('displaySettingsCancel').onclick=()=>closeSettings(false);
modal.querySelector('[data-settings-close]').onclick=()=>closeSettings(false);
$('displaySettingsSave').onclick=()=>{
  const next=new Set([...checks.querySelectorAll('input:checked')].map(x=>x.value));
  if(!next.size)return;
  enabledSet=next;
  localStorage.setItem('yahooSimple:enabledCategories:v1',JSON.stringify([...next]));
  const saved=applyFontScale(fontScale.value);
  localStorage.setItem(FONT_SCALE_KEY,String(saved));
  fontScaleBeforeOpen=saved;
  renderTabs();closeSettings(true);
  if(![...tabs.children].some(x=>x.classList.contains('active'))){currentTab='latest';loadList(true)}
};
const splitter=$('paneSplitter'),workspace=$('workspace');let dragging=false;function applyWidth(x,persist=false){if(matchMedia('(max-width:700px)').matches)return;const max=Math.max(260,Math.min(620,workspace.getBoundingClientRect().width-420));const w=Math.max(260,Math.min(max,Number(x)||370));document.documentElement.style.setProperty('--list-w',Math.round(w)+'px');if(persist)localStorage.setItem('yahooSimple:listPaneWidth',String(w))}applyWidth(Number(localStorage.getItem('yahooSimple:listPaneWidth'))||370);splitter.onpointerdown=e=>{dragging=true;splitter.setPointerCapture(e.pointerId)};splitter.onpointermove=e=>{if(dragging)applyWidth(e.clientX-workspace.getBoundingClientRect().left)};splitter.onpointerup=e=>{if(!dragging)return;dragging=false;applyWidth(e.clientX-workspace.getBoundingClientRect().left,true)};
renderTabs();loadList(false);setInterval(checkNew,60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkNew()});
