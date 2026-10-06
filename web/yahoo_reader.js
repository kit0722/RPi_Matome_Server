const params=new URLSearchParams(location.search);
const requested=params.get('url')||'';
const loading=document.getElementById('loading'),errorEl=document.getElementById('error'),article=document.getElementById('article');
const titleEl=document.getElementById('title'),metaEl=document.getElementById('meta'),hero=document.getElementById('hero'),bodyEl=document.getElementById('body'),originalLink=document.getElementById('originalLink');
const photoSection=document.getElementById('photoSection'),photoTitle=document.getElementById('photoTitle'),photosEl=document.getElementById('photos');
const commentSection=document.getElementById('commentSection'),commentStatus=document.getElementById('commentStatus'),commentList=document.getElementById('commentList');
const lightbox=document.getElementById('lightbox'),lightboxImage=document.getElementById('lightboxImage'),lightboxCounter=document.getElementById('lightboxCounter');
let lightboxItems=[],lightboxIndex=0;
function fmtDate(ms){if(!Number(ms))return '';try{return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Number(ms)));}catch{return '';}}
function openLightbox(index){if(!lightboxItems.length)return;lightboxIndex=(index+lightboxItems.length)%lightboxItems.length;lightboxImage.src=lightboxItems[lightboxIndex].url;lightboxImage.alt=lightboxItems[lightboxIndex].caption||'';lightboxCounter.textContent=(lightboxIndex+1)+' / '+lightboxItems.length;lightbox.hidden=false;}
document.getElementById('lightboxClose').onclick=()=>lightbox.hidden=true;
document.getElementById('lightboxPrev').onclick=()=>openLightbox(lightboxIndex-1);
document.getElementById('lightboxNext').onclick=()=>openLightbox(lightboxIndex+1);
lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.hidden=true;});
document.addEventListener('keydown',e=>{if(lightbox.hidden)return;if(e.key==='Escape')lightbox.hidden=true;if(e.key==='ArrowLeft')openLightbox(lightboxIndex-1);if(e.key==='ArrowRight')openLightbox(lightboxIndex+1);});
async function load(){
 if(!/^https:\/\/news\.yahoo\.co\.jp\//i.test(requested))throw new Error('Yahoo!ニュースの記事URLではありません。');
 originalLink.href=requested;
 const res=await fetch('/api/yahoo/article?comments=1&url='+encodeURIComponent(requested),{cache:'no-store'});
 const data=await res.json().catch(()=>null);
 if(!res.ok||!data?.ok)throw new Error(data?.error||'記事を取得できませんでした。');
 originalLink.href=data.url||requested;titleEl.textContent=data.title||'記事';document.title=data.title||'Yahoo!ニュース';
 metaEl.textContent=[data.provider,fmtDate(data.date)].filter(Boolean).join('　');
 if(data.hero_image){hero.src=data.hero_image;hero.hidden=false;}
 for(const text of data.body||[]){const p=document.createElement('p');p.textContent=text;bodyEl.appendChild(p);}
 lightboxItems=[];if(data.hero_image)lightboxItems.push({url:data.hero_image,caption:'メイン画像'});
 const photos=Array.isArray(data.photos)?data.photos:[];
 if(photos.length){photoSection.hidden=false;photoTitle.textContent='記事の写真（'+(photos.length+(data.hero_image?1:0))+'枚）';photos.forEach((x,i)=>{const img=document.createElement('img');img.src=x.url;img.alt=x.caption||'記事の写真';img.loading=i<4?'eager':'lazy';const index=lightboxItems.length;lightboxItems.push({url:x.url,caption:x.caption||''});img.onclick=()=>openLightbox(index);photosEl.appendChild(img);});}
 if(data.hero_image)hero.onclick=()=>openLightbox(0);
 const comments=Array.isArray(data.comments)?data.comments:[];commentSection.hidden=false;commentStatus.textContent=comments.length?(comments.length+'件表示（最大30件）'):'コメント0件、または取得できませんでした。';
 comments.forEach(c=>{const card=document.createElement('div');card.className='comment-card';const user=document.createElement('div');user.className='comment-user';user.textContent=[c.user,c.time].filter(Boolean).join('　');const text=document.createElement('div');text.className='comment-text';text.textContent=c.text||'';const reactions=document.createElement('div');reactions.className='comment-reactions';reactions.textContent='共感 '+(c.empathy||0)+'　なるほど '+(c.insight||0)+'　うーん '+(c.negative||0);card.append(user,text,reactions);commentList.appendChild(card);});
 loading.hidden=true;article.hidden=false;
}
load().catch(e=>{loading.hidden=true;errorEl.hidden=false;errorEl.textContent=String(e?.message||e);});
