/* Viewing only attaches light interactions; extraction and media analysis are already finished. */
async function loadPreparedArticle() {
  const res=await fetch('/api/ready-article?url='+encodeURIComponent(requestedUrl),{cache:'force-cache'});
  const data=await res.json();
  if (!res.ok || !data.article) throw new Error('この記事は準備中、または完成キャッシュの再構築中です。一覧を更新してください。');
  const article=data.article;
  titleEl.textContent=article.title;document.title=article.title;
  originalLink.href=article.original_url || requestedUrl;
  metaEl.textContent=[siteName,'公開 '+new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(article.ready_time))].filter(Boolean).join('　');
  contentEl.innerHTML=article.html;
  for (const card of contentEl.querySelectorAll('.youtube-inline-card[data-youtube-id]')) {
    card.querySelector('button')?.addEventListener('click',()=>{
      const frame=document.createElement('iframe');frame.className='youtube-inline-frame';
      frame.src=`https://www.youtube-nocookie.com/embed/${card.dataset.youtubeId}?autoplay=1&rel=0`;
      frame.title='YouTube動画';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
      card.replaceChildren(frame);
    },{once:true});
  }

  const warmVideoCard=(card,record)=>{
    if (card.dataset.videoWarmStarted === '1') return;
    card.dataset.videoWarmStarted = '1';
    if(record?.tweet_id || /^twimg:/.test(record?.key||'')) {
      // X metadata/URL only. The video body itself is never cached on the Raspberry Pi.
      fetch('/api/video-warm?article='+encodeURIComponent(requestedUrl)+'&key='+encodeURIComponent(card.dataset.videoKey),{cache:'no-store'}).catch(()=>{});
    }
  };
  const httpVideoCandidates=(record)=>{
    const out=[];
    for(const raw of [record?.url,...(record?.urls||[])]) {
      const u=String(raw||'').trim();
      if(/^https?:\/\//i.test(u) && !out.includes(u))out.push(u);
    }
    return out;
  };
  const stripPreparedVideoUrlDuplicates=(root,article)=>{
    const known=new Set();
    for(const rec of article?.videos||[])for(const u of [rec?.url,...(rec?.urls||[])])if(/^https?:\/\//i.test(String(u||'')))known.add(String(u));
    for(const a of [...root.querySelectorAll('a[href]')]) {
      const href=a.href||a.getAttribute('href')||'';
      if(!known.has(href) && ![...known].some(u=>u===href))continue;
      if(!/\.(?:mp4|webm|m4v)(?:$|[?#])/i.test(href))continue;
      const wrap=a.closest('p,li,div,span')||a;
      const text=(wrap.textContent||'').trim();
      a.remove();
      if(wrap!==a && !wrap.querySelector('a,img,video,iframe,.prepared-video')) {
        const left=(wrap.textContent||'').trim();
        if(!left || /^\d+\s*[:：.-]?$/.test(left) || text===href)wrap.remove();
      }
    }
  };
  stripPreparedVideoUrlDuplicates(contentEl,article);
  for(const card of contentEl.querySelectorAll('.prepared-video[data-video-key]')) {
    const record=(article.videos||[]).find(v=>v.key===card.dataset.videoKey);
    if(record?.tweet_id || /^twimg:/.test(record?.key||'')) warmVideoCard(card,record);
    const start=(preferProxy=false)=>{
      warmVideoCard(card,record);
      const video=document.createElement(record?.kind==='audio'?'audio':'video');
      video.className='prepared-video-player';
      video.controls=true;video.preload='metadata';video.setAttribute('playsinline','');video.playsInline=true;
      if(record?.poster)video.poster=record.poster;
      const proxy='/api/video-stream?article='+encodeURIComponent(requestedUrl)+'&key='+encodeURIComponent(card.dataset.videoKey)+'&retry='+Date.now();
      const direct=httpVideoCandidates(record);
      let candidateIndex=0;
      let usingProxy=preferProxy || direct.length===0;
      let settled=false;let timer=0;let sourceGeneration=0;
      const retry=document.createElement('button');retry.type='button';retry.className='prepared-video-retry';retry.textContent='再生できませんでした。再試行';retry.hidden=true;
      retry.onclick=()=>start(true);
      const markProgress=()=>{if(video.currentTime>0.04||!video.paused){settled=true;clearTimeout(timer);retry.hidden=true;}};
      const armTimeout=(generation)=>{clearTimeout(timer);timer=setTimeout(()=>{if(generation!==sourceGeneration||settled)return;if(video.currentTime>0.04){markProgress();return;}fallback();},6500);};
      const setSource=(src)=>{settled=false;retry.hidden=true;sourceGeneration++;video.src=src;video.load();armTimeout(sourceGeneration);video.play().catch(()=>{});};
      const fallback=()=>{
        clearTimeout(timer);
        if(!usingProxy && candidateIndex+1<direct.length){candidateIndex++;setSource(direct[candidateIndex]);return;}
        if(!usingProxy){usingProxy=true;setSource(proxy);return;}
        retry.hidden=false;
      };
      video.addEventListener('playing',markProgress);
      video.addEventListener('timeupdate',markProgress);
      video.addEventListener('error',fallback);
      video.addEventListener('stalled',()=>{if(!settled)armTimeout(sourceGeneration);});
      card.replaceChildren(video,retry);
      setSource(usingProxy?proxy:direct[candidateIndex]);
    };
    card.querySelector('button')?.addEventListener('click',()=>start(false),{once:true});
    if ('IntersectionObserver' in window) {
      const io=new IntersectionObserver((entries,observer)=>{
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          warmVideoCard(card,record);observer.disconnect();break;
        }
      },{rootMargin:'240px 0px'});
      io.observe(card);
    }
  }
  let imageIndex=0;
  for (const img of contentEl.querySelectorAll('img')) {
    img.decoding='async';
    img.loading=(imageIndex++ < 2 ? 'eager' : 'lazy');
    if (img.closest('.youtube-inline-card,.prepared-video')) continue;
    if (img.dataset.preparedGif) {
      img.classList.add('hover-gif');img.title='画面内に90%以上表示すると自動再生';
      watchGifFullVisibility(img,on=>{img.src=on?img.dataset.preparedGif:img.dataset.preparedPoster;});
      img.onclick=e=>{e.preventDefault();e.stopPropagation();};
    } else img.onclick=e=>{e.preventDefault();openLightbox(img.src);};
  }
  loadingEl.hidden=true;articleEl.hidden=false;applyReaderFont(localStorage.getItem(readerFontKey())||16,false);restoreReaderScroll();
  // Keep lazy media of the currently open article safe if it moves outside the latest 500.
  setInterval(()=>{if(!document.hidden)fetch('/api/ready-lease?url='+encodeURIComponent(requestedUrl),{cache:'no-store'}).catch(()=>{});},60000);
}
