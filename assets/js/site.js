(function(){
  "use strict";

  var nav = document.getElementById('siteNav');
  var reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- nav goes solid on scroll (pages with no hero) ---------- */
  var hasHero = !!document.getElementById('hero');
  if (nav && !hasHero) {
    var lastSolid = null;
    function updateNavSolid(){
      var solid = scrollY > 40;
      if (solid !== lastSolid) { nav.classList.toggle('solid', solid); lastSolid = solid; }
    }
    addEventListener('scroll', updateNavSolid, { passive: true });
    updateNavSolid();
  }

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var mobileMenu = document.getElementById('mobileMenu');
  if (toggle && mobileMenu) {
    toggle.addEventListener('click', function(){
      var open = mobileMenu.classList.toggle('open');
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobileMenu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        mobileMenu.classList.remove('open');
        document.body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- reveal on scroll ---------- */
  var revealTargets = Array.prototype.slice.call(document.querySelectorAll('.reveal, .divider'));
  function pinAll(){
    revealTargets.forEach(function(el){ el.classList.add('in'); });
    document.querySelectorAll('.stagger').forEach(function(el){ el.classList.add('settled'); });
  }
  if (reduceMQ.matches) {
    pinAll();
  } else {
    var revealIO = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          var group = entry.target.closest('.stagger');
          if (group) {
            clearTimeout(group._settleTimer);
            group._settleTimer = setTimeout(function(){ group.classList.add('settled'); }, 700);
          }
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(function(el){ revealIO.observe(el); });
  }
  reduceMQ.addEventListener('change', function(e){ if (e.matches) pinAll(); });

  /* ---------- gallery lightbox ---------- */
  var galleryFigs = Array.prototype.slice.call(document.querySelectorAll('.gallery-grid figure'));
  var lightbox = document.getElementById('lightbox');
  if (galleryFigs.length && lightbox) {
    var lbImg = lightbox.querySelector('img');
    var lbCap = lightbox.querySelector('figcaption');
    function openLightbox(fig){
      var img = fig.querySelector('img');
      var cap = fig.querySelector('figcaption');
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lbCap.textContent = cap ? cap.textContent : '';
      lightbox.classList.add('open');
      document.body.classList.add('menu-open');
    }
    function closeLightbox(){
      lightbox.classList.remove('open');
      document.body.classList.remove('menu-open');
    }
    galleryFigs.forEach(function(fig){
      fig.setAttribute('tabindex', '0');
      fig.setAttribute('role', 'button');
      fig.addEventListener('click', function(){ openLightbox(fig); });
      fig.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(fig); }
      });
    });
    lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function(e){ if (e.target === lightbox) closeLightbox(); });
    addEventListener('keydown', function(e){ if (e.key === 'Escape') closeLightbox(); });
  }

  /* ---------- contact form (JS-only success state, no backend) ---------- */
  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function(e){
      e.preventDefault();
      form.closest('.contact-form').classList.add('sent');
    });
  }

  /* ---------- footer year ---------- */
  var yearEl = document.getElementById('yearNow');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- pause animations when tab hidden ---------- */
  document.addEventListener('visibilitychange', function(){
    document.body.classList.toggle('paused', document.hidden);
  });

})();
