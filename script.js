(() => {
  const doc = document;
  const root = doc.documentElement;
  const form = doc.getElementById('search-form');
  const input = doc.getElementById('search-input');
  const list = doc.getElementById('suggestions');
  const clearBtn = doc.getElementById('clear-btn');
  // theme toggle removed (dark mode only)
  const recentWrap = doc.getElementById('recent');
  const resultsSection = doc.getElementById('results-section');
  const resultsEl = doc.getElementById('results');
  const resultsToolbar = doc.querySelector('.results-toolbar');
  const summarizeBtn = doc.getElementById('summarize-btn');
  const highlightsBtn = doc.getElementById('highlights-btn');
  const copyBtn = doc.getElementById('copy-btn');
  const exportBtn = doc.getElementById('export-btn');
  const confidenceMeter = doc.getElementById('confidence-meter');
  const referencesSection = doc.getElementById('references-section');
  const referencesList = doc.getElementById('references-list');
  const timelineSection = doc.getElementById('timeline-section');

  const SUGGESTIONS = [
    'weather today', 'news headlines', 'how to code', 'javascript array methods',
    'restaurants near me', 'translate hello', 'time in Tokyo', 'bitcoin price',
    'css grid examples', 'python tutorial', 'movies this weekend', 'best laptops 2025'
  ];

  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
  };

  // THEME: force dark mode
  root.setAttribute('data-theme', 'dark');

  // RECENT SEARCHES
  const MAX_RECENTS = 6;
  function loadRecents() { return storage.get('recents', []); }
  function saveRecent(q) {
    if (!q) return;
    const recents = loadRecents().filter(x => x.toLowerCase() !== q.toLowerCase());
    recents.unshift(q);
    storage.set('recents', recents.slice(0, MAX_RECENTS));
    renderRecents();
  }
  function renderRecents() {
    const recents = loadRecents();
    recentWrap.innerHTML = '';
    recents.forEach(text => {
      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = text;
      chip.addEventListener('click', () => {
        input.value = text;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
      recentWrap.appendChild(chip);
    });
  }
  renderRecents();

  // SUGGESTIONS
  let activeIndex = -1;
  let currentList = [];

  function openList() {
    list.classList.add('visible');
    list.parentElement?.setAttribute('aria-expanded', 'true');
  }
  function closeList() {
    list.classList.remove('visible');
    list.parentElement?.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }
  function setActive(i) {
    activeIndex = i;
    Array.from(list.children).forEach((el, idx) => {
      el.setAttribute('aria-selected', String(idx === i));
    });
  }
  function renderSuggestions(items) {
    list.innerHTML = '';
    currentList = items;
    items.forEach((text, i) => {
      const li = doc.createElement('li');
      li.id = `sug-${i}`;
      li.setAttribute('role', 'option');
      li.innerHTML = `<span>${highlight(text, input.value)}</span> <span class="pill">suggested</span>`;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); select(i); });
      list.appendChild(li);
    });
    if (items.length) openList(); else closeList();
  }
  function highlight(text, term) {
    if (!term) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + term.length));
    const after = escapeHtml(text.slice(idx + term.length));
    return `${before}<strong>${match}</strong>${after}`;
  }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.classList.toggle('show', Boolean(q));
    if (!q) {
      renderSuggestions([]);
      hideResultsSection();
      hideReferences();
      hideToolbar();
      hideTimeline();
      return;
    }
    const results = SUGGESTIONS.filter(x => x.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
    renderSuggestions(results);
  });

  input.addEventListener('keydown', (e) => {
    const size = currentList.length;
    if (!size) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIndex + 1) % size); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIndex - 1 + size) % size); }
    else if (e.key === 'Enter') { if (activeIndex >= 0) { e.preventDefault(); select(activeIndex); } }
    else if (e.key === 'Escape') { closeList(); input.blur(); setTimeout(() => input.focus(), 0); }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.focus();
    renderSuggestions([]);
    clearBtn.classList.remove('show');
    hideResultsSection();
    hideReferences();
    hideToolbar();
    hideTimeline();
  });

  function select(i) {
    const value = currentList[i] ?? input.value.trim();
    input.value = value;
    closeList();
    onSubmit(value);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    loadData(q);
    if (!q) return;
    onSubmit(q);
  });

  function onSubmit(q) {
    saveRecent(q);
    fetchAndRender(q);
    // smooth scroll to results container
    setTimeout(() => {
      const target = resultsSection;
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // SEARCH + RENDER (Wikipedia API)
  let lastPlainText = '';
  let lastTitle = '';

 async function fetchAndRender(question) {
  setBusy(true);
  disableActions(true);
  resultsEl.innerHTML = renderSkeleton();
  
  try {
    const apiUrl = "http://127.0.0.1:5000/ask?question=" + question;
    const res = await fetch(apiUrl, { headers: { "accept": "application/json" } });
    if (!res.ok) throw new Error("Backend request failed");
    
    const data = await res.json();

    // Extract data from backend response
    const answer = data.answer;
    const citations = data.citations || [];
    const citationsNamesWithYear = data.citationsNamesWithYear || [];

    // Build the results card
    resultsEl.innerHTML = `
      <article class="card">
        <header class="card-head">
          <h2 class="card-title">Answer:</h2>
        </header>
        <div class="card-body">
          <p class="extract">${escapeHtml(answer)}</p>
        </div>
        ${
          citations.length
            ? `<footer class="card-foot">
                <div class="muted">Citations</div>
                <ul class="links">
                  ${citations
                    .map(
                      c =>
                        `<li><a href="${c.url}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a></li>`
                    )
                    .join("")}
                </ul>
              </footer>`
            : ""
        }
      </article>
    `;

    // Show the rest of your UI
    showReferences(citations);
    renderPublications(citationsNamesWithYear);
    showToolbar();
    showTimeline();
    showResultsSection();

    markReveal(resultsSection);
    markReveal(referencesSection);
    markReveal(doc.getElementById("timeline-section"));
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = `<div class="error">Could not load data from backend.</div>`;
    hideResultsSection();
    hideReferences();
    hideToolbar();
    hideTimeline();
  } finally {
    setBusy(false);
  }
}

  function setBusy(isBusy) {
    resultsSection?.setAttribute('aria-busy', String(isBusy));
  }

  function disableActions(disabled) {
    summarizeBtn.disabled = disabled;
    highlightsBtn.disabled = disabled;
    copyBtn.disabled = disabled;
    exportBtn.disabled = disabled;
  }

  function renderSkeleton() {
    return `
      <div class="skeleton">
        <div class="line w60"></div>
        <div class="line w90"></div>
        <div class="line w80"></div>
      </div>
    `;
  }

  // Reveal-on-scroll using IntersectionObserver
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-in');
        entry.target.classList.remove('reveal-init');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

  function markReveal(el) {
    if (!el) return;
    el.classList.add('reveal-init');
    io.observe(el);
  }

  // SUMMARIZE (simple extractive)
  summarizeBtn?.addEventListener('click', () => {
    if (!lastPlainText) return;
    const summary = extractiveSummary(lastPlainText, 4);
    const { html, citations } = renderAnswerWithCitations(summary, mockCitations());
    resultsEl.innerHTML = renderGenerated('Summary', html, citations);
    updateConfidence(summary);
  });

  // HIGHLIGHTS (top keywords + sentences)
  highlightsBtn?.addEventListener('click', () => {
    if (!lastPlainText) return;
    const { keywords, sentences } = highlightsFromText(lastPlainText, 5, 4);
    const keyTerms = emphasizeKeywords(sentences.join(' '), ['immune cells', 'radiation', 'gravity']);
    resultsEl.innerHTML = `
      <article class="card">
        <header class="card-head">
          <h2 class="card-title">Highlights — ${escapeHtml(lastTitle || 'Result')}</h2>
        </header>
        <div class="card-body">
          <div class="muted">Key terms</div>
          <ul class="chips">${keywords.map(k => `<li class="chip small">${escapeHtml(k)}</li>`).join('')}</ul>
          <div class="muted" style="margin-top:10px">Key points</div>
          <ul class="bullets">${sentences.map(s => `<li>${emphasizeKeywords(escapeHtml(s), ['immune cells','radiation','gravity'])}</li>`).join('')}</ul>
        </div>
      </article>
    `;
    updateConfidence(sentences.join(' '));
  });

  function renderGenerated(title, html, citations = []) {
    // citations footer
    const refs = citations.length ? `
      <footer class="card-foot">
        <div class="muted">References</div>
        <ol class="links">${citations.map(renderRefItem).join('')}</ol>
      </footer>
    ` : '';
    return `
      <article class="card">
        <header class="card-head">
          <h2 class="card-title">${escapeHtml(title)} — ${escapeHtml(lastTitle || 'Result')}</h2>
        </header>
        <div class="card-body"><p class="extract">${html}</p></div>
        ${refs}
      </article>
    `;
  }

  function renderRefItem(ref, i) {
    const pdfIcon = '<span class="icon">📄</span>';
    const linkIcon = '<span class="icon">↗</span>';
    const safeTitle = escapeHtml(ref.title || `Reference ${i+1}`);
    const safeAbs = escapeHtml(ref.abstract || '');
    const meta = [ref.year ? String(ref.year) : '', ref.source || ''].filter(Boolean).join(' • ');
    return `
      <li>
        <span class="ref-pop" tabindex="0" aria-expanded="false">
          <a class="cite" href="#" data-ref="${i+1}">[${i+1}]</a>
          <div class="ref-card" role="dialog" aria-label="Reference ${i+1}">
            <p class="ref-title">${safeTitle}</p>
            <p class="ref-meta">${escapeHtml(meta)}</p>
            <p class="muted" style="margin:0 0 8px">${safeAbs}</p>
            <div class="ref-actions">
              ${ref.pdf ? `<a href="${ref.pdf}" target="_blank" rel="noopener">${pdfIcon} PDF</a>` : ''}
              ${ref.link ? `<a href="${ref.link}" target="_blank" rel="noopener">${linkIcon} Open</a>` : ''}
            </div>
          </div>
        </span>
        <span style="margin-left:6px">${safeTitle}</span>
      </li>
    `;
  }

  function renderAnswerWithCitations(text, refs) {
    // Emphasize specific keywords
    let html = emphasizeKeywords(escapeHtml(text), ['immune cells','radiation','gravity']);
    // Insert inline numeric citations [1] ...
    const citations = Array.isArray(refs) ? refs : [];
    html += citations.length ? ` ${citations.map((_,i)=>`<a class="cite" href="#" data-ref="${i+1}">[${i+1}]</a>`).join(' ')}` : '';
    return { html, citations };
  }

  function emphasizeKeywords(html, terms) {
    if (!terms || !terms.length) return html;
    const pattern = new RegExp(`(${terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`, 'gi');
    return html.replace(pattern, '<mark>$1</mark>');
  }

  function updateConfidence(text) {
    const len = text.length;
    const nonLetters = (text.match(/[^a-zA-Z]/g) || []).length;
    const ratio = len ? 1 - (nonLetters/len) : 0;
    let level = 'Low', cls = 'conf-low';
    if (ratio > 0.7) { level = 'High'; cls = 'conf-high'; }
    else if (ratio > 0.5) { level = 'Medium'; cls = 'conf-medium'; }
    confidenceMeter.innerHTML = `<span class="conf-dot ${cls}"></span> ${level} confidence`;
  }

  // Copy and Export actions
  copyBtn?.addEventListener('click', async () => {
    const text = resultsEl.innerText.trim();
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied!'; setTimeout(()=>copyBtn.textContent='Copy',1200);} catch {}
  });

  exportBtn?.addEventListener('click', () => {
    // Basic print-to-PDF flow
    window.print();
  });

  // References section rendering (hidden by default until a search)
  if (referencesSection) referencesSection.style.display = 'none';
  if (resultsToolbar) resultsToolbar.style.display = 'none';
  if (timelineSection) timelineSection.style.display = 'none';
  if (resultsSection) resultsSection.style.display = 'none';

  function hideReferences() {
    if (!referencesSection || !referencesList) return;
    referencesSection.style.display = 'none';
    referencesList.innerHTML = '';
  }

  function hideToolbar() {
    if (resultsToolbar) resultsToolbar.style.display = 'none';
  }
  function showToolbar() {
    if (resultsToolbar) resultsToolbar.style.display = 'flex';
  }

  function hideTimeline() {
    if (timelineSection) timelineSection.style.display = 'none';
  }
  function showTimeline() {
    if (timelineSection) timelineSection.style.display = 'block';
  }

  function hideResultsSection() {
    if (resultsSection) resultsSection.style.display = 'none';
  }
  function showResultsSection() {
    if (resultsSection) resultsSection.style.display = 'block';
  }

  function showReferences(refs) {
    if (!referencesSection || !referencesList) return;
    const data = Array.isArray(refs) ? refs : [];
    const PAGE = 4;
    let page = 1;

    function renderPage() {
      const slice = data.slice(0, PAGE * page);
      referencesList.innerHTML = slice.map((ref, idx) => {
      const pdfIcon = '<span class="icon">📄</span>';
      const linkIcon = '<span class="icon">↗</span>';
      const meta = [ref.year ? String(ref.year) : '', ref.source || ''].filter(Boolean).join(' • ');
        return `
          <li>
            <div class="ref-item">
              <div class="ref-main">
                <button class="ref-toggle icon-button" aria-expanded="false" aria-controls="ref-${idx+1}">[${idx+1}]</button>
                <p class="ref-title">${escapeHtml(ref.title || `Reference ${idx+1}`)}</p>
                <p class="ref-meta">${escapeHtml(meta)}</p>
                <div id="ref-${idx+1}" class="ref-card" hidden>
                  <p class="muted" style="margin:0 0 8px">${escapeHtml(ref.abstract || '')}</p>
                  <div class="ref-actions">
                    ${ref.pdf ? `<a href="${ref.pdf}" target="_blank" rel="noopener">${pdfIcon} PDF</a>` : ''}
                    ${ref.link ? `<a href="${ref.link}" target="_blank" rel="noopener">${linkIcon} Open</a>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </li>
        `;
      }).join('');

      // toggle more button
      const moreBtn = doc.getElementById('references-more-btn');
      if (moreBtn) moreBtn.style.display = data.length > slice.length ? 'inline-flex' : 'none';
    }

    // initial render and reveal
    referencesSection.style.display = data.length ? 'block' : 'none';
    renderPage();

    // toggle expand
    referencesList.addEventListener('click', (e) => {
      const btn = e.target.closest('.ref-toggle');
      if (!btn) return;
      const id = btn.getAttribute('aria-controls');
      const panel = id && doc.getElementById(id);
      if (!panel) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      panel.toggleAttribute('hidden');
    }, { once: true });

    // more button
    const moreBtn = doc.getElementById('references-more-btn');
    if (moreBtn) {
      moreBtn.onclick = () => { page += 1; renderPage(); };
    }
  }

  // Timeline visualization (D3-based)
  const timelineEl = doc.getElementById('timeline');
  const yearSlider = doc.getElementById('timeline-year');
  const yearDisplay = doc.getElementById('timeline-year-display');
  if (timelineEl && yearSlider && window.d3) {
    const d3 = window.d3;
    // shared tooltip
    let tip = doc.getElementById('timeline-tip');
    if (!tip) {
      tip = doc.createElement('div');
      tip.id = 'timeline-tip';
      tip.className = 'timeline-tip';
      tip.style.position = 'fixed';
      tip.style.pointerEvents = 'none';
      tip.style.display = 'none';
      doc.body.appendChild(tip);
    }
    function renderTimeline(baseYear) {
      const start = Number(baseYear);
      const end = start + 9; // 10-year window
      const margin = { top: 12, right: 16, bottom: 24, left: 16 };
      const width = Math.max(480, timelineEl.clientWidth - margin.left - margin.right);
      const height = 80;

      // data
      const events = getTimelineEvents(start);
      const x = d3.scaleLinear().domain([start, end]).range([margin.left, margin.left + width]);

      // clear
      timelineEl.innerHTML = '';

      const svg = d3.select(timelineEl)
        .append('svg')
        .attr('viewBox', `0 0 ${margin.left + width + margin.right} ${margin.top + height + margin.bottom}`)
        .attr('width', '100%')
        .attr('height', height + margin.top + margin.bottom)
        .attr('preserveAspectRatio', 'xMinYMin meet');

      // main rail (centered)
      svg.append('line')
        .attr('x1', margin.left)
        .attr('x2', margin.left + width)
        .attr('y1', margin.top + height / 2)
        .attr('y2', margin.top + height / 2)
        .attr('stroke', 'rgba(226,232,240,0.22)')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round');

      // no ticks: minimalist "notes" look

      // events (dots only, tooltip on hover)
      const group = svg.selectAll('event')
        .data(events)
        .enter()
        .append('g')
        .attr('class', 'event')
        .attr('transform', d => `translate(${x(d.year)}, ${margin.top})`)
        .style('cursor', d => d.link ? 'pointer' : 'default')
        .on('click', (e, d) => { if (d.link) window.open(d.link, '_blank', 'noopener'); })
        .on('mouseenter', (e, d) => {
          tip.textContent = `${d.year} · ${d.title}`;
          tip.style.display = 'block';
        })
        .on('mousemove', (e) => {
          const pad = 10;
          tip.style.left = (e.clientX + pad) + 'px';
          tip.style.top = (e.clientY + pad) + 'px';
        })
        .on('mouseleave', () => { tip.style.display = 'none'; });

      group.append('circle')
        .attr('r', 6)
        .attr('cy', height/2)
        .attr('fill', d => d.kind === 'mission' ? '#a78bfa' : d.kind === 'milestone' ? '#34d399' : '#06b6d4')
        .attr('stroke', '#0b1020')
        .attr('stroke-width', 2)
        .attr('filter', 'drop-shadow(0 2px 10px rgba(2,6,23,.55))');

      // compact note labels above dots
      const notes = svg.selectAll('note')
        .data(events)
        .enter()
        .append('g')
        .attr('class', 'tl-note')
        .attr('transform', d => `translate(${x(d.year)}, ${margin.top})`);

      const NOTE_Y = height/2 - 34;
      notes.each(function(d){
        const g = d3.select(this);
        const text = `${d.year} · ${d.title}`;
        const estWidth = Math.min(200, Math.max(90, text.length * 6));
        const estHeight = 24;
        g.append('rect')
          .attr('class', 'tl-note-rect')
          .attr('x', -estWidth/2)
          .attr('y', NOTE_Y - estHeight)
          .attr('width', estWidth)
          .attr('height', estHeight)
          .attr('rx', 8)
          .attr('ry', 8);
        g.append('text')
          .attr('class', 'tl-note-text')
          .attr('x', 0)
          .attr('y', NOTE_Y - 8)
          .attr('text-anchor', 'middle')
          .text(text);
      });
    }

    function getTimelineEvents(start) {
      const sample = [
        { year: 2000, title: 'Human Research Program', kind: 'milestone' },
        { year: 2004, title: 'OSDR Initiated', kind: 'milestone', link: 'https://osdr.nasa.gov' },
        { year: 2011, title: 'ISS Long-Duration Studies', kind: 'mission', link: 'https://www.nasa.gov/mission_pages/station/research/experiments' },
        { year: 2015, title: 'Twin Study Highlights', kind: 'paper', link: 'https://www.science.org' },
        { year: 2020, title: 'Artemis Announced', kind: 'mission', link: 'https://www.nasa.gov/specials/artemis/' },
        { year: 2023, title: 'OSDR Open Science', kind: 'milestone', link: 'https://osdr.nasa.gov' }
      ];
      return sample.filter(e => e.year >= start && e.year < start + 100);
    }

    yearSlider.addEventListener('input', () => {
      const y = Number(yearSlider.value);
      if (yearDisplay) yearDisplay.textContent = `${y}–${y+9}`;
      renderTimeline(y);
    });
    // enhance touch: tap anywhere to hide tooltip
    timelineEl.addEventListener('touchstart', () => { const t = doc.getElementById('timeline-tip'); if (t) t.style.display = 'none'; }, { passive: true });
    if (yearDisplay) yearDisplay.textContent = `${yearSlider.value}–${Number(yearSlider.value)+9}`;
    renderTimeline(yearSlider.value);
    window.addEventListener('resize', () => renderTimeline(yearSlider.value));
  }

  // Delegate citation popovers
  resultsEl.addEventListener('click', (e) => {
    const a = e.target.closest('a.cite');
    if (!a) return;
    e.preventDefault();
    const wrapper = a.closest('.ref-pop');
    if (!wrapper) return;
    const expanded = wrapper.getAttribute('aria-expanded') === 'true';
    doc.querySelectorAll('.ref-pop[aria-expanded="true"]').forEach(el=>el.setAttribute('aria-expanded','false'));
    wrapper.setAttribute('aria-expanded', String(!expanded));
  });

  // Mock data for demonstration until backend available
  function mockCitations() {
    return [
      { title: 'Effects of space radiation on immune cells', year: 2021, source: 'NASA OSDR', abstract: 'Study exploring radiation impact on astronaut immunity.', link: 'https://osdr.nasa.gov', pdf: 'https://example.com/paper.pdf' },
      { title: 'Microgravity and human physiology', year: 2019, source: 'NASA Task Book', abstract: 'Overview of gravity-related changes in biology.', link: 'https://taskbook.nasaprs.com' }
    ];
  }

  // Heuristic extractive summary
  function extractiveSummary(text, maxSentences = 3) {
    const sentences = splitSentences(text);
    if (sentences.length <= maxSentences) return text;
    const stop = new Set(commonStopwords);
    const freq = Object.create(null);
    sentences.forEach(s => {
      tokenize(s).forEach(w => { if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1; });
    });
    const scored = sentences.map((s, idx) => ({
      i: idx,
      s,
      score: tokenize(s).reduce((t, w) => t + (freq[w] || 0), 0) / (s.length + 1)
    }));
    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, maxSentences).sort((a, b) => a.i - b.i).map(x => x.s);
    return picked.join(' ');
  }

  function highlightsFromText(text, numKeywords = 6, numSentences = 4) {
    const sentences = splitSentences(text);
    const stop = new Set(commonStopwords);
    const freq = Object.create(null);
    tokenize(text).forEach(w => { if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1; });
    const keywords = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0, numKeywords).map(x=>x[0]);
    const sentenceScores = sentences.map(s => ({ s, score: tokenize(s).reduce((t,w)=> t + (keywords.includes(w) ? 1 : 0), 0) }));
    const topSentences = sentenceScores.sort((a,b)=>b.score-a.score).slice(0, numSentences).map(x=>x.s);
    return { keywords, sentences: topSentences };
  }

  function splitSentences(text) {
    return String(text).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  }
  function tokenize(s) {
    return s.toLowerCase().match(/[a-z][a-z\-']+/g) || [];
  }

  const commonStopwords = [
    'the','is','in','at','of','a','an','and','or','to','for','on','with','by','from','as','that','this','it','its','are','was','were','be','been','has','have','had','but','not','which','into','their','they','them','these','those','than','then','so','such','about','over','under','after','before','between','during','while','most','more','many','some','any','each','also','can','may','might','one','two','first','second','third'
  ];

  // === PUBLICATION TIMELINE SLIDER ===
const pubTimelineEl = doc.getElementById('publication-timeline');
const pubPrevBtn = doc.getElementById('pub-prev-btn');
const pubNextBtn = doc.getElementById('pub-next-btn');

if (pubTimelineEl && pubPrevBtn && pubNextBtn) {
  let pubCurrentPosition = 0;
  const pubScrollAmount = 320;

  // 🧩 Function to render timeline items
  function renderPublications(publications) {
    if (!publications || publications.length === 0) {
      pubTimelineEl.innerHTML = `<div class="empty">No publications found.</div>`;
      return;
    }

    pubTimelineEl.innerHTML = publications.map(pub => `
      <div class="publication-timeline-item">
        <div class="publication-timeline-point"></div>
        <div class="publication-timeline-content">
          <div class="publication-name">${pub.title}</div>
          <div class="publication-date">${pub.year}</div>
        </div>
      </div>
    `).join('');
  }

  function updatePubButtons() {
    const maxScroll = pubTimelineEl.scrollWidth - pubTimelineEl.parentElement.clientWidth;
    pubPrevBtn.disabled = pubCurrentPosition <= 0;
    pubNextBtn.disabled = pubCurrentPosition >= maxScroll;
  }

  function slidePubTimeline(direction) {
    const maxScroll = pubTimelineEl.scrollWidth - pubTimelineEl.parentElement.clientWidth;
    if (direction === 'next') {
      pubCurrentPosition = Math.min(pubCurrentPosition + pubScrollAmount, maxScroll);
    } else {
      pubCurrentPosition = Math.max(pubCurrentPosition - pubScrollAmount, 0);
    }
    pubTimelineEl.style.transform = `translateX(-${pubCurrentPosition}px)`;
    updatePubButtons();
  }

  pubNextBtn.addEventListener('click', () => slidePubTimeline('next'));
  pubPrevBtn.addEventListener('click', () => slidePubTimeline('prev'));

  window.addEventListener('resize', () => {
    pubCurrentPosition = 0;
    pubTimelineEl.style.transform = 'translateX(0)';
    updatePubButtons();
  });

  // 🧠 Load publications dynamically from backend
  async function loadPublicationsFromBackend() {
    try {
      const apiUrl = "http://127.0.0.1:5000/ask-test";
      const res = await fetch(apiUrl, { headers: { "accept": "application/json" } });
      if (!res.ok) throw new Error("Failed to fetch publications");

      const data = await res.json();
      
      updatePubButtons();
    } catch (err) {
      console.error("Error loading publications:", err);
      pubTimelineEl.innerHTML = `<div class="error">Failed to load publication timeline.</div>`;
    }
  }

  // 🚀 Initialize timeline with backend data
  loadPublicationsFromBackend();
}


})();


