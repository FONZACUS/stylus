'use strict';

function createStyleInjector({compare, setStyleContent, onUpdate}) {
  const CHROME = chrome.app ? parseInt(navigator.userAgent.match(/Chrom\w+\/(?:\d+\.){2}(\d+)|$/)[1]) : NaN;
  const PREFIX = 'stylus-';
  const ORDERED_TAGS = new Set(['head', 'body', 'frameset', 'style', 'link']);
  const list = [];
  const table = new Map();
  let enabled = true;
  return {
    add,
    addMany,
    remove,
    update,
    clear,
    replaceAll,

    toggle,
    sort,

    outOfOrder,
    list,

    createStyle
  };

  function outOfOrder() {
    if (!list.length) {
      return false;
    }
    let el = list[0].el;
    if (el.parentNode !== document.documentElement) {
      return true;
    }
    let i = 0;
    while (el) {
      if (i < list.length && el === list[i].el) {
        i++;
      } else if (ORDERED_TAGS.has(el.localName)) {
        return true;
      }
      el = el.nextSibling;
    }
    return i < list.length;
  }

  function addMany(styles) {
    const pending = Promise.all(styles.map(_add));
    emitUpdate();
    return pending;
  }

  function add(style) {
    const pending = _add(style);
    emitUpdate();
    return pending;
  }

  function _add(style) {
    if (table.has(style.id)) {
      return update(style);
    }
    style.el = createStyle(style.id);
    const pending = setStyleContent(style.el, style.code, !enabled);
    table.set(style.id, style);
    const nextIndex = list.findIndex(i => compare(i, style) > 0);
    if (nextIndex < 0) {
      document.documentElement.appendChild(style.el);
      list.push(style);
    } else {
      document.documentElement.insertBefore(style.el, list[nextIndex].el);
      list.splice(nextIndex, 0, style);
    }
    return pending;
  }

  function remove(id) {
    _remove(id);
    emitUpdate();
  }

  function _remove(id) {
    const style = table.get(id);
    if (!style) return;
    table.delete(id);
    list.splice(list.indexOf(style), 1);
    style.el.remove();
  }

  function update({id, code}) {
    const style = table.get(id);
    if (style.code === code) return;
    style.code = code;
    let oldEl;
    if (CHROME < 3321) {
      oldEl = style.el;
      oldEl.id = '';
      style.el = createStyle(id);
      oldEl.parentNode.insertBefore(style.el, oldEl.nextSibling);
      style.el.disabled = !enabled;
    }
    return setStyleContent(style.el, code, !enabled)
      .then(() => oldEl && oldEl.remove());
  }

  function createStyle(id) {
    let el;
    if (document.documentElement instanceof SVGSVGElement) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    } else if (document instanceof XMLDocument) {
      el = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
    } else {
      el = document.createElement('style');
    }
    el.id = `${PREFIX}${id}`;
    el.type = 'text/css';
    el.classList.add('stylus');
    return el;
  }

  function clear() {
    for (const style of list) {
      style.el.remove();
    }
    list.length = 0;
    table.clear();
    emitUpdate();
  }

  function toggle(_enabled) {
    if (enabled === _enabled) return;
    enabled = _enabled;
    for (const style of list) {
      style.el.disabled = !enabled;
    }
  }

  function sort() {
    list.sort(compare);
    for (const style of list) {
      document.documentElement.appendChild(style.el);
      style.el.disabled = !enabled;
    }
  }

  function emitUpdate() {
    if (onUpdate) {
      onUpdate();
    }
  }

  function replaceAll(styles) {
    const added = new Set(styles.map(s => s.id));
    const removed = [];
    for (const style of list) {
      if (!added.has(style.id)) {
        removed.push(style.id);
      }
    }
    return Promise.all(styles.map(_add))
      .then(() => {
        removed.forEach(_remove);
        emitUpdate();
      });
  }
}
