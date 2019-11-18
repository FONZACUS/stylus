'use strict';

function getRedirectUrlAuthFlow() {
  const browserApi = typeof browser === 'undefined' ? chrome : browser;
  return browserApi.identity.getRedirectURL();
}

function launchWebAuthFlow(details) {
  if (typeof browser === 'undefined') {
    return new Promise(resolve => {
      chrome.identity.launchWebAuthFlow(details, resolve);
    });
  }
  return browser.identity.launchWebAuthFlow(details);
}
