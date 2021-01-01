/* global CHROME FIREFOX URLS ignoreChromeError */// toolbox.js
/* global bgReady */// common.js
/* global msg */
'use strict';

/* exported navMan */
const navMan = (() => {
  const listeners = new Set();

  chrome.webNavigation.onCommitted.addListener(onNavigation.bind('committed'));
  chrome.webNavigation.onHistoryStateUpdated.addListener(onFakeNavigation.bind('history'));
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(onFakeNavigation.bind('hash'));

  return {
    /** @param {function(data: Object, type: ('committed'|'history'|'hash'))} fn */
    onUrlChange(fn) {
      listeners.add(fn);
    },
  };

  /** @this {string} type */
  async function onNavigation(data) {
    if (CHROME &&
        URLS.chromeProtectsNTP &&
        data.url.startsWith('https://www.google.') &&
        data.url.includes('/_/chrome/newtab?')) {
      // Modern Chrome switched to WebUI NTP so this is obsolete, but there may be exceptions
      // TODO: investigate, and maybe use a separate listener for CHROME <= ver
      const tab = await browser.tabs.get(data.tabId);
      const url = tab.pendingUrl || tab.url;
      if (url === 'chrome://newtab/') {
        data.url = url;
      }
    }
    listeners.forEach(fn => fn(data, this));
  }

  /** @this {string} type */
  function onFakeNavigation(data) {
    onNavigation.call(this, data);
    msg.sendTab(data.tabId, {method: 'urlChanged'}, {frameId: data.frameId})
      .catch(msg.ignoreError);
  }
})();

bgReady.all.then(() => {
  /*
   * Expose style version on greasyfork/sleazyfork 1) info page and 2) code page
   * Not using manifest.json as adding a content script disables the extension on update.
   */
  const urlMatches = '/scripts/\\d+[^/]*(/code)?([?#].*)?$';
  chrome.webNavigation.onCommitted.addListener(({tabId}) => {
    chrome.tabs.executeScript(tabId, {
      file: '/content/install-hook-greasyfork.js',
      runAt: 'document_start',
    });
  }, {
    url: [
      {hostEquals: 'greasyfork.org', urlMatches},
      {hostEquals: 'sleazyfork.org', urlMatches},
    ],
  });
  /*
   * FF misses some about:blank iframes so we inject our content script explicitly
   */
  if (FIREFOX) {
    chrome.webNavigation.onDOMContentLoaded.addListener(async ({tabId, frameId}) => {
      if (frameId &&
          !await msg.sendTab(tabId, {method: 'ping'}, {frameId}).catch(ignoreChromeError)) {
        for (const file of chrome.runtime.getManifest().content_scripts[0].js) {
          chrome.tabs.executeScript(tabId, {
            frameId,
            file,
            matchAboutBlank: true,
          }, ignoreChromeError);
        }
      }
    }, {
      url: [{urlEquals: 'about:blank'}],
    });
  }
});
