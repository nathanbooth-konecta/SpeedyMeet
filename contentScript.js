/*
 * contentScript.js is injected onto any meet.google.com page. This has different logic depending on if
 * it is running in the PWA or a normal tab. The PWA portion will redirect it to the correct meeting
 * (if not currently on a meeting). The normal tab will replace the content on the original page
 * informing the user they were redirected to the PWA.
 */

(() => {
  if (isPwa()) {
    chrome.runtime.onMessage.addListener(function (message) {
      if (message.type === 'REDIRECT' && message.queryParams) {
        const icons = document.getElementsByClassName('google-material-icons');
        let onCall = false;
        for (const i in icons) {
          if (icons[i].outerText === 'call_end') {
            onCall = true;
          }
        }

        if (onCall) {
          return;
        }

        const qp = message.queryParams;

        // Validate that qp doesn't contain protocol-relative or absolute URL patterns
        if (/^\/\/|^[a-zA-Z]+:/.test(qp)) {
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
      }
    });
  } else {
    // Normal tab — listen for redirect message to replace UI
    chrome.runtime.onMessage.addListener(function (message) {
      if (message.type === 'REDIRECT') {
        document.body.childNodes[1].style.display = 'none';
        const textnode = document.createTextNode('Opening in Google Meet app');
        document.body.appendChild(textnode);
      }
    });
  }
})();

function isPwa() {
  return ['fullscreen', 'standalone', 'minimal-ui'].some(
    (displayMode) =>
      window.matchMedia('(display-mode: ' + displayMode + ')').matches
  );
}
