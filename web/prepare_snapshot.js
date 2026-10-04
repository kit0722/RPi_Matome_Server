/* Runs only in the low-priority preparation browser. No partial snapshot is published. */
const preparedAssets = new Set();
const preparedRequests = new Map();
const preparedVideos = [];
async function prepareAsset(raw, kind='image') {
  const value = String(raw || '');
  if (!value) throw new Error('必要メディアのURLがありません');
  if (value.startsWith('/prepared/assets/')) { preparedAssets.add(value); return value; }
  let url = value;
  if (!url.startsWith('data:')) {
    const u = new URL(url, location.href);
    if (u.pathname === '/api/proxy') url = u.searchParams.get('url') || url;
    else if (u.pathname.startsWith('/prepared/assets/')) { preparedAssets.add(u.pathname); return u.pathname; }
  }
  if (!preparedRequests.has(url)) {
    const request=(async () => {
      const res = await fetch('/api/prepare-asset', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,kind,article:requestedUrl})
      });
      const data = await res.json();
      if (!res.ok || !data.path) throw new Error(data.error || 'メディア取得失敗');
      preparedAssets.add(data.path);
      return data.path;
    })();
    // Rejected promises must not permanently poison the same candidate URL.
    request.catch(()=>{ if (preparedRequests.get(url)===request) preparedRequests.delete(url); });
    preparedRequests.set(url,request);
  }
  return preparedRequests.get(url);
}
async function prepareBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i=0;i<bytes.length;i+=16384) bin += String.fromCharCode(...bytes.subarray(i,i+16384));
  return prepareAsset(`data:${blob.type};base64,${btoa(bin)}`, blob.type.startsWith('video/')?'video':'image');
}
function preparedYouTubeCard(id) {
  const card=document.createElement('div');card.className='youtube-inline-card';card.dataset.youtubeId=id;
  const button=document.createElement('button');button.type='button';button.className='youtube-inline-thumb';
  const img=document.createElement('img');img.src=displayImageUrl(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);img.alt='YouTube動画';
  const play=document.createElement('span');play.className='youtube-inline-play';play.textContent='▶';
  button.append(img,play);card.append(button);return card;
}

async function prepareInstagramPosts(root) {
  const articleHasText=cleanText(root?.textContent||'').length >= 160;
  const blocks=[...root.querySelectorAll('[data-instagram-post-url]')];
  const seen=new Set();
  for(const block of blocks){
    const required=block.dataset?.requiredMedia==='1' || block.dataset?.requiredReply==='1' || !!block.closest('[data-required-reply="1"]');
    const kind=String(block.dataset.instagramKind||'').toLowerCase();
    const postUrl=String(block.dataset.instagramPostUrl||'').trim();
    const postId=String(block.dataset.instagramPostId||'').trim();
    if(!postUrl||!postId){block.remove();continue;}
    if(seen.has(postId)){block.remove();continue;}seen.add(postId);
    const card=document.createElement('div');card.className='instagram-static-card';card.dataset.instagramPostId=postId;card.dataset.instagramPostUrl=postUrl;
    let resolved=null;
    try{
      const r=await fetch(`/api/instagram-resolve?url=${encodeURIComponent(postUrl)}`,{cache:'no-store'});
      if(r.ok)resolved=await r.json();
    }catch{}
    if(resolved?.ok && resolved.image_url){
      try{
        const img=document.createElement('img');img.src=await prepareAsset(resolved.image_url);img.alt='Instagram投稿画像';img.loading='lazy';img.decoding='async';
        if(required)img.dataset.requiredMedia='1';card.append(img);
      }catch(e){}
    }
    if(!card.querySelector('img')){
      if(required && !articleHasText) throw new Error('レス1のInstagram投稿画像を取得できません');
      const msg=document.createElement('p');msg.className='instagram-static-fallback';msg.textContent='Instagram投稿画像を取得できませんでした';card.append(msg);
    }
    const link=document.createElement('a');link.href=postUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Instagramで見る';card.append(link);
    block.replaceWith(card);
  }
}

