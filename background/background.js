'use strict';

var backgroundWorker = workerUtil.createWorker({
  url: '/background/background-worker.js'
});

window.API_METHODS = Object.assign(window.API_METHODS || {}, {
  deleteStyle: styleManager.deleteStyle,
  editSave: styleManager.editSave,
  findStyle: styleManager.findStyle,
  getAllStyles: styleManager.getAllStyles,
  getSectionsByUrl: styleManager.getSectionsByUrl,
  getStyle: styleManager.get,
  getStylesByUrl: styleManager.getStylesByUrl,
  importStyle: styleManager.importStyle,
  importManyStyles: styleManager.importMany,
  installStyle: styleManager.installStyle,
  styleExists: styleManager.styleExists,
  toggleStyle: styleManager.toggleStyle,

  addInclusion: styleManager.addInclusion,
  removeInclusion: styleManager.removeInclusion,
  addExclusion: styleManager.addExclusion,
  removeExclusion: styleManager.removeExclusion,

  getTabUrlPrefix() {
    return this.sender.tab.url.match(/^([\w-]+:\/+[^/#]+)/)[1];
  },

  download(msg) {
    delete msg.method;
    return download(msg.url, msg);
  },
  parseCss({code}) {
    return backgroundWorker.parseMozFormat({code});
  },
  getPrefs: prefs.getAll,

  openEditor,

  updateIconBadge(count) {
    if (CHROME && CHROME < 2661 && this.sender.tab.url.startsWith(URLS.ownOrigin)) {
      updateIconBadgeForce(this.sender.tab.id, count);
    } else {
      updateIconBadge(this.sender.tab.id, count);
    }
    return true;
  },

  openURL,

  optionsCustomizeHotkeys() {
    return browser.runtime.openOptionsPage()
      .then(() => new Promise(resolve => setTimeout(resolve, 100)))
      .then(() => msg.broadcastExtension({method: 'optionsCustomizeHotkeys'}));
  },

  syncStart: sync.start,
  syncStop: sync.stop,
  syncNow: sync.syncNow,
  getSyncStatus: sync.getStatus,
  syncLogin: sync.login
});

var browserCommands, contextMenus;

msg.on(onRuntimeMessage);

navigatorUtil.onUrlChange(({tabId, frameId}, type) => {
  if (type === 'committed') {
    return;
  }
  msg.sendTab(tabId, {method: 'urlChanged'}, {frameId})
    .catch(msg.ignoreError);
});

if (FIREFOX) {
  navigatorUtil.onCommitted(webNavUsercssInstallerFF, {
    url: [
      {pathSuffix: '.user.css'},
      {pathSuffix: '.user.styl'},
    ]
  });
  navigatorUtil.onDOMContentLoaded(webNavIframeHelperFF, {
    url: [
      {urlEquals: 'about:blank'},
    ]
  });
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) =>
    contextMenus[info.menuItemId].click(info, tab));
}

if (chrome.commands) {
  chrome.commands.onCommand.addListener(command => browserCommands[command]());
}

const tabIcons = new Map();
chrome.tabs.onRemoved.addListener(tabId => tabIcons.delete(tabId));
chrome.tabs.onReplaced.addListener((added, removed) => tabIcons.delete(removed));

prefs.subscribe([
  'disableAll',
  'badgeDisabled',
  'badgeNormal',
], () => debounce(refreshIconBadgeColor));

prefs.subscribe([
  'show-badge'
], () => debounce(refreshIconBadgeText));

prefs.subscribe([
  'disableAll',
  'iconset',
], () => debounce(refreshAllIcons));

prefs.initializing.then(() => {
  refreshIconBadgeColor();
  refreshAllIconsBadgeText();
  refreshAllIcons();
});

navigatorUtil.onUrlChange(({tabId, frameId, transitionQualifiers}, type) => {
  if (type === 'committed' && !frameId) {
    tabIcons.delete(tabId);

    if (transitionQualifiers.includes('forward_back')) {
      msg.sendTab(tabId, {method: 'updateCount'}).catch(msg.ignoreError);
    }
  }
});

chrome.runtime.onInstalled.addListener(({reason}) => {
  chrome.management.getSelf(info => {
    localStorage.installType = info.installType;
  });

  if (reason !== 'update') return;
  localStorage.L10N = JSON.stringify({
    browserUIlanguage: chrome.i18n.getUILanguage(),
  });
  delete localStorage.codeMirrorThemes;
});

browserCommands = {
  openManage() {
    openURL({url: 'manage.html'});
  },
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
};

contextMenus = {
  'show-badge': {
    title: 'menuShowBadge',
    click: info => prefs.set(info.menuItemId, info.checked),
  },
  'disableAll': {
    title: 'disableAllStyles',
    click: browserCommands.styleDisableAll,
  },
  'open-manager': {
    title: 'openStylesManager',
    click: browserCommands.openManage,
  },
  'editor.contextDelete': {
    presentIf: () => !FIREFOX && prefs.get('editor.contextDelete'),
    title: 'editDeleteText',
    type: 'normal',
    contexts: ['editable'],
    documentUrlPatterns: [URLS.ownOrigin + 'edit*'],
    click: (info, tab) => {
      msg.sendTab(tab.id, {method: 'editDeleteText'}, undefined, 'extension');
    },
  }
};

if (chrome.contextMenus) {
  const createContextMenus = ids => {
    for (const id of ids) {
      let item = contextMenus[id];
      if (item.presentIf && !item.presentIf()) {
        continue;
      }
      item = Object.assign({id}, item);
      delete item.presentIf;
      item.title = chrome.i18n.getMessage(item.title);
      if (!item.type && typeof prefs.defaults[id] === 'boolean') {
        item.type = 'checkbox';
        item.checked = prefs.get(id);
      }
      if (!item.contexts) {
        item.contexts = ['browser_action'];
      }
      delete item.click;
      chrome.contextMenus.create(item, ignoreChromeError);
    }
  };

  const toggleCheckmark = CHROME >= 3172 && CHROME <= 3288 ?
    (id => chrome.contextMenus.remove(id, () => createContextMenus([id]) + ignoreChromeError())) :
    ((id, checked) => chrome.contextMenus.update(id, {checked}, ignoreChromeError));

  const togglePresence = (id, checked) => {
    if (checked) {
      createContextMenus([id]);
    } else {
      chrome.contextMenus.remove(id, ignoreChromeError);
    }
  };

  const keys = Object.keys(contextMenus);
  prefs.subscribe(keys.filter(id => typeof prefs.defaults[id] === 'boolean'), toggleCheckmark);
  prefs.subscribe(keys.filter(id => contextMenus[id].presentIf), togglePresence);
  createContextMenus(keys);
}

if (!FIREFOX) {
  setTimeout(contentScripts.injectToAllTabs, 0);
}

if (FIREFOX && browser.commands && browser.commands.update) {
  const hotkeyPrefs = Object.keys(prefs.defaults).filter(k => k.startsWith('hotkey.'));
  prefs.subscribe(hotkeyPrefs, (name, value) => {
    try {
      name = name.split('.')[1];
      if (value.trim()) {
        browser.commands.update({name, shortcut: value});
      } else {
        browser.commands.reset(name);
      }
    } catch (e) {}
  });
}

msg.broadcastTab({method: 'backgroundReady'});

function webNavUsercssInstallerFF(data) {
  const {tabId} = data;
  Promise.all([
    msg.sendTab(tabId, {method: 'ping'})
      .catch(() => false),
    getTab(tabId),
  ]).then(([pong, tab]) => {
    if (pong !== true && tab.url !== 'about:blank') {
      window.API_METHODS.openUsercssInstallPage({direct: true}, {tab});
    }
  });
}

function webNavIframeHelperFF({tabId, frameId}) {
  if (!frameId) return;
  msg.sendTab(tabId, {method: 'ping'}, {frameId})
    .catch(() => false)
    .then(pong => {
      if (pong) return;
      const files = chrome.runtime.getManifest().content_scripts[0].js;
      for (const file of files) {
        chrome.tabs.executeScript(tabId, {
          frameId,
          file,
          matchAboutBlank: true,
        }, ignoreChromeError);
      }
    });
}

function updateIconBadge(tabId, count) {
  let tabIcon = tabIcons.get(tabId);
  if (!tabIcon) tabIcons.set(tabId, (tabIcon = {}));
  if (tabIcon.count === count) {
    return;
  }
  const oldCount = tabIcon.count;
  tabIcon.count = count;
  refreshIconBadgeText(tabId, tabIcon);
  if (Boolean(oldCount) !== Boolean(count)) {
    refreshIcon(tabId, tabIcon);
  }
}

function updateIconBadgeForce(tabId, count) {
  refreshIconBadgeText(tabId, {count});
  refreshIcon(tabId, {count});
}

function refreshIconBadgeText(tabId, icon) {
  iconUtil.setBadgeText({
    text: prefs.get('show-badge') && icon.count ? String(icon.count) : '',
    tabId
  });
}

function refreshIcon(tabId, icon) {
  const disableAll = prefs.get('disableAll');
  const iconset = prefs.get('iconset') === 1 ? 'light/' : '';
  const postfix = disableAll ? 'x' : !icon.count ? 'w' : '';
  const iconType = iconset + postfix;

  if (icon.iconType === iconType) {
    return;
  }
  icon.iconType = iconset + postfix;
  const sizes = FIREFOX || CHROME >= 2883 && !VIVALDI ? [16, 32] : [19, 38];
  iconUtil.setIcon({
    path: sizes.reduce(
      (obj, size) => {
        obj[size] = `/images/icon/${iconset}${size}${postfix}.png`;
        return obj;
      },
      {}
    ),
    tabId
  });
}

function refreshIconBadgeColor() {
  const color = prefs.get(prefs.get('disableAll') ? 'badgeDisabled' : 'badgeNormal');
  iconUtil.setBadgeBackgroundColor({
    color
  });
}

function refreshAllIcons() {
  for (const [tabId, icon] of tabIcons) {
    refreshIcon(tabId, icon);
  }
  refreshIcon(null, {});
}

function refreshAllIconsBadgeText() {
  for (const [tabId, icon] of tabIcons) {
    refreshIconBadgeText(tabId, icon);
  }
}

function onRuntimeMessage(msg, sender) {
  if (msg.method !== 'invokeAPI') {
    return;
  }
  const fn = window.API_METHODS[msg.name];
  if (!fn) {
    throw new Error(`unknown API: ${msg.name}`);
  }
  const context = {msg, sender};
  return fn.apply(context, msg.args);
}

function openEditor({id}) {
  let url = '/edit.html';
  if (id) {
    url += `?id=${id}`;
  }
  if (chrome.windows && prefs.get('openEditInWindow')) {
    chrome.windows.create(Object.assign({url}, prefs.get('windowPosition')));
  } else {
    openURL({url});
  }
}
