'use strict';

const CHROME = Boolean(chrome.app) && parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]);
const OPERA = Boolean(chrome.app) && parseFloat(navigator.userAgent.match(/\bOPR\/(\d+\.\d+)|$/)[1]);
const VIVALDI = Boolean(chrome.app) && navigator.userAgent.includes('Vivaldi');
let FIREFOX = !chrome.app && parseFloat(navigator.userAgent.match(/\bFirefox\/(\d+\.\d+)|$/)[1]);

const CHROME_HAS_BORDER_BUG = CHROME >= 3167 && CHROME <= 3704;

if (!CHROME && !chrome.browserAction.openPopup) {
  FIREFOX = browser.runtime.getBrowserInfo ? 51 : 50;
  Promise.resolve(FIREFOX >= 51 ? browser.runtime.getBrowserInfo() : {version: 50}).then(info => {
    FIREFOX = parseFloat(info.version);
    document.documentElement.classList.add('moz-appearance-bug', FIREFOX && FIREFOX < 54);
  });
}

const URLS = {
  ownOrigin: chrome.runtime.getURL(''),

  optionsUI: [
    chrome.runtime.getURL('options.html'),
    'chrome://extensions/?options=' + chrome.runtime.id,
  ],

  configureCommands:
    OPERA ? 'opera://settings/configureCommands'
          : 'chrome://extensions/configureCommands',

  browserWebStore:
    FIREFOX ? 'https://addons.mozilla.org/' :
    OPERA ? 'https://addons.opera.com/' :
      'https://chrome.google.com/webstore/',

  emptyTab: [
    'chrome://newtab/',
    'chrome://startpage/',
    'chrome-extension://mpognobbkildjkofajifpdfhcoklimli/components/startpage/startpage.html',
    'about:home',
    'about:newtab',
  ],

  chromeProtectsNTP: CHROME >= 3161,

  userstylesOrgJson: 'https://userstyles.org/styles/chrome/',

  supported: url => (
    url.startsWith('http') && (FIREFOX || !url.startsWith(URLS.browserWebStore)) ||
    url.startsWith('ftp') ||
    url.startsWith('file') ||
    url.startsWith(URLS.ownOrigin) ||
    !URLS.chromeProtectsNTP && url.startsWith('chrome://newtab/')
  ),
};

const IS_BG = chrome.extension.getBackgroundPage && chrome.extension.getBackgroundPage() === window;

if (!IS_BG) {
  if (FIREFOX) {
    document.documentElement.classList.add('firefox');
  } else if (OPERA) {
    document.documentElement.classList.add('opera');
  } else {
    if (VIVALDI) document.documentElement.classList.add('vivaldi');
  }
}

if (IS_BG) {
  window.API_METHODS = {};
}

function queryTabs(options = {}) {
  return new Promise(resolve =>
    chrome.tabs.query(options, tabs =>
      resolve(tabs)));
}

function getTab(id) {
  return new Promise(resolve =>
    chrome.tabs.get(id, tab =>
      !chrome.runtime.lastError && resolve(tab)));
}

function getOwnTab() {
  return new Promise(resolve =>
    chrome.tabs.getCurrent(tab => resolve(tab)));
}

function getActiveTab() {
  return queryTabs({currentWindow: true, active: true})
    .then(tabs => tabs[0]);
}

function getTabRealURL(tab) {
  return new Promise(resolve => {
    if (tab.url !== 'chrome://newtab/' || URLS.chromeProtectsNTP) {
      resolve(tab.url);
    } else {
      chrome.webNavigation.getFrame({tabId: tab.id, frameId: 0, processId: -1}, frame => {
        resolve(frame && frame.url || '');
      });
    }
  });
}

