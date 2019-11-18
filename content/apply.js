'use strict';

const APPLY = (() => {
  const CHROME = chrome.app ? parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]) : NaN;
  const STYLE_VIA_API = !chrome.app && document instanceof XMLDocument;
  const IS_OWN_PAGE = location.protocol.endsWith('-extension:');
  const setStyleContent = createSetStyleContent();
  const styleInjector = createStyleInjector({
    compare: (a, b) => a.id - b.id,
    setStyleContent,
    onUpdate: onInjectorUpdate
  });
  const docRootObserver = createDocRootObserver({
    onChange: () => {
      if (styleInjector.outOfOrder()) {
        styleInjector.sort();
        return true;
      }
    }
  });
  const docRewriteObserver = createDocRewriteObserver({
    onChange: () => {
      docRootObserver.evade(styleInjector.sort);
    }
  });
  const initializing = init();

  msg.onTab(applyOnMessage);

  if (!IS_OWN_PAGE) {
    window.dispatchEvent(new CustomEvent(chrome.runtime.id, {
      detail: pageObject({method: 'orphan'})
    }));
    window.addEventListener(chrome.runtime.id, orphanCheck, true);
  }

  let parentDomain;

  prefs.subscribe(['disableAll'], (key, value) => doDisableAll(value));
  if (window !== parent) {
    prefs.subscribe(['exposeIframes'], updateExposeIframes);
  }

  function onInjectorUpdate() {
    if (!IS_OWN_PAGE && styleInjector.list.length) {
      docRewriteObserver.start();
      docRootObserver.start();
    } else {
      docRewriteObserver.stop();
      docRootObserver.stop();
    }
    updateCount();
    updateExposeIframes();
  }

  function init() {
    if (STYLE_VIA_API) {
      return API.styleViaAPI({method: 'styleApply'});
    }
    return API.getSectionsByUrl(getMatchUrl())
      .then(result =>
        applyStyles(result)
          .then(() => {
            if (styleInjector.list.some(s => s.code.includes('transition'))) {
              applyTransitionPatch();
            }
          })
      );
  }

  function pageObject(target) {
    const obj = new window.Object();
    Object.assign(obj, target);
    return obj;
  }

  function createSetStyleContent() {
    const EVENT_NAME = chrome.runtime.id;
    let ready;
    return (el, content, disabled) =>
      checkPageScript().then(ok => {
        if (!ok) {
          el.textContent = content;
          el.disabled = disabled;
        } else {
          const detail = pageObject({
            method: 'setStyleContent',
            id: el.id,
            content,
            disabled
          });
          window.dispatchEvent(new CustomEvent(EVENT_NAME, {detail}));
        }
      });

    function checkPageScript() {
      if (!ready) {
        ready = CHROME || IS_OWN_PAGE || Event.prototype.getPreventDefault ?
          Promise.resolve(false) : injectPageScript();
      }
      return ready;
    }

    function injectPageScript() {
      const scriptContent = EVENT_NAME => {
        document.currentScript.remove();
        const available = checkStyleApplied();
        if (available) {
          window.addEventListener(EVENT_NAME, function handler(e) {
            const {method, id, content, disabled} = e.detail;
            if (method === 'setStyleContent') {
              const el = document.getElementById(id);
              if (!el) {
                return;
              }
              el.textContent = content;
              el.disabled = disabled;
            } else if (method === 'orphan') {
              window.removeEventListener(EVENT_NAME, handler);
            }
          }, true);
        }
        window.dispatchEvent(new CustomEvent(EVENT_NAME, {detail: {
          method: 'init',
          available
        }}));

        function checkStyleApplied() {
          const style = document.createElement('style');
          document.documentElement.appendChild(style);
          const applied = Boolean(style.sheet);
          style.remove();
          return applied;
        }
      };
      const code = `(${scriptContent})(${JSON.stringify(EVENT_NAME)})`;
      const script = document.createElementNS('http://www.w3.org/1999/xhtml', 'script');
      const {resolve, promise} = deferred();
      script.text = code;
      script.onerror = resolveFalse;
      window.addEventListener('error', resolveFalse);
      window.addEventListener(EVENT_NAME, handleInit);
      (document.head || document.documentElement).appendChild(script);
      resolveFalse();
      return promise.then(result => {
        script.remove();
        window.removeEventListener(EVENT_NAME, handleInit);
        window.removeEventListener('error', resolveFalse);
        return result;
      });

      function resolveFalse() {
        resolve(false);
      }

      function handleInit(e) {
        if (e.detail.method === 'init') {
          resolve(e.detail.available);
        }
      }
    }
  }

  function deferred() {
    const o = {};
    o.promise = new Promise((resolve, reject) => {
      o.resolve = resolve;
      o.reject = reject;
    });
    return o;
  }

  function getMatchUrl() {
    var matchUrl = location.href;
    if (!matchUrl.match(/^(http|file|chrome|ftp)/)) {
      try {
        if (window !== parent) {
          matchUrl = parent.location.href;
        }
      } catch (e) {}
    }
    return matchUrl;
  }

  function applyOnMessage(request) {
    if (request.method === 'ping') {
      return true;
    }
    if (STYLE_VIA_API) {
      if (request.method === 'urlChanged') {
        request.method = 'styleReplaceAll';
      }
      API.styleViaAPI(request);
      return;
    }

    switch (request.method) {
      case 'styleDeleted':
        styleInjector.remove(request.style.id);
        break;

      case 'styleUpdated':
        if (request.style.enabled) {
          API.getSectionsByUrl(getMatchUrl(), request.style.id)
            .then(sections => {
              if (!sections[request.style.id]) {
                styleInjector.remove(request.style.id);
              } else {
                applyStyles(sections);
              }
            });
        } else {
          styleInjector.remove(request.style.id);
        }
        break;

      case 'styleAdded':
        if (request.style.enabled) {
          API.getSectionsByUrl(getMatchUrl(), request.style.id)
            .then(applyStyles);
        }
        break;

      case 'urlChanged':
        API.getSectionsByUrl(getMatchUrl())
          .then(replaceAll);
        break;

      case 'backgroundReady':
        initializing
          .catch(err => {
            if (msg.RX_NO_RECEIVER.test(err.message)) {
              return init();
            }
          })
          .catch(console.error);
        break;

      case 'updateCount':
        updateCount();
        break;
    }
  }

  function doDisableAll(disableAll) {
    if (STYLE_VIA_API) {
      API.styleViaAPI({method: 'prefChanged', prefs: {disableAll}});
    } else {
      styleInjector.toggle(!disableAll);
    }
  }

  function fetchParentDomain() {
    if (parentDomain) {
      return Promise.resolve();
    }
    return API.getTabUrlPrefix()
      .then(newDomain => {
        parentDomain = newDomain;
      });
  }

  function updateExposeIframes() {
    if (!prefs.get('exposeIframes') || window === parent || !styleInjector.list.length) {
      document.documentElement.removeAttribute('stylus-iframe');
    } else {
      fetchParentDomain().then(() => {
        document.documentElement.setAttribute('stylus-iframe', parentDomain);
      });
    }
  }

  function updateCount() {
    if (window !== parent) {
      return;
    }
    if (/^\w+?-extension:\/\/.+(popup|options)\.html$/.test(location.href)) {
      return;
    }
    if (STYLE_VIA_API) {
      API.styleViaAPI({method: 'updateCount'}).catch(msg.ignoreError);
      return;
    }
    msg.send({
      method: 'invokeAPI',
      name: 'updateIconBadge',
      args: [styleInjector.list.length]
    }).catch(console.error);
  }

  function rootReady() {
    if (document.documentElement) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      new MutationObserver((mutations, observer) => {
        if (document.documentElement) {
          observer.disconnect();
          resolve();
        }
      }).observe(document, {childList: true});
    });
  }

  function applyStyles(sections) {
    const styles = Object.values(sections);
    if (!styles.length) {
      return Promise.resolve();
    }
    return rootReady().then(() =>
      docRootObserver.evade(() =>
        styleInjector.addMany(
          styles.map(s => ({id: s.id, code: s.code.join('')}))
        )
      )
    );
  }

  function replaceAll(newStyles) {
    styleInjector.replaceAll(
      Object.values(newStyles)
        .map(s => ({id: s.id, code: s.code.join('')}))
    );
  }

  function applyTransitionPatch() {
    const el = styleInjector.createStyle('transition-patch');
    document.documentElement.appendChild(el);
    setStyleContent(el, `
      :root:not(#\\0):not(#\\0) * {
        transition: none !important;
      }
    `)
      .then(afterPaint)
      .then(() => {
        el.remove();
      });
  }

  function afterPaint() {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        setTimeout(resolve);
      });
    });
  }

  function orphanCheck(e) {
    if (e && e.detail.method !== 'orphan') {
      return;
    }
    if (chrome.i18n && chrome.i18n.getUILanguage()) {
      return true;
    }
    styleInjector.clear();
    window.removeEventListener(chrome.runtime.id, orphanCheck, true);
    try {
      msg.off(applyOnMessage);
    } catch (e) {}
  }

  function createDocRewriteObserver({onChange}) {
    let root;
    let observing = false;
    let timer;
    const observer = new MutationObserver(check);
    return {start, stop};

    function start() {
      if (observing) return;
      root = document.documentElement;
      timer = setTimeout(check);
      observer.observe(document, {childList: true});
      observing = true;
    }

    function stop() {
      if (!observing) return;
      clearTimeout(timer);
      observer.disconnect();
      observing = false;
    }

    function check() {
      if (root !== document.documentElement) {
        root = document.documentElement;
        onChange();
      }
    }
  }

  function createDocRootObserver({onChange}) {
    let digest = 0;
    let lastCalledTime = NaN;
    let observing = false;
    const observer = new MutationObserver(() => {
      if (digest) {
        if (performance.now() - lastCalledTime > 1000) {
          digest = 0;
        } else if (digest > 5) {
          throw new Error('The page keeps generating mutations. Skip the event.');
        }
      }
      if (onChange()) {
        digest++;
        lastCalledTime = performance.now();
      }
    });
    return {start, stop, evade};

    function start() {
      if (observing) return;
      observer.observe(document.documentElement, {childList: true});
      observing = true;
    }

    function stop() {
      if (!observing) return;
      observer.takeRecords();
      observer.disconnect();
      observing = false;
    }

    function evade(fn) {
      if (!observing) {
        return fn();
      }
      stop();
      const r = fn();
      start();
      return r;
    }
  }
})();
