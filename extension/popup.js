document.addEventListener('DOMContentLoaded', () => {
  const handleInput = document.getElementById('handle-input');
  const saveBtn = document.getElementById('save-btn');
  const syncBtn = document.getElementById('sync-btn');
  const newPickBtn = document.getElementById('new-pick-btn');
  const recContainer = document.getElementById('rec-container');
  const syncStatus = document.getElementById('sync-status');
  const dashboardLink = document.querySelector('.dashboard-link');

  // Load state
  chrome.storage.local.get(['handle', 'lastSync'], (data) => {
    if (data.handle) {
      handleInput.value = data.handle;
      if (dashboardLink) {
        dashboardLink.href = `https://cp-coach-gamma.vercel.app/?handle=${encodeURIComponent(data.handle)}`;
      }
      updateSyncStatus(data.lastSync);
      loadRecommendation();
    }
  });

  saveBtn.addEventListener('click', () => {
    const handle = handleInput.value.trim();
    if (handle) {
      chrome.storage.local.set({ handle }, () => {
        if (dashboardLink) {
          dashboardLink.href = `https://cp-coach-gamma.vercel.app/?handle=${encodeURIComponent(handle)}`;
        }
        saveBtn.textContent = 'Saved!';
        setTimeout(() => saveBtn.textContent = 'Save', 1500);
      });
    }
  });

  syncBtn.addEventListener('click', () => {
    const handle = handleInput.value.trim();
    if (!handle) return;
    
    // Save handle first if it changed
    chrome.storage.local.set({ handle }, () => {
      if (dashboardLink) {
        dashboardLink.href = `https://cp-coach-gamma.vercel.app/?handle=${encodeURIComponent(handle)}`;
      }
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      
      chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }, (response) => {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Now';
        
        if (chrome.runtime.lastError || !response || !response.success) {
          syncStatus.textContent = 'Sync Failed';
          syncStatus.style.color = 'var(--verdict-tle)';
        } else {
          chrome.storage.local.set({ lastSync: response.timestamp });
          updateSyncStatus(response.timestamp);
          loadRecommendation();
        }
      });
    });
  });

  newPickBtn.addEventListener('click', () => {
    newPickBtn.disabled = true;
    newPickBtn.textContent = '...';
    
    chrome.runtime.sendMessage({ type: 'GET_RECOMMENDATION', force: true }, (response) => {
      newPickBtn.disabled = false;
      newPickBtn.textContent = 'New Pick';
      
      if (response && response.success) {
        renderRecommendation(response.data);
      }
    });
  });

  function updateSyncStatus(timestamp) {
    if (!timestamp) return;
    const d = new Date(timestamp);
    syncStatus.textContent = `Synced: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    syncStatus.style.color = 'var(--text-muted)';
  }

  function loadRecommendation() {
    chrome.runtime.sendMessage({ type: 'GET_RECOMMENDATION' }, (response) => {
      if (response && response.success) {
        renderRecommendation(response.data);
      } else {
        recContainer.innerHTML = `<div class="card empty-state">Backend unreachable.</div>`;
      }
    });
  }

  function renderRecommendation(data) {
    if (!data || !data.problem) {
      recContainer.innerHTML = `<div class="card empty-state">No recommendations available. Keep practicing!</div>`;
      return;
    }
    
    const p = data.problem;
    recContainer.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="prob-id">${p.problem_id}</span>
          <span class="prob-rating">${p.rating || 'N/A'}</span>
        </div>
        <a href="${p.url}" target="_blank" class="prob-name">${p.problem_name}</a>
        <div class="prob-reason">&gt; ${p.reason}</div>
      </div>
    `;
  }
});
