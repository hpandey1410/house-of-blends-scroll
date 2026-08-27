(function(){
  "use strict";

  var hero = document.getElementById('hero');
  if (!hero) return;

  var stage = document.getElementById('stage');
  var video = document.getElementById('heroVideo');
  var poster = document.getElementById('poster');
  var nav = document.getElementById('siteNav');

  var bandEls = Array.prototype.slice.call(document.querySelectorAll('.band'));
  var bands = bandEls.map(function(el){
    return {
      el: el,
      a: parseFloat(el.dataset.a),
      b: parseFloat(el.dataset.b),
      words: Array.prototype.slice.call(el.querySelectorAll('.w')),
      op: -1,
      k: -1
    };
  });

  var VIDEO_URL = 'assets/hero-scrub.mp4';
  var VIDEO_BYTES = 14178823;
  var ring = document.querySelector('.ring');

  /* ---------- seeded rng so word offsets are stable across loads ---------- */
  function rng(seed){
    var s = seed >>> 0;
    return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------- split headline words into .w spans (once, at load) ---------- */
  function splitWords(container){
    var rand = rng(1337);
    var nodes = Array.prototype.slice.call(container.querySelectorAll('[data-split]'));
    nodes.forEach(function(node){
      var text = node.textContent.trim();
      var words = text.split(/\s+/);
      node.textContent = '';
      var visible = document.createElement('span');
      visible.className = 'split-w';
      visible.setAttribute('aria-hidden', 'true');
      words.forEach(function(word, i){
        var w = document.createElement('span');
        w.className = 'w';
        w.style.setProperty('--th', (i / words.length * 0.55 + rand() * 0.05).toFixed(3));
        w.textContent = word;
        visible.appendChild(w);
        if (i < words.length - 1) visible.appendChild(document.createTextNode(' '));
      });
      var sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = text;
      node.appendChild(sr);
      node.appendChild(visible);
    });
  }
  bandEls.forEach(splitWords);
  bands.forEach(function(b){ b.words = Array.prototype.slice.call(b.el.querySelectorAll('.w')); });

  /* ================= static-hero gates (live, both directions) ================= */
  var GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  var reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  var scrubOn = false;
  var started = false;

  function paintPoster(){
    poster.style.backgroundImage = "url('assets/hero-poster.jpg')";
  }

  function startBlobFetch(){
    if (started) return;
    started = true;
    loadHeroBlob().catch(failVideo);
  }

  function loadHeroBlob(){
    var ctrl = new AbortController();
    var watchdog = setTimeout(function(){ ctrl.abort(); }, 20000);
    return fetch(VIDEO_URL, { signal: ctrl.signal }).then(function(res){
      var total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
      var reader = res.body.getReader();
      var chunks = [];
      var got = 0, lastRing = 0;
      function pump(){
        return reader.read().then(function(result){
          if (result.done) return;
          clearTimeout(watchdog);
          watchdog = setTimeout(function(){ ctrl.abort(); }, 20000);
          chunks.push(result.value);
          got += result.value.length;
          var frac = Math.min(1, got / total);
          var now = performance.now();
          if (ring && (now - lastRing > 100 || frac === 1)) {
            lastRing = now;
            ring.style.setProperty('--ld', Math.round(126 * (1 - frac)));
          }
          return pump();
        });
      }
      return pump().then(function(){
        clearTimeout(watchdog);
        if (ring) ring.style.setProperty('--ld', 0);
        video.src = URL.createObjectURL(new Blob(chunks));
        video.load();
        video.addEventListener('canplay', function(){
          requestSeek(heroProgress() * (video.duration || 13.75));
          stage.classList.add('video-ready');
          if (ring) ring.style.display = 'none';
        }, { once: true });
      });
    });
  }

  function failVideo(){
    stage.classList.add('video-failed');
    if (ring) ring.style.display = 'none';
  }

  function enableScrub(){
    if (scrubOn) return;
    scrubOn = true;
    paintPoster();
    startBlobFetch();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(function(b){ b.op = -1; b.k = -1; });
    onScroll();
  }
  function disableScrub(){
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function applyHeroMode(){
    var staticMode = GATES.some(function(q){ return matchMedia(q).matches; });
    if (staticMode) disableScrub(); else enableScrub();
  }
  var MQLS = GATES.map(function(q){ return matchMedia(q); });
  MQLS.forEach(function(m){ m.addEventListener('change', applyHeroMode); });

  /* ================= scroll -> progress ================= */
  function heroProgress(){
    var rect = hero.getBoundingClientRect();
    var total = hero.offsetHeight - innerHeight;
    if (total <= 0) return 1;
    var scrolled = -rect.top;
    return Math.min(1, Math.max(0, scrolled / total));
  }

  /* ================= gated seeks ================= */
  var seekBusy = false, pendingTime = null;
  function requestSeek(t){
    if (!video.duration) return;
    t = Math.min(video.duration, Math.max(0, t));
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true;
    video.currentTime = t;
  }
  video.addEventListener('seeked', function(){
    seekBusy = false;
    if (pendingTime !== null) {
      var t = pendingTime; pendingTime = null; requestSeek(t);
    }
  });
  video.addEventListener('error', function(){ seekBusy = false; pendingTime = null; });

  /* ================= lerp drive loop ================= */
  var target = 0, shown = 0, rafId = null, lastTick = 0;
  var loadStart = performance.now();

  function smoothstep(p, e0, e1){
    var t = Math.min(1, Math.max(0, (p - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  function updateBands(p, now){
    bands.forEach(function(band, idx){
      var a = band.a, b = band.b;
      var f = Math.min(0.02, (b - a) / 3);
      var isFirst = idx === 0;
      var isLast = idx === bands.length - 1;
      var opacity;
      if (isFirst && isLast) opacity = 1;
      else if (isFirst) opacity = 1 - smoothstep(p, b - f, b);
      else if (isLast) opacity = smoothstep(p, a, a + f);
      else opacity = smoothstep(p, a, a + f) * (1 - smoothstep(p, b - f, b));

      var ramp = Math.min(0.045, (b - a) * 0.5);
      var k = Math.min(1, Math.max(0, (p - a) / ramp));

      if (idx === 0) {
        var loadK = Math.min(1, (now - loadStart) / 900);
        k = Math.max(k, loadK);
      }

      if (Math.abs(opacity - band.op) > 0.004) {
        band.el.style.opacity = opacity.toFixed(3);
        band.op = opacity;
      }
      if (Math.abs(k - band.k) > 0.004) {
        band.el.style.setProperty('--k', k.toFixed(3));
        band.k = k;
      }
    });
  }

  var lastCueState = null;
  function updateCue(p){
    var show = p < 0.04;
    if (show !== lastCueState) {
      hero.classList.toggle('past-start', !show);
      lastCueState = show;
    }
  }

  var lastNavState = null;
  function updateNav(p){
    var solid = p > 0.06 || heroPastViewport();
    if (solid !== lastNavState) {
      nav.classList.toggle('solid', solid);
      lastNavState = solid;
    }
  }
  function heroPastViewport(){
    return hero.getBoundingClientRect().bottom <= 0;
  }

  function tick(now){
    var dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    var k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    var converged = Math.abs(target - shown) < 0.0005;
    var loadRampActive = (now - loadStart) < 950;
    if (converged && !loadRampActive) {
      shown = target;
      rafId = null;
      lastTick = 0;
    } else {
      if (converged) shown = target;
      rafId = requestAnimationFrame(tick);
    }
    requestSeek(shown * (video.duration || 13.75));
    updateBands(shown, now);
    updateCue(shown);
    updateNav(shown);
  }

  var heroOnScreen = true;
  var io = new IntersectionObserver(function(entries){
    heroOnScreen = entries[0].isIntersecting;
  }, { threshold: 0 });
  io.observe(hero);

  function onScroll(){
    target = heroProgress();
    updateNav(target);
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  applyHeroMode();

  /* ================= reduced-motion pin (both directions) ================= */
  function pinToFinalStates(){
    bands.forEach(function(b){ b.el.style.opacity = '1'; b.el.style.setProperty('--k', '1'); });
  }
  reduceMQ.addEventListener('change', function(e){
    if (e.matches) pinToFinalStates(); else applyHeroMode();
  });
  if (reduceMQ.matches) pinToFinalStates();

  /* ================= pour interaction (the one designed moment) ================= */
  var pourEl = document.querySelector('.pour-cup');
  if (pourEl) {
    var pourWrap = pourEl.closest('.pour');
    var pourProgress = 0, pourRaf = null, holding = false, pourDone = false;
    var revealGroup = document.querySelector('#sipMenuGrid');

    function setPour(v){
      pourProgress = Math.min(1, Math.max(0, v));
      pourEl.style.setProperty('--pour', pourProgress.toFixed(3));
      pourEl.setAttribute('aria-valuenow', Math.round(pourProgress * 100));
      if (pourProgress >= 1 && !pourDone) {
        pourDone = true;
        pourWrap.classList.add('done');
        if (revealGroup) {
          revealGroup.querySelectorAll('.reveal').forEach(function(el){ el.classList.add('in'); });
          setTimeout(function(){ revealGroup.classList.add('settled'); }, 700);
        }
      }
    }

    function pourLoop(){
      if (holding && pourProgress < 1) {
        setPour(pourProgress + 0.014);
        pourRaf = requestAnimationFrame(pourLoop);
      } else if (!holding && pourProgress > 0 && !pourDone) {
        pourEl.classList.add('releasing');
        setPour(pourProgress - 0.02);
        pourRaf = requestAnimationFrame(pourLoop);
      } else {
        pourRaf = null;
      }
    }

    function begin(e){
      if (pourDone || reduceMQ.matches) return;
      holding = true;
      pourEl.classList.remove('releasing');
      if (!pourRaf) pourRaf = requestAnimationFrame(pourLoop);
      e.preventDefault();
    }
    function end(){
      holding = false;
      if (!pourRaf) pourRaf = requestAnimationFrame(pourLoop);
    }

    pourEl.addEventListener('pointerdown', begin);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    pourEl.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ') { begin(e); setTimeout(function(){ setPour(1); }, 50); }
    });

    if (reduceMQ.matches) setPour(1);
  }

})();
