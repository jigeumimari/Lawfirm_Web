/* ========= helpers ========= */
const $  = (s, c=document) => c.querySelector(s);
const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));

/* ========= mobile nav ========= */
(function navToggle(){
  const toggle = $('.nav-toggle');
  const nav = $('.nav');
  if(!toggle || !nav) return;
  toggle.addEventListener('click', ()=> nav.classList.toggle('show'));
  nav.addEventListener('click', e => { if(e.target.tagName==='A') nav.classList.remove('show'); });
})();

/* ========= reveal on scroll (re-animates up/down) ========= */
(function scrollReveal(){
  const imgs = $$('.reveal-img');
  if(!imgs.length) return;

  const io = new IntersectionObserver((entries)=>{
    entries.forEach(ent=>{
      if(ent.isIntersecting){
        ent.target.classList.add('visible');
      } else {
        ent.target.classList.remove('visible');
      }
    });
  }, {threshold:0.15});

  imgs.forEach(el=>io.observe(el));
})();

/* ========= carousel logic (3-at-a-time, responsive) ========= */
(function carousels(){
  const blocks = $$('.carousel-block');

  blocks.forEach(block=>{
    const wrap = $('.track-wrap', block);
    const track = $('.track', block);
    const prev = $('.cbtn.prev', block);
    const next = $('.cbtn.next', block);

    if(!wrap || !track || !prev || !next) return;

    let index = 0;
    const total = track.children.length;

    function cardsPerView(){
      if(window.innerWidth <= 640) return 1;
      if(window.innerWidth <= 940) return 2;
      return 3;
    }

    function totalPages(){ return Math.ceil(total / cardsPerView()); }

    function update(){
      index = Math.max(0, Math.min(index, totalPages() - 1));
      const viewportW = wrap.getBoundingClientRect().width;
      track.style.transform = `translateX(${-index * viewportW}px)`;
    }

    prev.addEventListener('click', ()=>{ index--; update(); });
    next.addEventListener('click', ()=>{ index++; update(); });
    window.addEventListener('resize', update);

    // ---- OPTIONAL AUTOPLAY (uncomment to enable) ----
    // Pauses on hover, loops pages
    let timer = null;
    function startAutoplay(){
      stopAutoplay();
      timer = setInterval(()=>{
        index = (index + 1) % totalPages();
        update();
      }, 5000); // every 5s
    }
    function stopAutoplay(){ if(timer){ clearInterval(timer); timer = null; } }

    // Hover to pause/resume
    block.addEventListener('mouseenter', stopAutoplay);
    block.addEventListener('mouseleave', startAutoplay);

    update();
    // startAutoplay(); // <-- enable this line if you want Services/Attorneys to auto-slide
  });
})();

/* ========= Testimonials soft auto-scroll (restored) ========= */
/* Moves cards gently from left to right, loops seamlessly */
(function testimonialsAuto(){
  const soft = $('.carousel.soft .track');
  if(!soft || !soft.children.length) return;

  let offset = 0;

  function step(){
    const first = soft.children[0];
    const w = first.getBoundingClientRect().width + 18; // card width + gap
    offset -= 0.4; // speed
    if(Math.abs(offset) >= w){
      soft.appendChild(first);
      offset = 0;
    }
    soft.style.transform = `translateX(${offset}px)`;
    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
})();

/* ========= footer year ========= */
(function footerYear(){
  const y = $('#year');
  if(y) y.textContent = new Date().getFullYear();
})();

/* ========= smooth scrolling + active nav state ========= */
(function smoothNav(){
  const links = document.querySelectorAll('.nav a[href^="#"]');

  // 1) Smooth scroll on click
  links.forEach(a=>{
    a.addEventListener('click', e=>{
      const id = a.getAttribute('href');
      const target = document.querySelector(id);
      if(!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Mark clicked as active immediately (mobile UX)
      links.forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
    });
  });

  // 2) Update active link while scrolling (IntersectionObserver)
  const sections = Array.from(links)
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  const io = new IntersectionObserver((entries)=>{
    // find the most visible section
    let top = entries
      .filter(ent => ent.isIntersecting)
      .sort((a,b)=> b.intersectionRatio - a.intersectionRatio)[0];
    if(!top) return;

    const id = '#' + top.target.id;
    links.forEach(x => x.classList.toggle('active', x.getAttribute('href') === id));
  }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, .25, .5, .75, 1] });

  sections.forEach(sec => io.observe(sec));
})();