async function prepareXPosts(root, warnings=[]) {
  const targets=new Map();
  for (const el of root.querySelectorAll('iframe[src],a[href],.x-static-card[data-x-static-url],[data-x-embed-preserve="1"]')) {
    let raw=el.dataset.xStaticUrl || el.getAttribute('href') || el.getAttribute('src') || '';
    if (!raw && el.matches?.('[data-x-embed-preserve="1"]')) raw=el.querySelector?.('a[href*="/status/"]')?.getAttribute('href') || '';
    let id=xStatusId(raw);
    if (!id && /(?:platform\.twitter\.com|platform\.x\.com)/i.test(raw)) id=new URL(raw,location.href).searchParams.get('id') || '';
    if (!/^\d+$/.test(id)) continue;
    const block=el.closest('.x-static-card,[data-x-embed-preserve="1"],.x-official-embed-wrap') || el;
    const required=block.dataset?.requiredMedia==='1' || !!block.closest?.('[data-required-reply="1"]') || el.dataset?.requiredMedia==='1';
    if (!targets.has(id)) targets.set(id, {blocks:new Set(),required:false});
    targets.get(id).blocks.add(block);
    if(required)targets.get(id).required=true;
  }
  async function makeCard(tweet, depth=0, required=false) {
    if (!tweet?.id_str || typeof tweet.text!=='string') throw new Error('X投稿を完全に取得できません');
    const card=document.createElement('div');card.className='x-static-card';card.dataset.xStaticUrl=`https://x.com/i/status/${tweet.id_str}`; if(required)card.dataset.requiredMedia='1';
    const author=document.createElement('strong');author.className='x-static-author';author.textContent=tweet.user?.name || '';
    const meta=document.createElement('div');meta.className='x-static-meta';
    const handle=tweet.user?.screen_name ? '@'+tweet.user.screen_name : '';
    let date=''; try { if(tweet.created_at) date=new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(tweet.created_at)); } catch {}
    meta.textContent=[handle,date].filter(Boolean).join(' · ');
    const body=document.createElement('p');body.className='x-static-text';body.textContent=tweet.text;
    card.append(author);if(meta.textContent)card.append(meta);card.append(body);
    const details=tweet.mediaDetails || [];
    for (const media of details) {
      if (media.type==='photo') {
        try { const img=document.createElement('img');img.src=await prepareAsset(media.media_url_https);if(required)img.dataset.requiredMedia='1';card.append(img); }
        catch { const miss=document.createElement('a');miss.className='prepared-image-fallback';miss.href=media.media_url_https||card.dataset.xStaticUrl;miss.target='_blank';miss.rel='noopener noreferrer';miss.textContent='X画像を取得できません（元投稿を開く）';card.append(miss); }
      } else if (media.type==='video' || media.type==='animated_gif') {
        const variants=media.video_info?.variants || tweet.video?.variants || [];
        const variant=variants.filter(v=> /mp4/i.test(v.content_type || v.type || v.src || v.url || '')).sort((a,b)=>(b.bitrate||0)-(a.bitrate||0))[0];
        const video=document.createElement('video');video.controls=true;video.setAttribute('playsinline','');if(required)video.dataset.requiredMedia='1';
        video.dataset.videoSource=variant?.url || variant?.src || '';
        video.dataset.tweetId=tweet.id_str;
        video.dataset.mediaId=String(media.id_str || media.id || '');
        if (media.media_url_https) video.dataset.videoPoster=media.media_url_https;
        card.append(video);
      } else throw new Error('未対応のXメディアが含まれています');
    }
    if (!details.length) {
      for (const photo of tweet.photos || []) {try{const img=document.createElement('img');img.src=await prepareAsset(photo.url);if(required)img.dataset.requiredMedia='1';card.append(img);}catch{const miss=document.createElement('a');miss.className='prepared-image-fallback';miss.href=photo.url||card.dataset.xStaticUrl;miss.target='_blank';miss.rel='noopener noreferrer';miss.textContent='X画像を取得できません（元投稿を開く）';card.append(miss);}}
      if (tweet.video) {
        const video=document.createElement('video');video.dataset.tweetId=tweet.id_str;
        const fallbackVariant=(tweet.video.variants||[]).find(v=>/mp4/i.test(v.type||v.content_type||v.src||v.url||''));
        video.dataset.videoSource=fallbackVariant?.url || fallbackVariant?.src || '';
        video.dataset.videoPoster=tweet.video.poster || '';card.append(video);
      }
    }
    if (tweet.quoted_tweet) {
      if (depth>=3) throw new Error('X引用の深さを超えました');
      try { card.append(await makeCard(tweet.quoted_tweet,depth+1,false)); } catch { const q=document.createElement('p');q.className='x-static-fallback';q.textContent='引用X投稿の追加情報を取得できませんでした';card.append(q); }
    }
    const link=document.createElement('a');link.className='x-static-link';link.href=card.dataset.xStaticUrl;link.textContent='Xで見る';card.append(link);
    return card;
  }
  for (const [id,target] of targets) {
    const blocks=target.blocks;
    const required=!!target.required;
    let card=null;
    try {
      const token=((Number(id)/1e15)*Math.PI).toString(36).replace(/(0+|\.)/g,'');
      const res=await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=ja&token=${token}`);
      if (!res.ok) throw new Error('X投稿の取得失敗: '+id);
      card=await makeCard(await res.json(),0,required);
    } catch (e) {
      const articleText=cleanText(root.textContent||'').length;
      const otherMedia=root.querySelectorAll('img,video,iframe,blockquote,.x-static-card,.instagram-static-card').length;
      if(required && articleText<60 && otherMedia<=1) throw new Error('レス1のX投稿を取得できません: '+id);
      warnings.push({media_type:'x',failed_url:`https://x.com/i/status/${id}`,reason:String(e?.message||e),completed:true});
      // A temporarily unavailable X post must not block publication when useful body/other media remains.
      card=document.createElement('div');card.className='x-static-card x-static-fallback';card.dataset.xStaticUrl=`https://x.com/i/status/${id}`;
      const original=[...blocks].find(el=>el?.isConnected) || [...blocks][0] || null;
      const preserved=cleanText(original?.textContent || '');
      const msg=document.createElement('p');msg.textContent=preserved || 'X投稿を取得できませんでした';
      const note=document.createElement('small');note.textContent=preserved ? 'Xの追加情報を取得できませんでした' : '';
      const link=document.createElement('a');link.href=card.dataset.xStaticUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Xで見る';
      card.append(msg);if(note.textContent)card.append(note);card.append(link);
    }
    const existing=[...blocks].filter(el=>el.isConnected);
    if (existing.length) { existing[0].replaceWith(card); for (const extra of existing.slice(1)) extra.remove(); }
  }
}
function cleanupXEmbedDuplicates(root) {
  const idOf=el=>{
    const raw=el?.dataset?.xStaticUrl || el?.querySelector?.('a[href*="/status/"]')?.href || el?.getAttribute?.('src') || '';
    return typeof xStatusId==='function' ? xStatusId(raw) : (String(raw).match(/status\/(\d+)/)?.[1]||'');
  };
  const keepById=new Map();
  for (const card of [...root.querySelectorAll('.x-static-card[data-x-static-url]')]) {
    const id=idOf(card); if(!id)continue;
    if(!keepById.has(id)) keepById.set(id,card); else card.remove();
  }
  for (const el of [...root.querySelectorAll('blockquote[data-x-embed-preserve="1"],[data-x-embed-preserve="1"]')]) {
    if(!el.isConnected || el.classList?.contains('x-static-card'))continue;
    const id=idOf(el); if(!id)continue;
    const keep=keepById.get(id);
    if(keep){
      if(el.contains(keep)) el.replaceWith(keep); else el.remove();
    }
  }
  for (const f of [...root.querySelectorAll('iframe[src]')]) {
    const src=f.getAttribute('src')||'';
    if (/(?:x\.com|twitter\.com|platform\.(?:x|twitter)\.com)/i.test(src)) {
      const wrap=f.closest('.x-official-embed-wrap,blockquote,[data-x-embed-preserve="1"]')||f;
      const id=idOf(f); const keep=id?keepById.get(id):null;
      if(keep && wrap.contains?.(keep)) wrap.replaceWith(keep); else wrap.remove();
    }
  }
}
function removeFloatingDuplicates(root) {
  const mediaKey = el => {
    const img=el.matches?.('img') ? el : el.querySelector?.('img');
    if (!img) return '';
    return String(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '').trim();
  };
  for (const el of [...root.querySelectorAll('*')]) {
    if(el.closest?.('[data-required-reply="1"]')) continue;
    const inlinePos=String(el.style?.position || '').toLowerCase();
    let pos=inlinePos;
    try { if (!pos) pos=String(getComputedStyle(el).position || '').toLowerCase(); } catch {}
    if (pos!=='fixed' && pos!=='sticky') continue;
    const key=mediaKey(el);
    if (key) {
      const dup=[...root.querySelectorAll('img')].some(img=>!el.contains(img) && String(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '').trim()===key);
      if (dup) { el.remove(); continue; }
    }
    el.style.position='static';
    for (const k of ['top','right','bottom','left','zIndex','transform']) el.style[k]='';
  }
}


