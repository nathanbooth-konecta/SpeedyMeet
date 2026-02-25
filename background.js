/*
 * background.js runs in the background on Chrome. It has access to manage the windows/tabs.
 * This will start the process to redirect the open tab into the PWA.
 */

// Track tab IDs that we initiated redirects for, so we only close tabs we opened.
// This Set does not survive service worker restarts, but that's acceptable —
// pending redirects complete within seconds, well within the 30s idle timeout.
const pendingRedirectTabs = new Set();

function isMeetUrl(url) {
  try {
    return new URL(url).hostname === 'meet.google.com';
  } catch {
    return false;
  }
}

function getMeetingPath(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.slice(1) + parsed.search + parsed.hash;
  } catch {
    return '';
  }
}

async function findPwaWindow() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['app'] });
  for (const win of windows) {
    if (win.tabs.length === 1 && win.tabs[0].url?.startsWith('https://meet.google.com/')) {
      return win;
    }
  }
  return null;
}

async function getStoredPwaWindowId() {
  const result = await chrome.storage.session.get('pwaWindowId');
  return result.pwaWindowId ?? null;
}

async function setStoredPwaWindowId(windowId) {
  await chrome.storage.session.set({ pwaWindowId: windowId });
}

async function sendRedirectMessages(tabId, pwaWindow, message) {
  pendingRedirectTabs.add(tabId);
  // Notify the normal tab it's being redirected
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
  // Send redirect info to the PWA tab
  const pwaTabs = await chrome.tabs.query({ windowId: pwaWindow.id });
  if (pwaTabs?.length > 0) {
    chrome.tabs.sendMessage(pwaTabs[0].id, message).catch(() => {});
  }
}

async function updateBadge() {
  const pwaWindow = await findPwaWindow();
  if (pwaWindow) {
    await chrome.action.setBadgeText({ text: '' });
  } else {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#E8590C' });
  }
}

// Clear stale window ID when the PWA window closes
chrome.windows.onRemoved.addListener(async (windowId) => {
  const storedId = await getStoredPwaWindowId();
  if (windowId === storedId) {
    await setStoredPwaWindowId(null);
  }
  updateBadge();
});

// Update badge when windows are created (PWA might have been opened)
chrome.windows.onCreated.addListener(() => updateBadge());

chrome.tabs.onUpdated.addListener(async (tabId, tabChangeInfo, tab) => {
  if (!tab.url || !isMeetUrl(tab.url)) return;

  const pwaWindow = await findPwaWindow();
  if (pwaWindow) {
    await setStoredPwaWindowId(pwaWindow.id);
  }
  updateBadge();

  if (!pwaWindow || tab.windowId === pwaWindow.id) return;

  if (tab.url.includes('/new')) {
    // Special handling if it's a "/new" URL
    // This allows users to send follow-up slack from the PWA
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      injectImmediately: true,
      func: () => { window.stop(); },
    });

    const queryParameters = getMeetingPath(tab.url);
    await sendRedirectMessages(tabId, pwaWindow, {
      type: 'REDIRECT',
      queryParams: queryParameters,
      originatingTabId: tabId,
      source: 'NEW_MEETING',
    });
  } else if (tabChangeInfo.status === 'complete') {
    const parameters = getMeetingPath(tab.url);
    if (parameters && !parameters.startsWith('new') && !parameters.startsWith('_meet')) {
      await sendRedirectMessages(tabId, pwaWindow, {
        type: 'REDIRECT',
        queryParams: parameters,
        originatingTabId: tabId,
      });
    }
  }
});

// Handle messages from the content script
chrome.runtime.onMessage.addListener(function (message, sender) {
  if (sender.id !== chrome.runtime.id) return;

  if (message.type === 'FOCUS_PWA') {
    getStoredPwaWindowId().then((windowId) => {
      if (typeof windowId === 'number') {
        chrome.windows.update(windowId, { focused: true });
      }
    });
  }

  if (message.type === 'CLOSE_TAB') {
    const { originatingTabId, queryParams, source } = message;
    if (queryParams === '' || typeof originatingTabId !== 'number' || originatingTabId <= 0) {
      return;
    }
    if (!pendingRedirectTabs.has(originatingTabId)) {
      return;
    }
    pendingRedirectTabs.delete(originatingTabId);

    // setTimeout is acceptable here because the service worker just received
    // a message event, resetting the 30-second idle timer.
    const timeout = source === 'NEW_MEETING' ? 0 : 3000;
    setTimeout(() => {
      chrome.tabs.remove(originatingTabId).catch(() => {});
    }, timeout);
  }
});
