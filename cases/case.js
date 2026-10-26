// 케이스 스터디 언어: ?lang= > 첫 화면에서 저장한 선택 > 영어. 두 언어가 한 문서에 있어 새로 불러오지 않고 바꾼다
(() => {
  const doc = document.documentElement;
  let lang = new URLSearchParams(location.search).get('lang');
  if (lang !== 'ko' && lang !== 'en') { try { lang = localStorage.getItem('lang'); } catch {} }
  const links = document.querySelectorAll('.lang a'), back = document.querySelector('.top .back');
  // 움직임 줄이기 설정이면 자동 재생하지 않는다
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.film').forEach(f => {
    const v = f.querySelector('video'), b = f.querySelector('.snd');
    if (still) { v.removeAttribute('autoplay'); v.controls = true; }
    b.addEventListener('click', () => { v.muted = !v.muted; b.setAttribute('aria-pressed', String(!v.muted)); if (!v.muted) v.play().catch(() => {}); });
    v.addEventListener('click', () => { v.paused ? v.play().catch(() => {}) : v.pause(); });
  });
  const apply = l => {
    lang = l === 'ko' ? 'ko' : 'en';
    doc.lang = lang;
    document.title = doc.dataset['title' + (lang === 'ko' ? 'Ko' : 'En')] || document.title;
    links.forEach(a => a.toggleAttribute('aria-current', a.dataset.lang === lang));
    // 첫 화면으로 돌아갈 때 같은 언어, 같은 장면으로
    if (back) back.href = `../?lang=${lang}&scene=${back.dataset.scene}#m-${back.dataset.scene}`;
    document.querySelectorAll('a[data-case]').forEach(a => { a.href = `${a.dataset.case}?lang=${lang}`; });
    // 영상도 지금 언어 버전으로
    document.querySelectorAll('.film video').forEach(v => {
      const src = v.dataset['src' + (lang === 'ko' ? 'Ko' : 'En')], poster = v.dataset['poster' + (lang === 'ko' ? 'Ko' : 'En')];
      if (v.getAttribute('src') === src) return;
      const at = v.currentTime || 0; v.poster = poster; v.src = src;
      v.addEventListener('loadedmetadata', () => { try { v.currentTime = at; } catch {} }, { once: true });
      if (!still) v.play().catch(() => {});
    });
  };
  apply(lang);
  links.forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); apply(a.dataset.lang);
    try { localStorage.setItem('lang', lang); } catch {}
    const u = new URL(location.href); u.searchParams.set('lang', lang); history.replaceState(null, '', u);
  }));
})();