function stripArticleFooterJunk(root){
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const mediaSel='img,video,audio,iframe,.youtube-inline-card,.prepared-video,.x-static-card,.instagram-static-card,[data-instagram-post-url]';
  const exact=/^(?:人気記事画像RSS|最新記事[（(]外部[）)]|お勧め記事[（(]外部[）)]|おすすめ記事[（(]外部[）)]|人気記事リストRSS|人気サイトヘッドライン|楽天市場|逆アクセスランキング|Amazon人気アイテム|最新コメント|カテゴリー|アーカイブ|リンク|About|Comment\s*[（(]\s*\d+\s*[）)]|コメント\s*[（(]\s*\d+\s*[）)])$/i;
  const disclosure=/(?:Amazonアソシエイト|楽天アフィリエイト|その他ASP|プロモーションを含みます|当ブログについて|広告を掲載|アフィリエイト・プログラム)/i;
  for(const el of [...root.querySelectorAll('footer,aside,nav,div,p,li,span,a')]){
    if(!el.isConnected)continue; if(el.closest?.('.site-feedback-section')||el.matches?.('.site-feedback-section')||el.querySelector?.('.site-feedback-section'))continue; if(el.closest?.('[data-required-reply="1"],[data-gossip-reply-unit="1"]')||el.matches?.('[data-required-reply="1"],[data-gossip-reply-unit="1"]')||el.querySelector?.('[data-required-reply="1"],[data-gossip-reply-unit="1"]'))continue; const t=clean(el.textContent); if(!t||t.length>1200)continue;
    const media=el.querySelectorAll(mediaSel).length;
    if((exact.test(t)||disclosure.test(t))&&media===0){
      const wrap=el.closest('footer,aside,section,ul,ol')||el;
      if(clean(wrap.textContent).length<1800 && !wrap.querySelector(mediaSel)) wrap.remove(); else el.remove();
    }
  }
  // Date/category/comment metadata-only lists near the tail.
  for(const list of [...root.querySelectorAll('ul,ol')]){
    if(!list.isConnected || list.closest?.('[data-required-reply="1"]') || list.querySelector?.('[data-required-reply="1"]') || list.querySelector(mediaSel))continue;
    const vals=[...list.querySelectorAll(':scope > li')].map(li=>clean(li.textContent)).filter(Boolean);
    if(!vals.length||vals.length>5)continue;
    const hasDate=vals.some(t=>/(?:20\d{2}年\d{1,2}月\d{1,2}日|20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2})/.test(t));
    const hasCount=vals.some(t=>/^(?:0|\d+\s*(?:コメ|コメント)|Comment\s*[（(]?\d+[）)]?)$/i.test(t));
    if(hasDate&&hasCount)list.remove();
  }
  // Compact blocks made almost entirely of site navigation/RSS links.
  for(const box of [...root.querySelectorAll('div,section,p')].reverse()){
    if(!box.isConnected||box.closest?.('[data-required-reply="1"]')||box.querySelector?.('[data-required-reply="1"]')||box.querySelector(mediaSel))continue;
    const t=clean(box.textContent); if(!t||t.length>700)continue;
    const links=[...box.querySelectorAll('a[href]')]; if(links.length<2)continue;
    const noise=links.filter(a=>/(?:RSS|人気記事|最新記事|おすすめ|お勧め|ランキング|楽天市場|Amazon|アーカイブ|カテゴリー|About|Comment)/i.test(clean(a.textContent))).length;
    if(noise>=2 && noise>=Math.ceil(links.length*0.6)) box.remove();
  }
}

