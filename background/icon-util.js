'use strict';

const iconUtil = (() => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let noCanvas;
  const imageDataCache = new Map();
  const canvasReady = loadImage('/images/icon/16.png')
    .then(imageData => {
      noCanvas = imageData.data.every(b => b === 255);
    });

  return extendNative({
    setIcon,
    setBadgeText
  });

  function loadImage(url) {
    let result = imageDataCache.get(url);
    if (!result) {
      result = new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          const w = canvas.width = img.width;
          const h = canvas.height = img.height;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(ctx.getImageData(0, 0, w, h));
        };
        img.onerror = reject;
      });
      imageDataCache.set(url, result);
    }
    return result;
  }

  function setIcon(data) {
    canvasReady.then(() => {
      if (noCanvas) {
        chrome.browserAction.setIcon(data, ignoreChromeError);
        return;
      }
      const pending = [];
      data.imageData = {};
      for (const [key, url] of Object.entries(data.path)) {
        pending.push(loadImage(url)
          .then(imageData => {
            data.imageData[key] = imageData;
          }));
      }
      Promise.all(pending).then(() => {
        delete data.path;
        chrome.browserAction.setIcon(data, ignoreChromeError);
      });
    });
  }

  function setBadgeText(data) {
    try {
      chrome.browserAction.setBadgeText(data, ignoreChromeError);
    } catch (e) {
      chrome.browserAction.setBadgeText(data);
    }
  }

  function extendNative(target) {
    return new Proxy(target, {
      get: (target, prop) => {
        if (!chrome.browserAction ||
            !['setIcon', 'setBadgeBackgroundColor', 'setBadgeText'].every(name => chrome.browserAction[name])) {
          return () => {};
        }
        if (target[prop]) {
          return target[prop];
        }
        return chrome.browserAction[prop].bind(chrome.browserAction);
      }
    });
  }
})();
