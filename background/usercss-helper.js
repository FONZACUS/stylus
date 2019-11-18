'use strict';

(() => {
  API_METHODS.installUsercss = installUsercss;
  API_METHODS.editSaveUsercss = editSaveUsercss;
  API_METHODS.configUsercssVars = configUsercssVars;

  API_METHODS.buildUsercss = build;
  API_METHODS.openUsercssInstallPage = install;

  API_METHODS.findUsercss = find;

  const TEMP_CODE_PREFIX = 'tempUsercssCode';
  const TEMP_CODE_CLEANUP_DELAY = 60e3;
  let tempCodeLastWriteDate = 0;
  if (FIREFOX) {
    setTimeout(function poll() {
      if (Date.now() - tempCodeLastWriteDate < TEMP_CODE_CLEANUP_DELAY) {
        setTimeout(poll, TEMP_CODE_CLEANUP_DELAY);
        return;
      }
      chrome.storage.local.get(null, storage => {
        const leftovers = [];
        for (const key in storage) {
          if (key.startsWith(TEMP_CODE_PREFIX)) {
            leftovers.push(key);
          }
        }
        if (leftovers.length) {
          chrome.storage.local.remove(leftovers);
        }
      });
    }, TEMP_CODE_CLEANUP_DELAY);
  }

  function buildMeta(style) {
    if (style.usercssData) {
      return Promise.resolve(style);
    }

    const {sourceCode} = style;
    delete style.sourceCode;

    return usercss.buildMeta(sourceCode)
      .then(newStyle => Object.assign(newStyle, style));
  }

  function assignVars(style) {
    return find(style)
      .then(dup => {
        if (dup) {
          style.id = dup.id;
          return usercss.assignVars(style, dup)
            .then(() => style);
        }
        return style;
      });
  }

  function build({
    styleId,
    sourceCode,
    checkDup,
    metaOnly,
    vars,
    assignVars = false,
  }) {
    return usercss.buildMeta(sourceCode)
      .then(style => {
        const findDup = checkDup || assignVars ?
          find(styleId ? {id: styleId} : style) : Promise.resolve();
        return Promise.all([
          metaOnly ? style : doBuild(style, findDup),
          findDup
        ]);
      })
      .then(([style, dup]) => ({style, dup}));

    function doBuild(style, findDup) {
      if (vars || assignVars) {
        const getOld = vars ? Promise.resolve({usercssData: {vars}}) : findDup;
        return getOld
          .then(oldStyle => usercss.assignVars(style, oldStyle))
          .then(() => usercss.buildCode(style));
      }
      return usercss.buildCode(style);
    }
  }

  function parse(style) {
    return buildMeta(style)
      .then(buildMeta)
      .then(assignVars)
      .then(usercss.buildCode);
  }

  function installUsercss(style) {
    return parse(style)
      .then(styleManager.installStyle);
  }

  function editSaveUsercss(style) {
    return parse(style)
      .then(styleManager.editSave);
  }

  function configUsercssVars(id, vars) {
    return styleManager.get(id)
      .then(style => {
        const newStyle = deepCopy(style);
        newStyle.usercssData.vars = vars;
        return usercss.buildCode(newStyle);
      })
      .then(style => styleManager.installStyle(style, 'config'))
      .then(style => style.usercssData.vars);
  }

  function find(styleOrData) {
    if (styleOrData.id) {
      return styleManager.get(styleOrData.id);
    }
    const {name, namespace} = styleOrData.usercssData || styleOrData;
    return styleManager.getAllStyles().then(styleList => {
      for (const dup of styleList) {
        const data = dup.usercssData;
        if (!data) continue;
        if (data.name === name &&
            data.namespace === namespace) {
          return dup;
        }
      }
    });
  }

  function install({url, direct, downloaded, tab}, sender = this.sender) {
    tab = tab !== undefined ? tab : sender.tab;
    url = url || tab.url;
    if (direct && !downloaded) {
      prefetchCodeForInstallation(tab.id, url);
    }
    return openURL({
      url: '/install-usercss.html' +
        '?updateUrl=' + encodeURIComponent(url) +
        '&tabId=' + tab.id +
        (direct ? '&direct=yes' : ''),
      index: tab.index + 1,
      openerTabId: tab.id,
      currentWindow: null,
    });
  }

  function prefetchCodeForInstallation(tabId, url) {
    const key = TEMP_CODE_PREFIX + tabId;
    tempCodeLastWriteDate = Date.now();
    Promise.all([
      download(url),
      chromeLocal.setValue(key, {loading: true}),
    ]).then(([code]) => {
      chromeLocal.setValue(key, code);
      setTimeout(() => chromeLocal.remove(key), TEMP_CODE_CLEANUP_DELAY);
    });
  }
})();
