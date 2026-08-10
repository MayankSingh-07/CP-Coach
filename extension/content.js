const BADGE_STYLES = `
  .agy-badge-container {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    position: relative;
    vertical-align: middle;
    cursor: default;
  }
  .agy-badge-dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    display: inline-block;
  }
  .agy-badge-dot.avoided {
    background-color: #f97316;
    box-shadow: 0 0 4px #f97316;
  }
  .agy-badge-dot.weak {
    background-color: #ef4444;
  }
  
  .agy-badge-tooltip {
    position: absolute;
    top: 50%;
    left: 100%;
    transform: translateY(-50%) translateX(10px);
    background-color: #141518;
    border: 1px solid #3f3f46;
    color: #a1a1aa;
    padding: 6px 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s, visibility 0.2s, transform 0.2s;
    z-index: 1000;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }
  .agy-badge-tooltip::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 100%;
    margin-top: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: transparent #3f3f46 transparent transparent;
  }
  
  .agy-badge-container:hover .agy-badge-tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateY(-50%) translateX(6px);
  }

  .agy-badge-state {
    color: #fff;
    font-weight: bold;
    margin-right: 6px;
    text-transform: uppercase;
  }
  .agy-badge-state.avoided { color: #f97316; }
  .agy-badge-state.weak { color: #ef4444; }
  }
`;

function injectStyles() {
  if (document.getElementById('agy-extension-styles')) return;
  const style = document.createElement('style');
  style.id = 'agy-extension-styles';
  style.textContent = BADGE_STYLES;
  document.head.appendChild(style);
}

function parseProblemId(href) {
  if (!href) return null;
  
  // Match /problemset/problem/1234/A
  let m = href.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
  if (m) return `${m[1]}${m[2]}`;
  
  // Match /contest/1234/problem/A
  m = href.match(/\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
  if (m) return `${m[1]}${m[2]}`;
  
  return null;
}

function injectBadges(badgeData) {
  if (!badgeData || !badgeData.problems) return;
  
  const links = document.querySelectorAll('table.problems a, table tr td:first-child a');
  const processed = new Set();
  
  links.forEach(link => {
    const pid = parseProblemId(link.getAttribute('href'));
    if (!pid || processed.has(link)) return;
    
    // Only attach to the problem name link, skip the ID link (e.g. "2247C")
    if (link.textContent.trim() === pid) return;

    // Also skip if badge already injected on this link (M-3: prevents duplicates on re-runs)
    if (link.parentNode.querySelector('.agy-badge-container')) return;
    
    const data = badgeData.problems[pid];
    if (data) {
      processed.add(link);
      
      const container = document.createElement('span');
      container.className = 'agy-badge-container';
      
      const isAvoided = data.state === 'Avoided';
      const cssClass = isAvoided ? 'avoided' : 'weak';
      
      const dot = document.createElement('div');
      dot.className = `agy-badge-dot ${cssClass}`;
      
      const stateText = isAvoided ? 'Avoided Topic' : 'Weak Topic';
      const tooltip = document.createElement('div');
      tooltip.className = 'agy-badge-tooltip';
      tooltip.innerHTML = `
        <span class="agy-badge-state ${cssClass}">${stateText}:</span>
        <span>${data.tag}</span>
      `;
      
      container.appendChild(dot);
      container.appendChild(tooltip);
      
      link.parentNode.insertBefore(container, link.nextSibling);
    }
  });
}

function extractAndSaveHandle() {
  const profileLink = document.querySelector('.lang-chooser a[href^="/profile/"], .personal-sidebar a[href^="/profile/"]');
  if (profileLink) {
    const handle = profileLink.textContent.trim();
    if (handle) {
      chrome.storage.local.get('handle', (data) => {
        if (data.handle !== handle) {
          chrome.storage.local.set({ handle: handle });
        }
      });
    }
  }
}

// M-3: Watch for DOM mutations so badges survive dynamic table updates
// (e.g. Codeforces tag/rating filter changes that rebuild the problem table rows)
let _badgeDataCache = null;
let _observer = null;

function startObserver() {
  if (_observer) return; // already watching

  const target = document.querySelector('table.problems') || document.body;
  _observer = new MutationObserver(() => {
    if (_badgeDataCache) {
      injectBadges(_badgeDataCache);
    }
  });
  _observer.observe(target, { childList: true, subtree: true });
}

function init() {
  extractAndSaveHandle();
  
  chrome.runtime.sendMessage({ type: 'GET_BADGE_DATA' }, response => {
    if (chrome.runtime.lastError) {
      console.warn("CP Coach Extension:", chrome.runtime.lastError.message);
      return;
    }
    
    if (response && response.success && response.data) {
      _badgeDataCache = response.data;
      injectStyles();
      injectBadges(response.data);
      // M-3: start watching for table changes after first inject
      startObserver();
    }
  });
}

// Run init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
