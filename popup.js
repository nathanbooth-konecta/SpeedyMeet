document.querySelectorAll('a[href]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: e.currentTarget.href });
  });
});
