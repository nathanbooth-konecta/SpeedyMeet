/*
 * background.js runs in the background on Chrome. It has access to manage the windows/tabs.
 * This will start the process to redirect the open tab into the PWA.
 */

let googleMeetWindowId;

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

// Clear stale window ID when the PWA window closes
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === googleMeetWindowId) {
    googleMeetWindowId = null;
  }
});

chrome.tabs.onUpdated.addListener((tabId, tabChangeInfo, tab) => {
  if (tab.url && isMeetUrl(tab.url) && tab.url.includes('/new')) {
    // Special handling if it's a "/new" URL
    // This allows users to send follow-up slack from the PWA
    chrome.windows.getAll(
      { populate: true, windowTypes: ['app'] },
      function (windows) {
        windows.forEach((window) => {
          if (
            window.tabs.length === 1 &&
            window.tabs[0].url.startsWith('https://meet.google.com/')
          ) {
            googleMeetWindowId = window.id;
          }
        });

        if (!googleMeetWindowId) {
          // skipping redirect since PWA isn't open
          return;
        }

        // only attempt a redirect when not the PWA
        if (tab.windowId !== googleMeetWindowId) {
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              injectImmediately: true,
              func: () => {
                window.stop();
              },
            },
            function () {
              const queryParameters = getMeetingPath(tab.url);
              const redirectMessage = {
                type: 'REDIRECT',
                queryParams: queryParameters,
                originatingTabId: tabId,
                source: 'NEW_MEETING',
              };
              // Notify the normal tab it's being redirected
              chrome.tabs.sendMessage(tabId, redirectMessage);
              // Send redirect info directly to PWA tab via message passing
              chrome.tabs.query({ windowId: googleMeetWindowId }, (tabs) => {
                if (tabs && tabs.length > 0) {
                  chrome.tabs.sendMessage(tabs[0].id, redirectMessage);
                }
              });
            }
          );
        }
      }
    );
  } else if (
    tabChangeInfo.status === 'complete' &&
    tab.url &&
    isMeetUrl(tab.url)
  ) {
    // find Google Meet PWA window id
    chrome.windows.getAll(
      { populate: true, windowTypes: ['app'] },
      function (windows) {
        windows.forEach((window) => {
          if (
            window.tabs.length === 1 &&
            window.tabs[0].url.startsWith('https://meet.google.com/')
          ) {
            googleMeetWindowId = window.id;
          }
        });

        if (!googleMeetWindowId) {
          // skipping redirect since PWA isn't open
          return;
        }

        // only attempt a redirect when not the PWA
        if (tab.windowId !== googleMeetWindowId) {
          const parameters = getMeetingPath(tab.url);
          if (parameters && !parameters.startsWith('new') && !parameters.startsWith('_meet')) {
            const redirectMessage = {
              type: 'REDIRECT',
              queryParams: parameters,
              originatingTabId: tabId,
            };
            // Notify the normal tab it's being redirected
            chrome.tabs.sendMessage(tabId, redirectMessage);
            // Send redirect info directly to PWA tab via message passing
            chrome.tabs.query({ windowId: googleMeetWindowId }, (tabs) => {
              if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, redirectMessage);
              }
            });
          }
        }
      }
    );
  }
});

// Listen for the PWA confirming it opened the URL
chrome.storage.onChanged.addListener(function (changes) {
  if (changes['googleMeetOpenedUrl']) {
    // bring Google Meet PWA into focus
    if (typeof googleMeetWindowId !== 'number') {
      return;
    }
    chrome.windows.update(googleMeetWindowId, { focused: true });
  }
});

// Handle messages from the content script to close originating tabs
chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === 'CLOSE_TAB') {
    const { originatingTabId, queryParams, source } = message;
    let timeout = 3000;
    if (source === 'NEW_MEETING') {
      timeout = 0;
    }
    setTimeout(function () {
      if (queryParams !== '' && typeof originatingTabId === 'number' && originatingTabId > 0) {
        chrome.tabs.remove(originatingTabId);
      }
    }, timeout);
  }
});