function stripNonArticleChromeBeforePrepare(root){
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const mediaSel='img,video,audio,iframe,.x-static-card,.instagram-static-card,[data-instagram-post-url]';
  const affiliate=/(?:amazon\.|amzn\.|rakuten\.|dmm\.|a8\.net|valuecommerce|moshimo|linksynergy|accesstrade|rentracks|doubleclick|googlesyndication|adservice|microad|i-mobile|admatrix|adtdp|nend\.|criteo|trafficgate|affiliate)/i;
  const early=[...root.querySelectorAll('nav,div,p,ul,ol,li,span')].slice(0,120);
  for(const el of early){
    if(!el.isConnected)continue; if(el.matches?.('[data-required-reply="1"],[data-gossip-reply-unit="1"],[data-instagram-preserve="1"],[data-instagram-post-url],.instagram-static-card,.site-feedback-section,.site-feedback-card')||el.closest?.('[data-required-reply="1"],[data-gossip-reply-unit="1"],.site-feedback-section')||el.querySelector?.('[data-required-reply="1"],[data-gossip-reply-unit="1"],[data-required-media="1"],[data-instagram-preserve="1"],[data-instagram-post-url],.instagram-static-card,.site-feedback-section,.site-feedback-card'))continue; const t=clean(el.textContent); if(!t||t.length>420)continue;
    if(/^\d+\s*(?:コメ|コメント)$/.test(t)&&!el.querySelector(mediaSel)){el.remove();continue;}
    if(/^(?:Date|Category)\s*[:：]?/i.test(t)&&t.length<100&&!el.querySelector(mediaSel)){el.remove();continue;}
    const as=el.querySelectorAll(':scope > a[href],:scope > span > a[href]');
    if(as.length>=2&&/(?:>|›|»|＞)/.test(t)&&!el.querySelector(mediaSel)){el.remove();continue;}
    if(/^(?:スポンサーリンク|スポンサードリンク|広告|PR)$/i.test(t)){
      let n=el.nextElementSibling,steps=0;el.remove();
      while(n&&steps++<6){const next=n.nextElementSibling,nt=clean(n.textContent);if(/^\d+\s*[:：]|名無し|ID[:：]/.test(nt)||nt.length>140)break;if(n.querySelector('img,a[href],iframe')||!nt)n.remove();n=next;}
    }
  }
  for(const a of [...root.querySelectorAll('a[href]')]){if(a.closest('[data-required-reply="1"],[data-gossip-reply-unit="1"],.site-feedback-section')||a.querySelector?.('[data-required-media="1"],.site-feedback-section,.site-feedback-card'))continue;if(!affiliate.test(a.href||''))continue;const wrap=a.closest('p,div,li')||a;const t=clean(wrap.textContent);if(wrap.querySelectorAll('a[href]').length<=2&&t.length<140)wrap.remove();else a.remove();}
  for(const img of [...root.querySelectorAll('img')]){
    if(img.dataset.requiredMedia==='1'||img.closest?.('[data-gossip-reply-unit="1"],.site-feedback-section'))continue;
    const a=img.closest('a[href]'),wrap=img.closest('figure,p,li,td,div')||img;
    const key=`${img.getAttribute('src')||''} ${img.getAttribute('data-src')||''} ${img.getAttribute('data-original')||''} ${img.alt||''} ${img.title||''} ${a?.getAttribute('href')||''} ${wrap.id||''} ${wrap.className||''}`;
    const adKeyword=/(?:スポンサー|広告|Amazon|楽天|banner|promo|sponsor)/i.test(key);
    // PR must be a token, not the letters inside an ordinary word such as April/april.jpg.
    const prToken=/(?:^|[^A-Za-z0-9])PR(?:[^A-Za-z0-9]|$)/i.test(key);
    if(!affiliate.test(key)&&!adKeyword&&!prToken)continue;
    if(threadHeaderCount(wrap)>0)continue;
    if(wrap.querySelectorAll('img').length<=2&&clean(wrap.textContent).length<220)wrap.remove();else img.remove();
  }
}

