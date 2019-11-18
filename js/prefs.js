'use strict';

const prefs = (() => {
  const defaults = {
    'openEditInWindow': false,
    'windowPosition': {},
    'show-badge': true,
    'disableAll': false,
    'exposeIframes': false,
    'newStyleAsUsercss': false,

    'config.autosave': true,

    'popup.breadcrumbs': true,
    'popup.breadcrumbs.usePath': false,
    'popup.enabledFirst': true,
    'popup.stylesFirst': true,
    'popup.autoResort': false,
    'popup.borders': false,
    'popup.findStylesInline': true,

    'manage.onlyEnabled': false,
    'manage.onlyLocal': false,
    'manage.onlyUsercss': false,
    'manage.onlyEnabled.invert': false,
    'manage.onlyLocal.invert': false,
    'manage.onlyUsercss.invert': false,
    'manage.backup.expanded': true,
    'manage.filters.expanded': true,
    'manage.options.expanded': true,
    'manage.newUI': !navigator.appVersion.includes('Android'),
    'manage.newUI.favicons': false,
    'manage.newUI.faviconsGray': true,
    'manage.newUI.targets': 3,
    'manage.newUI.sort': 'title,asc',

    'editor.options': {},
    'editor.options.expanded': true,
    'editor.lint.expanded': true,
    'editor.lineWrapping': true,
    'editor.smartIndent': true,
    'editor.indentWithTabs': false,
    'editor.tabSize': 4,
    'editor.keyMap': navigator.appVersion.indexOf('Windows') > 0 ? 'sublime' : 'default',
    'editor.theme': 'default',
    'editor.beautify': {
      selector_separator_newline: true,
      newline_before_open_brace: false,
      newline_after_open_brace: true,
      newline_between_properties: true,
      newline_before_close_brace: true,
      newline_between_rules: false,
      preserve_newlines: true,
      end_with_newline: false,
      indent_conditional: true,
    },
    'editor.lintDelay': 300,
    'editor.linter': 'csslint',
    'editor.lintReportDelay': 500,
    'editor.matchHighlight': 'token',
    'editor.autoCloseBrackets': true,
    'editor.autocompleteOnTyping': false,
    'editor.contextDelete': contextDeleteMissing(),
    'editor.selectByTokens': true,

    'editor.appliesToLineWidget': true,
    'editor.livePreview': true,

    'editor.colorpicker': true,
    'editor.colorpicker.hexUppercase': false,
    'editor.colorpicker.hotkey': '',
    'editor.colorpicker.color': '',

    'hotkey._execute_browser_action': '',
    'hotkey.openManage': '',
    'hotkey.styleDisableAll': '',

    'sync.enabled': 'none',

    'iconset': 0,

    'badgeDisabled': '#8B0000',
    'badgeNormal': '#006666',

    'popupWidth': 246,

    'updateInterval': 24,
  };
  const values = deepCopy(defaults);

  const onChange = {
    any: new Set(),
    specific: new Map(),
  };

  const syncSet = promisify(chrome.storage.sync.set.bind(chrome.storage.sync));
  const syncGet = promisify(chrome.storage.sync.get.bind(chrome.storage.sync));

  const initializing = syncGet('settings')
    .then(result => {
      if (result.settings) {
        setAll(result.settings, true);
      }
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings || !changes.settings.newValue) {
      return;
    }
    initializing.then(() => setAll(changes.settings.newValue, true));
  });

  let timer;

  return {
    initializing,
    defaults,
    get(key, defaultValue) {
      if (key in values) {
        return values[key];
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      if (key in defaults) {
        return defaults[key];
      }
      console.warn("No default preference for '%s'", key);
    },
    getAll() {
      return deepCopy(values);
    },
    set,
    reset: key => set(key, deepCopy(defaults[key])),
    subscribe(keys, listener) {
      if (keys) {
        for (const key of keys) {
          const existing = onChange.specific.get(key);
          if (!existing) {
            onChange.specific.set(key, listener);
          } else if (existing instanceof Set) {
            existing.add(listener);
          } else {
            onChange.specific.set(key, new Set([existing, listener]));
          }
        }
      } else {
        onChange.any.add(listener);
      }
    },
    unsubscribe(keys, listener) {
      if (keys) {
        for (const key of keys) {
          const existing = onChange.specific.get(key);
          if (existing instanceof Set) {
            existing.delete(listener);
            if (!existing.size) {
              onChange.specific.delete(key);
            }
          } else if (existing) {
            onChange.specific.delete(key);
          }
        }
      } else {
        onChange.all.remove(listener);
      }
    },
  };

  function setAll(settings, synced) {
    for (const [key, value] of Object.entries(settings)) {
      set(key, value, synced);
    }
  }

  function set(key, value, synced = false) {
    const oldValue = values[key];
    switch (typeof defaults[key]) {
      case typeof value:
        break;
      case 'string':
        value = String(value);
        break;
      case 'number':
        value |= 0;
        break;
      case 'boolean':
        value = value === true || value === 'true';
        break;
    }
    if (equal(value, oldValue)) {
      return;
    }
    values[key] = value;
    emitChange(key, value);
    if (!synced && !timer) {
      timer = syncPrefsLater();
    }
    return timer;
  }

  function emitChange(key, value) {
    const specific = onChange.specific.get(key);
    if (typeof specific === 'function') {
      specific(key, value);
    } else if (specific instanceof Set) {
      for (const listener of specific.values()) {
        listener(key, value);
      }
    }
    for (const listener of onChange.any.values()) {
      listener(key, value);
    }
  }

  function syncPrefsLater() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        timer = null;
        syncSet({settings: values})
          .then(resolve, reject);
      });
    });
  }

  function equal(a, b) {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
      return a === b;
    }
    if (Object.keys(a).length !== Object.keys(b).length) {
      return false;
    }
    for (const k in a) {
      if (typeof a[k] === 'object') {
        if (!equal(a[k], b[k])) {
          return false;
        }
      } else if (a[k] !== b[k]) {
        return false;
      }
    }
    return true;
  }

  function contextDeleteMissing() {
    return /Chrome\/\d+/.test(navigator.userAgent) && (
      /Vivaldi\/[\d.]+$/.test(navigator.userAgent) ||
      /Safari\/[\d.]+$/.test(navigator.userAgent) &&
      !Array.from(navigator.plugins).some(p => p.name === 'Shockwave Flash')
    );
  }

  function deepCopy(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(deepCopy);
    }
    return Object.keys(obj).reduce((output, key) => {
      output[key] = deepCopy(obj[key]);
      return output;
    }, {});
  }
})();