function onTabReady(tabOrId) {
  let tabId, tab;
  if (Number.isInteger(tabOrId)) {
    tabId = tabOrId;
  } else {
    tab = tabOrId;
    tabId = tab && tab.id;
  }
  if (!tab) {
    return getTab(tabId).then(onTabReady);
  }
  if (tab.status === 'complete') {
    if (!FIREFOX || tab.url !== 'about:blank') {
      return Promise.resolve(tab);
    } else {
      return new Promise(resolve => {
        chrome.webNavigation.getFrame({tabId, frameId: 0}, frame => {
          ignoreChromeError();
          if (frame) {
            onTabReady(tab).then(resolve);
          } else {
            setTimeout(() => onTabReady(tabId).then(resolve));
          }
        });
      });
    }
  }
  return new Promise((resolve, reject) => {
    chrome.webNavigation.onCommitted.addListener(onCommitted);
    chrome.webNavigation.onErrorOccurred.addListener(onErrorOccurred);
    chrome.tabs.onRemoved.addListener(onTabRemoved);
    chrome.tabs.onReplaced.addListener(onTabReplaced);
    function onCommitted(info) {
      if (info.tabId !== tabId) return;
      unregister();
      getTab(tab.id).then(resolve);
    }
    function onErrorOccurred(info) {
      if (info.tabId !== tabId) return;
      unregister();
      reject();
    }
    function onTabRemoved(removedTabId) {
      if (removedTabId !== tabId) return;
      unregister();
      reject();
    }
    function onTabReplaced(addedTabId, removedTabId) {
      onTabRemoved(removedTabId);
    }
    function unregister() {
      chrome.webNavigation.onCommitted.removeListener(onCommitted);
      chrome.webNavigation.onErrorOccurred.removeListener(onErrorOccurred);
      chrome.tabs.onRemoved.removeListener(onTabRemoved);
      chrome.tabs.onReplaced.removeListener(onTabReplaced);
    }
  });
}

function openURL({
  url = arguments[0],
  index,
  active,
  currentWindow = true,
}) {
  url = url.includes('://') ? url : chrome.runtime.getURL(url);
  url = url.replace(/^(opera|vivaldi)/, 'chrome');
  const urlQuery =
    url.startsWith('moz-extension') ||
    url.startsWith('chrome:') ?
      undefined :
    FIREFOX && url.includes('%2F') ?
      url.replace(/%2F.*/, '*').replace(/#.*/, '') :
      url.replace(/#.*/, '');

  return queryTabs({url: urlQuery, currentWindow}).then(maybeSwitch);

  function maybeSwitch(tabs = []) {
    const urlWithSlash = url + '/';
    const urlFF = FIREFOX && url.replace(/%2F/g, '/');
    const tab = tabs.find(({url: u}) => u === url || u === urlFF || u === urlWithSlash);
    if (!tab) {
      return getActiveTab().then(maybeReplace);
    }
    if (index !== undefined && tab.index !== index) {
      chrome.tabs.move(tab.id, {index});
    }
    return activateTab(tab);
  }

  function maybeReplace(tab) {
    const chromeInIncognito = tab && tab.incognito && url.startsWith('chrome');
    const emptyTab = tab && URLS.emptyTab.includes(tab.url);
    if (emptyTab && !chromeInIncognito) {
      return new Promise(resolve =>
        chrome.tabs.update({url}, resolve));
    }
    const options = {url, index, active};
    if (tab && (!FIREFOX || FIREFOX >= 57 && chrome.windows) && !chromeInIncognito) {
      options.openerTabId = tab.id;
    }
    return new Promise(resolve =>
      chrome.tabs.create(options, resolve));
  }
}

function activateTab(tab) {
  return Promise.all([
    new Promise(resolve => {
      chrome.tabs.update(tab.id, {active: true}, resolve);
    }),
    chrome.windows && new Promise(resolve => {
      chrome.windows.update(tab.windowId, {focused: true}, resolve);
    }),
  ]).then(([tab]) => tab);
}

function stringAsRegExp(s, flags) {
  return new RegExp(s.replace(/[{}()[\]\\.+*?^$|]/g, '\\$&'), flags);
}

function ignoreChromeError() {
  chrome.runtime.lastError;
}

function getStyleWithNoCode(style) {
  const stripped = deepCopy(style);
  for (const section of stripped.sections) section.code = null;
  stripped.sourceCode = null;
  return stripped;
}

function tryCatch(func, ...args) {
  try {
    return func(...args);
  } catch (e) {}
}

function tryRegExp(regexp, flags) {
  try {
    return new RegExp(regexp, flags);
  } catch (e) {}
}

function tryJSONparse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {}
}

const debounce = Object.assign((fn, delay, ...args) => {
  clearTimeout(debounce.timers.get(fn));
  debounce.timers.set(fn, setTimeout(debounce.run, delay, fn, ...args));
}, {
  timers: new Map(),
  run(fn, ...args) {
    debounce.timers.delete(fn);
    fn(...args);
  },
  unregister(fn) {
    clearTimeout(debounce.timers.get(fn));
    debounce.timers.delete(fn);
  },
});

function deepCopy(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    const copy = [];
    for (const v of obj) {
      copy.push(!v || typeof v !== 'object' ? v : deepCopy(v));
    }
    return copy;
  }
  const copy = {};
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  for (const k in obj) {
    if (!hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    copy[k] = !v || typeof v !== 'object' ? v : deepCopy(v);
  }
  return copy;
}

function deepEqual(a, b, ignoredKeys) {
  if (!a || !b) return a === b;
  const type = typeof a;
  if (type !== typeof b) return false;
  if (type !== 'object') return a === b;
  if (Array.isArray(a)) {
    return Array.isArray(b) &&
           a.length === b.length &&
           a.every((v, i) => deepEqual(v, b[i], ignoredKeys));
  }
  for (const key in a) {
    if (!Object.hasOwnProperty.call(a, key) ||
        ignoredKeys && ignoredKeys.includes(key)) continue;
    if (!Object.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key], ignoredKeys)) return false;
  }
  for (const key in b) {
    if (!Object.hasOwnProperty.call(b, key) ||
        ignoredKeys && ignoredKeys.includes(key)) continue;
    if (!Object.hasOwnProperty.call(a, key)) return false;
  }
  return true;
}

