const API_BASE = 'http://127.0.0.1:8000/api/v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Keep track of ongoing requests to prevent duplicates
const pendingRequests = new Map();

async function fetchWithCache(key, fetchFn, force = false) {
  if (!force) {
    const data = await chrome.storage.local.get(key);
    if (data[key] && data[key].timestamp && (Date.now() - data[key].timestamp < CACHE_TTL_MS)) {
      return data[key].value;
    }
  }

  // Deduplicate inflight requests
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const promise = (async () => {
    try {
      const result = await fetchFn();
      await chrome.storage.local.set({
        [key]: {
          value: result,
          timestamp: Date.now()
        }
      });
      return result;
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, promise);
  return promise;
}

async function getBadgeData(handle, force = false) {
  if (!handle) return { problems: {} };
  return fetchWithCache(`badge_${handle}`, async () => {
    const res = await fetch(`${API_BASE}/badge-data/${handle}`);
    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    return res.json();
  }, force);
}

async function getRecommendation(handle, force = false) {
  if (!handle) return { problem: null };
  return fetchWithCache(`recommend_${handle}`, async () => {
    const res = await fetch(`${API_BASE}/recommend/${handle}`);
    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    return res.json();
  }, force);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_BADGE_DATA') {
    chrome.storage.local.get('handle', async (data) => {
      try {
        const badgeData = await getBadgeData(data.handle, false);
        sendResponse({ success: true, data: badgeData });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true; // Keep channel open for async response
  }
  
  if (request.type === 'GET_RECOMMENDATION') {
    chrome.storage.local.get('handle', async (data) => {
      try {
        const recData = await getRecommendation(data.handle, request.force);
        sendResponse({ success: true, data: recData });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }
  
  if (request.type === 'FORCE_SYNC') {
    chrome.storage.local.get('handle', async (data) => {
      try {
        await getBadgeData(data.handle, true);
        await getRecommendation(data.handle, true);
        sendResponse({ success: true, timestamp: Date.now() });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }
});