async function prepareSnapshot(info) {
  const root=contentEl;
  const requiredExpected=root.querySelectorAll('img[data-required-media="1"]').length;
  let requiredResolved=0;
  const warnings=[];
  for(const el of root.querySelectorAll('[data-media-warning]')){
    warnings.push({media_type:el.dataset.mediaWarning||'media',failed_url:el.dataset.failedUrl||'',reason:'本文整形前のメディア解決失敗',completed:true});
    el.removeAttribute('data-media-warning');el.removeAttribute('data-failed-url');
  }
  stripNonArticleChromeBeforePrepare(root);
  stripArticleFooterJunk(root);
  removeFloatingDuplicates(root);
  await prepareInstagramPosts(root);
  await prepareXPosts(root,warnings);
  cleanupXEmbedDuplicates(root);
  deduplicateYouTubeEmbeds(root);
  // Some summary sites embed a direct Imgur/image URL in an iframe. It is an image, not an active frame.
  for (const frame of [...root.querySelectorAll('iframe[src]')]) {
    const raw=frame.getAttribute('src')||'';
    let abs=''; try { abs=new URL(raw,location.href).href; } catch {}
    if (/\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test(abs)) {
      const img=document.createElement('img');img.src=abs;img.alt=frame.getAttribute('title')||'埋め込み画像';
      img.loading='lazy';img.decoding='async';frame.replaceWith(img);
    }
  }
  // No X/Twitter iframe is allowed in a completed snapshot. Official embeds are already converted
  // to static cards above; any leftover X frame is a broken/blocked duplicate.
  for (const frame of [...root.querySelectorAll('iframe[src]')]) {
    const raw=frame.getAttribute('src')||'';
    if (/(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/|platform\.(?:x|twitter)\.com/i.test(raw)) frame.remove();
  }
  for (const frame of [...root.querySelectorAll('iframe')]) {
    const id=youtubeVideoId(frame.getAttribute('src'));
    if (!id) throw new Error('未整理の埋め込みが残っています');
    frame.replaceWith(preparedYouTubeCard(id));
  }
  expandYouTubeLinks(root);
  removeDuplicateVideoMedia(root);
  deduplicatePreparedVideos(root);
  // Resolve actual media once, before publication, keeping every nonduplicate image.
  // Old Livedoor/2ch themes often put the real GIF in href/data-original/srcset while src is only
  // a placeholder. Try all known media candidates and keep the first decodable one.
  for (const img of root.querySelectorAll('img')) {
    const candidates = typeof animationCandidates === 'function' ? animationCandidates(img) : [
      img.dataset.hoverGifSrc, linkedGifUrl(img), img.getAttribute('data-src'),
      img.getAttribute('data-original'), img.getAttribute('data-lazy-src'), img.getAttribute('src')
    ].filter(Boolean);
    let chosen = null;
    let lastError = null;

    // v0.1.181: HeartLog uses a static JPG thumbnail inside <a href="...gif">.
    // Do not depend on generic animation probing here. The wrapping .gif URL is the
    // actual media by site design, and the current <img src> is the intended poster.
    // Persist both explicitly so completed snapshots always carry data-prepared-gif.
    try {
      const host = new URL(info.finalUrl || requestedUrl || location.href).hostname.toLowerCase().replace(/^www\./,'');
      const linked = (host === 'blog.livedoor.jp' && /\/love120331\//.test(new URL(info.finalUrl || requestedUrl || location.href).pathname))
        ? (typeof linkedGifUrl === 'function' ? linkedGifUrl(img) : '') : '';
      if (linked) {
        const animated = await prepareAsset(linked);
        const rawPoster = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
        let poster = '';
        if (rawPoster && rawPoster !== linked) {
          try { poster = await prepareAsset(rawPoster); } catch {}
        }
        if (!poster) {
          const response = await fetch(animated);
          if (!response.ok) throw new Error('保存GIFが見つかりません');
          const blob = await response.blob();
          poster = await prepareBlob(await firstFrameBlob(blob));
        }
        chosen = {local:animated, poster, animated, animatedImage:true};
      }
    } catch (e) {
      lastError = e;
      chosen = null;
    }
    for (const raw of (chosen ? [] : candidates.slice(0, 10))) {
      try {
        const local=await prepareAsset(raw);
        const response=await fetch(local);
        if (!response.ok) throw new Error('保存画像が見つかりません');
        const blob=await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('画像ではない応答です');
        if (await isAnimatedImageBlob(blob)) {
          const poster=await prepareBlob(await firstFrameBlob(blob));
          const animated=await prepareBlob(await forceGifInfiniteLoop(blob));
          chosen={local,poster,animated,animatedImage:true};
        } else {
          const probe=new Image();probe.src=local;await probe.decode();
          if (!probe.naturalWidth) throw new Error('画像デコード失敗');
          chosen={local,animatedImage:false};
        }
        break;
      } catch (e) { lastError=e; }
    }
    if (!chosen) {
      const required=img.dataset.requiredMedia==='1';
      const raw=String(candidates[0]||img.getAttribute('src')||'').trim();
      const textLen=cleanText(root.textContent||'').length;
      const otherMedia=[...root.querySelectorAll('img,video,iframe,blockquote,.x-static-card,.instagram-static-card')].filter(x=>x!==img).length;
      if(required && textLen<60 && otherMedia===0){
        throw new Error('重要画像を取得できません'+(raw?': '+raw:''));
      }
      if(required) warnings.push({media_type:'image',failed_url:raw,reason:String(lastError?.message||lastError||'取得失敗'),completed:true});
      // Keep the article publishable when one image fails and useful body/other media remains.
      // Semantic images in reply #1 / image-only replies are handled above and stay retryable.
      const fallback=document.createElement(raw?'a':'span');
      fallback.className='prepared-image-fallback';
      if(raw){try{fallback.href=new URL(raw,info.finalUrl||requestedUrl).href;}catch{fallback.href=raw;}fallback.target='_blank';fallback.rel='noopener noreferrer';}
      const alt=String(img.getAttribute('alt')||'').trim();
      fallback.textContent=alt ? `画像を取得できません: ${alt}` : '画像を取得できません（元画像を開く）';
      img.replaceWith(fallback);
      continue;
    }
    if (img.dataset.requiredMedia==='1') requiredResolved++;
    if (chosen.animatedImage) {
      img.dataset.preparedGif=chosen.animated;img.dataset.preparedPoster=chosen.poster;
      img.src=chosen.poster;img.dataset.gifClickMode='1';
    } else {
      img.src=chosen.local;
    }
    for (const name of [...img.attributes].map(a=>a.name)) {
      if (name.startsWith('data-') && !['data-prepared-gif','data-prepared-poster','data-gif-click-mode'].includes(name)) img.removeAttribute(name);
    }
    img.removeAttribute('srcset');img.loading='lazy';img.decoding='async';
  }
  if(requiredResolved < requiredExpected){
    const textLen=cleanText(root.textContent||'').length;
    const otherMedia=root.querySelectorAll('img,video,iframe,blockquote,.x-static-card,.instagram-static-card').length;
    if(textLen<60 && otherMedia===0) throw new Error('重要画像が本文整形中に失われました');
    warnings.push({media_type:'image',failed_url:'',reason:`重要画像 ${requiredExpected-requiredResolved}件が本文整形中に失われました`,completed:true});
  }
  for (const media of [...root.querySelectorAll('video,audio')]) {
    const sources=videoSourceUrls(media);
    const url=sources[0] || '';
    const requiredVideo=media.dataset.requiredMedia==='1' || !!media.closest('[data-required-reply="1"]');
    if(requiredVideo && !url) throw new Error('レス1の動画URLを取得できません');
    const key=preparedVideoKey(url) || (media.dataset.tweetId?('tweet:'+media.dataset.tweetId+':'+(media.dataset.mediaId||'video')):'unknown:'+preparedVideos.length);
    let poster='';
    const originalPoster=media.dataset.videoPoster || media.getAttribute('poster') || '';
    if(originalPoster) { try {poster=await prepareAsset(new URL(originalPoster,info.finalUrl).href);} catch {} }
    const nearby=media.closest('.x-static-card')?.dataset.xStaticUrl || '';
    const ids=[...new Set([...root.querySelectorAll('a[href]')].map(a=>xStatusId(a.href)).filter(Boolean))];
    const tweetId=media.dataset.tweetId || xStatusId(nearby) || (ids.length===1?ids[0]:'');
    const record={key,url,urls:sources,poster,source_page:info.finalUrl,
      tweet_id:tweetId,tweet_token:tweetId?((Number(tweetId)/1e15)*Math.PI).toString(36).replace(/(0+|\.)/g,''):'',
      media_id:media.dataset.mediaId || '',kind:media.tagName.toLowerCase()};
    preparedVideos.push(record);
    const card=document.createElement('div');card.className='prepared-video';card.dataset.videoKey=key;if(requiredVideo)card.dataset.requiredMedia='1';
    const button=document.createElement('button');button.type='button';button.className='prepared-video-play';
    if(poster){const img=document.createElement('img');img.src=poster;img.alt='動画サムネ';button.append(img);}
    const label=document.createElement('span');label.textContent='▶ 動画を再生';button.append(label);card.append(button);
    media.replaceWith(card);
  }
  for (const source of root.querySelectorAll('picture source')) source.remove();
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || attr.name==='srcset' || /url\s*\(/i.test(attr.value) && attr.name==='style') el.removeAttribute(attr.name);
    }
    if (el.getAttribute('src')?.startsWith(location.origin+'/prepared/')) el.setAttribute('src',new URL(el.src).pathname);
    if (el.getAttribute('poster')?.startsWith(location.origin+'/prepared/')) el.setAttribute('poster',new URL(el.poster).pathname);
  }
  stripArticleFooterJunk(root);
  cleanupXEmbedDuplicates(root);
  const makeNoImageThumb=()=>prepareBlob(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#eee"/><text x="160" y="96" text-anchor="middle" fill="#777" font-size="24">画像なし</text></svg>'],{type:'image/svg+xml'}));
  let thumb='';
  if (info.thumb) { try { thumb=await prepareAsset(new URL(info.thumb,info.finalUrl).href); } catch {} }
  if (!thumb) thumb=root.querySelector('img')?.getAttribute('src') || '';
  if (!thumb) thumb=await makeNoImageThumb();
  try { const thumbProbe=new Image();thumbProbe.src=thumb;await thumbProbe.decode();if(!thumbProbe.naturalWidth)throw new Error('thumbnail decode failed'); }
  catch { thumb=await makeNoImageThumb();const thumbProbe=new Image();thumbProbe.src=thumb;await thumbProbe.decode(); }
  const commentStats=root.dataset?.esuteruCommentAppended!=null?{kind:'esuteru',expected:Number(root.dataset.esuteruCommentExpected||0),primary:Number(root.dataset.esuteruCommentPrimary||0),fallback:Number(root.dataset.esuteruCommentFallback||0),appended:Number(root.dataset.esuteruCommentAppended||0),final:Number(root.querySelectorAll?.('.site-feedback-card')?.length||0),fetch_pages:Number(root.dataset.esuteruCommentFetchPages||0),fetch_errors:Number(root.dataset.esuteruCommentFetchErrors||0),bytes:Number(root.dataset.esuteruCommentFetchBytes||0),loose:Number(root.dataset.esuteruCommentLoose||0),errors:String(root.dataset.esuteruCommentFetchErrorDetails||'')}:(root.dataset?.gossipCommentAppended!=null?{kind:'gossip1',marker:String(root.dataset.gossipCommentMarker||''),roots:Number(root.dataset.gossipCommentRoots||0),primary:Number(root.dataset.gossipCommentPrimary||0),marker_items:Number(root.dataset.gossipCommentMarkerItems||0),expected:Number(root.dataset.gossipCommentExpected||0),appended:Number(root.dataset.gossipCommentAppended||0),final:Number(root.querySelectorAll?.('.site-feedback-card')?.length||0)}:null);
  // v0.1.138: persist Esuteru comments separately from article HTML as plain structured records.
  const siteFeedback=(root.dataset?.esuteruCommentAppended!=null)?[...root.querySelectorAll('.site-feedback-card')].map(card=>({
    number:String(card.dataset.commentNumber||''),
    meta:cleanText(card.querySelector('.site-feedback-meta')?.textContent||''),
    body:String(card.querySelector('.site-feedback-body')?.textContent||'').trim()
  })).filter(x=>x.body):[];
  const gossipBodyStats=root.dataset?.gossipBodySource!=null?{kind:'gossip1',source:Number(root.dataset.gossipBodySource||0),prepared:Number(root.dataset.gossipBodyPrepared||0),final:Number(root.querySelectorAll?.('[data-gossip-reply-unit="1"]').length||0)}:null;
  let alfalfaFinal=0;
  if(root.dataset?.alfalfaBodySource!=null){
    try{
      const probe=root.cloneNode(true);
      for(const el of probe.querySelectorAll('.site-feedback-section,#ld_blog_article_comment_entries,#comment,#comments,.comment-list,.comments'))el.remove();
      for(const br of [...probe.querySelectorAll('br')])br.replaceWith(document.createTextNode('\n'));
      const t=String(probe.textContent||'').replace(/\r/g,'\n');
      const strict=(t.match(/(?:^|\n)\s*(?:>>\s*)?\d{1,5}(?:\s*[：:](?!\d)|\s+名前\s*[：:])/gm)||[]).length;
      const nums=new Set();
      for(const m of t.matchAll(/(?:^|\n)\s*(\d{1,5})\s*(?=\n|$)/gm)){
        const n=Number(m[1]); if(n>=1&&n<=99999)nums.add(n);
      }
      for(const el of probe.querySelectorAll('p,div,span,li,dd,dt')){
        if(el.querySelector('img,picture,iframe,video,table,blockquote'))continue;
        const v=String(el.textContent||'').replace(/\s+/g,' ').trim();
        if(!/^\d{1,5}$/.test(v))continue;
        if([...el.children].some(ch=>/^\d{1,5}$/.test(String(ch.textContent||'').replace(/\s+/g,' ').trim())))continue;
        const n=Number(v); if(n>=1&&n<=99999)nums.add(n);
      }
      alfalfaFinal=Math.max(strict,nums.size);
    }catch{}
  }
  const alfalfaBodyStats=root.dataset?.alfalfaBodySource!=null?{kind:'alfalfalfa',source:Number(root.dataset.alfalfaBodySource||0),bundle:Number(root.dataset.alfalfaBodyBundle||0),prepared:Number(root.dataset.alfalfaBodyPrepared||0),final:Number(alfalfaFinal||0),mode:String(root.dataset.alfalfaBodyMode||'')}:null;
  return {schema:33,complete:true,title:info.title,original_url:info.finalUrl,
    source_date:info.date,meta:metaEl.textContent,html:root.innerHTML,thumb,assets:[...preparedAssets],videos:preparedVideos,warnings,comment_stats:commentStats,site_feedback:siteFeedback,gossip_body_stats:gossipBodyStats,alfalfa_body_stats:alfalfaBodyStats};
}

// Twitter variants and temporary query strings still refer to the same underlying video.
function preparedVideoKey(raw) {
  if(!String(raw||'').trim())return '';
  try {
    const u=new URL(String(raw||''),location.href);
    if (u.hostname==='video.twimg.com') {
      const m=u.pathname.match(/^\/(ext_tw_video|amplify_video|tweet_video)\/([A-Za-z0-9_-]+)/);
      if(m)return 'twimg:'+m[1]+':'+m[2].replace(/\.mp4$/i,'');
    }
    u.hash='';return u.href;
  } catch { return ''; }
}
function deduplicatePreparedVideos(root) {
  const byKey=new Map();
  const score=v=>{
    const rect=v.getBoundingClientRect();
    return Number(v.dataset.originalArea)||((parseFloat(v.getAttribute('width'))||rect.width||0)*(parseFloat(v.getAttribute('height'))||rect.height||0));
  };
  for(const video of [...root.querySelectorAll('video')]) {
    const keys=videoSourceUrls(video).map(preparedVideoKey).filter(Boolean);
    if(!keys.length)continue;
    const previous=keys.map(k=>byKey.get(k)).find(v=>v?.isConnected);
    let keep=video;
    if(previous){
      keep=score(video)>score(previous)?video:previous;
      const drop=keep===video?previous:video;
      for(const key of ['tweetId','mediaId','videoPoster'])if(!keep.dataset[key] && drop.dataset[key])keep.dataset[key]=drop.dataset[key];
      drop.remove();
    }
    for(const key of keys)byKey.set(key,keep);
    for(const [key,value]of byKey)if(!value.isConnected)byKey.set(key,keep);
  }
  const fallback=/^(?:※|＊|\*|\s)*(?:(?:動画が?)?(?:見れない|見られない|観れない|再生できない)場合(?:は)?(?:こちら)?|こちら(?:から)?(?:再生|視聴))(?:[。．.:：\s]*)$/;
  const directVideoLine=/^(?:\d+\s*[:：.-]\s*)?(?:https?:\/\/\S+\.(?:mp4|webm|m4v)(?:\?\S*)?)$/i;
  for(const a of [...root.querySelectorAll('a[href]')]) {
    const key=preparedVideoKey(a.href);
    if(!byKey.has(key))continue;
    const p=a.parentElement;
    const parentText=cleanText(p?.textContent||'');
    if(p && /^(P|SPAN|DIV|LI)$/.test(p.tagName) && !p.querySelector('video,iframe,img') && (fallback.test(parentText) || directVideoLine.test(parentText))) {
      p.remove();continue;
    }
    // Direct source links are redundant once their complete local player exists.
    if(fallback.test(cleanText(a.textContent)) || /^(?:https?:\/\/\S+|動画|動画はこちら|こちら)$/i.test(cleanText(a.textContent))) {
      const prev=a.previousSibling;
      a.remove();
      if(prev?.nodeType===Node.TEXT_NODE && fallback.test(cleanText(prev.textContent)))prev.remove();
      const wrap=p;
      if(wrap && /^(P|SPAN|DIV|LI)$/.test(wrap.tagName)) {
        const text=cleanText(wrap.textContent||'');
        if(!wrap.querySelector('a[href],video,iframe,img') && (!text || directVideoLine.test(text) || /^\d+$/.test(text))) wrap.remove();
      }
    }
  }
  for (const node of [...root.querySelectorAll('p,div,span,li')]) {
    if (node.querySelector('a[href],video,iframe,img,.prepared-video')) continue;
    const text=cleanText(node.textContent||'');
    const m=text.match(/^(?:\d+\s*[:：.-]\s*)?(https?:\/\/\S+\.(?:mp4|webm|m4v)(?:\?\S*)?)$/i);
    if(!m) continue;
    const key=preparedVideoKey(m[1]);
    if(byKey.has(key)) node.remove();
  }
}
