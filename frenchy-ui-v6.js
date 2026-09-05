(() => {
  const $=id=>document.getElementById(id),num=t=>Number(String(t||'').match(/[\d.]+/)?.[0]||0);
  const setText=(id,value)=>{const el=$(id);if(el&&el.textContent!==String(value))el.textContent=String(value)};
  const isMiddleton=location.pathname.includes('middleton'),spot=isMiddleton?'Middleton':'Seaford',coast=isMiddleton?'South Coast':'Mid Coast';
  const cameraUrl=isMiddleton?'https://marinesafety.sa.gov.au/web-cameras/goolwa-beach-algal-bloom-web-camera':'https://marinesafety.sa.gov.au/web-cameras/south-port-beach-algal-bloom-web-camera';
  function buildShell(){
    const header=document.querySelector('header'),hero=$('hero'),controls=document.querySelector('.controls');if(!header||!hero)return;
    header.innerHTML=`<div class="brand-lockup"><div class="brand-mark">≈</div><div><div class="brand-name">Frenchy Review</div><div class="brand-sub">Local surf intelligence</div></div></div><nav class="main-nav"><a href="${cameraUrl}" target="_blank" rel="noopener">Live camera</a><a href="./wave-map.html">Swell journey</a><a href="https://frenchysurfschool.square.site/">Coaching</a></nav><div class="top-actions"><div class="status-pill"><span class="dot"></span><span id="statusText">Report updated</span></div><button class="header-refresh" id="headerRefresh">Refresh report</button></div>`;
    const spotbar=document.createElement('div');spotbar.className='spot-bar';spotbar.innerHTML=`<div class="spot-tabs"><a class="spot-tab ${!isMiddleton?'active':''}" href="./index.html">Seaford<small>Mid Coast</small></a><a class="spot-tab ${isMiddleton?'active':''}" href="./middleton.html">Middleton<small>South Coast</small></a></div><div class="adelaide-clock">Adelaide time<b id="adelaideClock">Loading…</b></div>`;header.after(spotbar);
    hero.dataset.reportTitle=`${spot} surf report`;
    const tideText=$('tideCall')?.textContent||'Loading tide…';
    const metrics=hero.querySelectorAll('.decision-item');
    if(metrics[0])metrics[0].innerHTML='<small>WIND</small><b id="heroWind">Loading…</b>';
    if(metrics[1])metrics[1].innerHTML=`<small>TIDE</small><b id="tideCall">${tideText}</b>`;
    if(metrics[2])metrics[2].innerHTML='<small>QUALITY</small><b id="qualityText">Calculating…</b>';
    const layout=document.createElement('div');layout.className='decision-layout';hero.before(layout);layout.appendChild(hero);
    const aside=document.createElement('aside');aside.className='aside-stack';aside.innerHTML=`<section class="side-card weather-side"><div class="weather-big">🌦️</div><div><div class="side-eyebrow">BEACH COMFORT</div><b id="sideTemp">--°C</b><small id="sideWeather">Live weather below</small></div></section>`;layout.appendChild(aside);
    const shortcuts=$('timeShortcuts');if(shortcuts)hero.querySelector('div')?.appendChild(shortcuts);
    $('headerRefresh').addEventListener('click',()=> $('refreshBtn')?.click());
    setInterval(clock,30000);clock();document.addEventListener('phase1-report-rendered',update);
  }
  function clock(){setText('adelaideClock',new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit',timeZone:'Australia/Adelaide'}).format(new Date()))}
  function setupTimes(){const s=$('timeSelect'),h=$('timeShortcuts');if(!s||!h)return;h.innerHTML='';const vals=['now','6','12','18'];[['now','Now'],['6','6 AM'],['12','12 PM'],['18','6 PM']].forEach(([v,l])=>{const b=document.createElement('button');b.type='button';b.className='time-chip';b.textContent=l;b.onclick=()=>{s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));paint()};h.appendChild(b)});function paint(){[...h.children].forEach((b,i)=>b.classList.toggle('active',vals[i]===s.value))}s.addEventListener('change',paint);paint()}
  function update(){
    const main=$('mainSize')?.textContent||'';
    const windText=$('windMain')?.textContent||'';
    const known=/\d/.test(windText)&&!/(unknown|unavailable|--)/i.test(windText);
    const current=window.__FRENCHY_PHASE1_CURRENT__;
    if(current) setText('phase1Debug',JSON.stringify(current,null,2));
    setText('heroWind',known?`${$('windSub')?.textContent?.split(' ')[0]||''} ${windText}`:'Wind unknown');
    if(/unavailable|--/i.test(main)||!known) setText('qualityText','Not assessed · wind/data unknown');
    else if(current) setText('qualityText',surfQualityLabel(current));
    else setText('qualityText','Awaiting report');
    const forecast=$('viewingTimeLabel');
    if(forecast&&current) forecast.textContent=`Forecast for ${current.time.slice(0,10)} · ${phase1.clock(current.time)} Adelaide · ${current.windStatus==='cached'?'cached source':'model forecast'}`;
    const temp=document.querySelector('.weather-temp');if(temp)setText('sideTemp',temp.textContent.trim());
  }
  document.addEventListener('DOMContentLoaded',()=>{buildShell();setupTimes();if(new URLSearchParams(location.search).has('debug')){const panel=document.createElement('details');panel.className='phase1-debug';panel.innerHTML='<summary>Developer forecast trace</summary><pre id="phase1Debug"></pre>';document.querySelector('main')?.appendChild(panel);if(!$('phase1Debug'))document.body.appendChild(panel)}update();const mainSize=$('mainSize'),windMain=$('windMain'),why=$('plainWhy');[mainSize,windMain,why].filter(Boolean).forEach(el=>new MutationObserver(update).observe(el,{childList:true,characterData:true,subtree:true}))});
})();
