// 케이스 스터디 언어: ?lang= > 첫 화면에서 저장한 선택 > 영어. 두 언어가 한 문서에 있어 새로 불러오지 않고 바꾼다
(() => {
  const doc = document.documentElement;
  let lang = new URLSearchParams(location.search).get('lang');
  if (lang !== 'ko' && lang !== 'en') { try { lang = localStorage.getItem('lang'); } catch {} }
  const links = document.querySelectorAll('.lang a'), back = document.querySelector('.top .back');
  const apply = l => {
    lang = l === 'ko' ? 'ko' : 'en';
    doc.lang = lang;
    document.title = doc.dataset['title' + (lang === 'ko' ? 'Ko' : 'En')] || document.title;
    links.forEach(a => a.toggleAttribute('aria-current', a.dataset.lang === lang));
    // 첫 화면으로 돌아갈 때 같은 언어, 같은 장면으로
    if (back) back.href = `../?lang=${lang}&scene=${back.dataset.scene}#m-${back.dataset.scene}`;
    document.querySelectorAll('a[data-case]').forEach(a => { a.href = `${a.dataset.case}?lang=${lang}`; });
  };
  apply(lang);
  links.forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); apply(a.dataset.lang);
    try { localStorage.setItem('lang', lang); } catch {}
    const u = new URL(location.href); u.searchParams.set('lang', lang); history.replaceState(null, '', u);
  }));
})();
