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
  const summarizeBtn = doc.getElementById('summarize-btn');
  const highlightsBtn = doc.getElementById('highlights-btn');

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
    clearBtn.style.display = q ? 'inline-flex' : 'none';
    if (!q) { renderSuggestions([]); return; }
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
    clearBtn.style.display = 'none';
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
    if (!q) return;
    onSubmit(q);
  });

  function onSubmit(q) {
    saveRecent(q);
    fetchAndRender(q);
  }

  // SEARCH + RENDER (Wikipedia API)
  let lastPlainText = '';
  let lastTitle = '';

  async function fetchAndRender(query) {
    setBusy(true);
    disableActions(true);
    resultsEl.innerHTML = renderSkeleton();
    try {
      const searchUrl = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=5`;
      const searchRes = await fetch(searchUrl, { headers: { 'accept': 'application/json' } });
      if (!searchRes.ok) throw new Error('Search failed');
      const searchJson = await searchRes.json();
      const first = searchJson?.pages?.[0];
      if (!first) {
        resultsEl.innerHTML = `<div class="empty">No results found for “${escapeHtml(query)}”.</div>`;
        setBusy(false);
        return;
      }
      const title = first.title;
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const sumRes = await fetch(summaryUrl, { headers: { 'accept': 'application/json' } });
      if (!sumRes.ok) throw new Error('Summary failed');
      const sumJson = await sumRes.json();
      const extract = sumJson.extract ?? '';
      const thumb = sumJson?.thumbnail?.source;
      const url = sumJson?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

      lastPlainText = String(extract);
      lastTitle = title;

      const otherLinks = (searchJson.pages || []).slice(1).map(p =>
        `<li><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a></li>`
      ).join('');

      resultsEl.innerHTML = `
        <article class="card">
          <header class="card-head">
            <h2 class="card-title">${escapeHtml(title)}</h2>
            <a class="card-source" href="${url}" target="_blank" rel="noopener">View source ↗</a>
          </header>
          <div class="card-body">
            ${thumb ? `<img class="thumb" alt="" src="${thumb}">` : ''}
            <p class="extract">${escapeHtml(extract)}</p>
          </div>
          ${otherLinks ? `<footer class="card-foot"><div class="muted">Related</div><ul class="links">${otherLinks}</ul></footer>` : ''}
        </article>
      `;

      resultsEl.focus();
      disableActions(!lastPlainText);
    } catch (err) {
      resultsEl.innerHTML = `<div class="error">Could not load results. Please try again.</div>`;
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

  // SUMMARIZE (simple extractive)
  summarizeBtn?.addEventListener('click', () => {
    if (!lastPlainText) return;
    const summary = extractiveSummary(lastPlainText, 4);
    resultsEl.innerHTML = renderGenerated('Summary', summary);
  });

  // HIGHLIGHTS (top keywords + sentences)
  highlightsBtn?.addEventListener('click', () => {
    if (!lastPlainText) return;
    const { keywords, sentences } = highlightsFromText(lastPlainText, 5, 4);
    resultsEl.innerHTML = `
      <article class="card">
        <header class="card-head">
          <h2 class="card-title">Highlights — ${escapeHtml(lastTitle || 'Result')}</h2>
        </header>
        <div class="card-body">
          <div class="muted">Key terms</div>
          <ul class="chips">${keywords.map(k => `<li class="chip small">${escapeHtml(k)}</li>`).join('')}</ul>
          <div class="muted" style="margin-top:10px">Key points</div>
          <ul class="bullets">${sentences.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>
      </article>
    `;
  });

  function renderGenerated(title, text) {
    return `
      <article class="card">
        <header class="card-head">
          <h2 class="card-title">${escapeHtml(title)} — ${escapeHtml(lastTitle || 'Result')}</h2>
        </header>
        <div class="card-body"><p class="extract">${escapeHtml(text)}</p></div>
      </article>
    `;
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
})();