function sessionStorageHash(name) {
  return {
    name,
    value: tryCatch(JSON.parse, sessionStorage[name]) || {},
    set(k, v) {
      this.value[k] = v;
      this.updateStorage();
    },
    unset(k) {
      delete this.value[k];
      this.updateStorage();
    },
    updateStorage() {
      sessionStorage[this.name] = JSON.stringify(this.value);
    }
  };
}

function download(url, {
  method = 'GET',
  body,
  responseType = 'text',
  requiredStatusCode = 200,
  timeout = 10e3,
  headers = {
    'Content-type': 'application/x-www-form-urlencoded',
  },
} = {}) {
  const queryPos = url.indexOf('?');
  if (queryPos > 0 && body === undefined) {
    method = 'POST';
    body = url.slice(queryPos);
    url = url.slice(0, queryPos);
  }
  const usoVars = [];

  return new Promise((resolve, reject) => {
    const u = new URL(collapseUsoVars(url));
    if (u.protocol === 'file:' && FIREFOX) {
      const timer = setTimeout(reject, timeout, new Error('Timeout fetching ' + u.href));
      fetch(u.href, {mode: 'same-origin'})
        .then(r => {
          clearTimeout(timer);
          return r.status === 200 ? r.text() : Promise.reject(r.status);
        })
        .catch(reject)
        .then(resolve);
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.timeout = timeout;
    xhr.onloadend = event => {
      if (event.type !== 'error' && (
          xhr.status === requiredStatusCode || !requiredStatusCode ||
          u.protocol === 'file:')) {
        resolve(expandUsoVars(xhr.response));
      } else {
        reject(xhr.status);
      }
    };
    xhr.onerror = xhr.onloadend;
    xhr.responseType = responseType;
    xhr.open(method, u.href, true);
    for (const key in headers) {
      xhr.setRequestHeader(key, headers[key]);
    }
    xhr.send(body);
  });

  function collapseUsoVars(url) {
    if (queryPos < 0 ||
        url.length < 2000 ||
        !url.startsWith(URLS.userstylesOrgJson) ||
        !/^get$/i.test(method)) {
      return url;
    }
    const params = new URLSearchParams(url.slice(queryPos + 1));
    for (const [k, v] of params.entries()) {
      if (v.length < 10 || v.startsWith('ik-')) continue;
      usoVars.push(v);
      params.set(k, `\x01${usoVars.length}\x02`);
    }
    return url.slice(0, queryPos + 1) + params.toString();
  }

  function expandUsoVars(response) {
    if (!usoVars.length || !response) return response;
    const isText = typeof response === 'string';
    const json = isText && tryJSONparse(response) || response;
    json.updateUrl = url;
    for (const section of json.sections || []) {
      const {code} = section;
      if (code.includes('\x01')) {
        section.code = code.replace(/\x01(\d+)\x02/g, (_, num) => usoVars[num - 1] || '');
      }
    }
    return isText ? JSON.stringify(json) : json;
  }
}

function closeCurrentTab() {
  getOwnTab().then(tab => {
    if (tab) {
      chrome.tabs.remove(tab.id);
    }
  });
}

function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1);
}
