/*
 * contentScript.js is injected onto any meet.google.com page. This has different logic depending on if
 * it is running in the PWA or a normal tab. The PWA portion will redirect it to the correct meeting
 * (if not currently on a meeting). The normal tab will replace the content on the original page
 * informing the user they were redirected to the PWA.
 */

(() => {
  function isPwa() {
    return ['fullscreen', 'standalone', 'minimal-ui'].some(
      (displayMode) =>
        window.matchMedia(`(display-mode: ${displayMode})`).matches
    );
  }

  // Meeting codes follow the pattern: xxx-xxxx-xxx (3 lowercase segments separated by hyphens)
  // Also allow known paths like "new", "lookup/", and landing with query strings
  function isValidMeetingPath(path) {
    const pathPart = path.split('?')[0].split('#')[0];
    if (!pathPart) return false;
    return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(pathPart) ||
      pathPart === 'new' ||
      pathPart.startsWith('lookup/');
  }

  if (isPwa()) {
    chrome.runtime.onMessage.addListener(function (message, sender) {
      if (sender.id !== chrome.runtime.id) return;
      if (message.type !== 'REDIRECT' || !message.queryParams) return;

      const onCall = [...document.querySelectorAll('.google-material-icons')]
        .some((el) => el.textContent.trim() === 'call_end');

      if (onCall) {
        return;
      }

      const qp = message.queryParams;

      // Block protocol-relative or absolute URL patterns
      if (/^\/\/|^[a-zA-Z]+:/.test(qp)) {
        return;
      }

      // Validate that the path looks like a real meeting code
      if (!isValidMeetingPath(qp)) {
        return;
      }

      const newQueryParams = qp.includes('?')
        ? qp.includes('authuser=')
          ? qp
          : qp + '&authuser=0'
        : qp + '?authuser=0';

      const currentHref = window.location.href;
      const newHref = 'https://meet.google.com/' + newQueryParams;
      if (currentHref !== newHref) {
        window.location.href = newHref;
      }

      // Signal that the URL was opened so background can focus the PWA
      chrome.storage.local.set({
        googleMeetOpenedUrl: new Date().toISOString(),
      });

      // Ask background to close the originating tab
      chrome.runtime.sendMessage({
        type: 'CLOSE_TAB',
        originatingTabId: message.originatingTabId,
        queryParams: message.queryParams,
        source: message.source || '',
      });
    });
  } else {
    // Normal tab — listen for redirect message to replace UI
    chrome.runtime.onMessage.addListener(function (message, sender) {
      if (sender.id !== chrome.runtime.id) return;
      if (message.type === 'REDIRECT') {
        const mainContent = document.body?.children?.[0];
        if (mainContent) {
          mainContent.style.display = 'none';
        }
        const notice = document.createElement('div');
        notice.setAttribute('role', 'status');
        notice.textContent = 'Opening in Google Meet app\u2026';
        document.body.appendChild(notice);
      }
    });
  }
})();
