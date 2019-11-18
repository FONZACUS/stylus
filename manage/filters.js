'use strict';

const filtersSelector = {
  hide: '',
  unhide: '',
  numShown: 0,
  numTotal: 0,
};

const urlFilterParam = new URLSearchParams(location.search.replace(/^\?/, '')).get('url');
if (location.search) {
  history.replaceState(0, document.title, location.origin + location.pathname);
}

HTMLSelectElement.prototype.adjustWidth = function () {
  const option0 = this.selectedOptions[0];
  if (!option0) return;
  const parent = this.parentNode;
  const singleSelect = this.cloneNode(false);
  singleSelect.style.width = '';
  singleSelect.appendChild(option0.cloneNode(true));
  parent.replaceChild(singleSelect, this);
  const w = singleSelect.offsetWidth;
  if (w && this.style.width !== w + 'px') {
    this.style.width = w + 'px';
  }
  parent.replaceChild(this, singleSelect);
};

onDOMready().then(() => {
  $('#search').oninput = searchStyles;
  if (urlFilterParam) {
    $('#search').value = 'url:' + urlFilterParam;
  }
  $('#search-help').onclick = event => {
    event.preventDefault();
    messageBox({
      className: 'help-text',
      title: t('searchStyles'),
      contents:
        $create('ul',
          t('searchStylesHelp').split('\n').map(line =>
            $create('li', line.split(/(<.*?>)/).map((s, i, words) => {
              if (s.startsWith('<')) {
                const num = words.length;
                const className = i === num - 2 && !words[num - 1] ? '.last' : '';
                return $create('mark' + className, s.slice(1, -1));
              } else {
                return s;
              }
            })))),
      buttons: [t('confirmOK')],
    });
  };

  $$('select[id$=".invert"]').forEach(el => {
    const slave = $('#' + el.id.replace('.invert', ''));
    const slaveData = slave.dataset;
    const valueMap = new Map([
      [false, slaveData.filter],
      [true, slaveData.filterHide],
    ]);
    el.oninput = () => {
      if (!slave.checked) {
        setTimeout(() => {
          if (!slave.checked) {
            slave.checked = true;
            slave.dispatchEvent(new Event('change', {bubbles: true}));
          }
        });
      }
    };
    el.onchange = event => {
      const value = el.value === 'true';
      const filter = valueMap.get(value);
      if (slaveData.filter === filter) {
        return;
      }
      slaveData.filter = filter;
      slaveData.filterHide = valueMap.get(!value);
      debounce(filterOnChange, 0, event);
      if (document.readyState === 'complete') {
        el.adjustWidth();
      }
    };
    el.onchange({target: el});
  });

  $$('[data-filter]').forEach(el => {
    el.onchange = filterOnChange;
    if (el.closest('.hidden')) {
      el.checked = false;
    }
  });

  $('#reset-filters').onclick = event => {
    event.preventDefault();
    if (!filtersSelector.hide) {
      return;
    }
    for (const el of $$('#filters [data-filter]')) {
      let value;
      if (el.type === 'checkbox' && el.checked) {
        value = el.checked = false;
      } else if (el.value) {
        value = el.value = '';
      }
      if (value !== undefined) {
        el.lastValue = value;
        if (el.id in prefs.defaults) {
          prefs.set(el.id, false);
        }
      }
    }
    filterOnChange({forceRefilter: true});
  };

  prefs.subscribe(['manage.filters.expanded'], () => {
    const el = $('#filters');
    if (el.open) {
      $$('select', el).forEach(select => select.adjustWidth());
    }
  });

  filterOnChange({forceRefilter: true});
});

function filterOnChange({target: el, forceRefilter}) {
  const getValue = el => (el.type === 'checkbox' ? el.checked : el.value.trim());
  if (!forceRefilter) {
    const value = getValue(el);
    if (value === el.lastValue) {
      return;
    }
    el.lastValue = value;
  }
  const enabledFilters = $$('#header [data-filter]').filter(el => getValue(el));
  const buildFilter = hide =>
    (hide ? '' : '.entry.hidden') +
    [...enabledFilters.map(el =>
      el.dataset[hide ? 'filterHide' : 'filter']
        .split(/,\s*/)
        .map(s => (hide ? '.entry:not(.hidden)' : '') + s)
        .join(','))
    ].join(hide ? ',' : '');
  Object.assign(filtersSelector, {
    hide: buildFilter(true),
    unhide: buildFilter(false),
  });
  if (installed) {
    reapplyFilter().then(sorter.updateStripes);
  }
}

function filterAndAppend({entry, container}) {
  if (!container) {
    container = [entry];
    if (!filtersSelector.hide || !entry.matches(filtersSelector.hide)) {
      entry.classList.add('hidden');
    }
  }
  return reapplyFilter(container);
}

function reapplyFilter(container = installed, alreadySearched) {
  if (!alreadySearched && $('#search').value.trim()) {
    return searchStyles({immediately: true, container})
      .then(() => reapplyFilter(container, true));
  }
  let toHide = [];
  let toUnhide = [];
  if (filtersSelector.hide) {
    filterContainer({hide: false});
  } else {
    toUnhide = container;
  }
  if (toUnhide instanceof DocumentFragment) {
    installed.appendChild(toUnhide);
    return Promise.resolve();
  }
  for (const entry of toUnhide.children || toUnhide) {
    if (!entry.parentNode) {
      installed.appendChild(entry);
    }
    if (entry.classList.contains('hidden')) {
      entry.classList.remove('hidden');
    }
  }
  if (filtersSelector.hide) {
    filterContainer({hide: true});
  }
  if (!toHide.length) {
    showFiltersStats();
    return Promise.resolve();
  }
  for (const entry of toHide) {
    entry.classList.add('hidden');
  }
  if (container instanceof DocumentFragment) {
    installed.appendChild(container);
    showFiltersStats();
    return Promise.resolve();
  }
  if (toHide.length === 1 && toHide[0].parentElement !== installed) {
    installed.appendChild(toHide[0]);
  }
  showFiltersStats();
  return Promise.resolve();

  function filterContainer({hide}) {
    const selector = filtersSelector[hide ? 'hide' : 'unhide'];
    if (container.filter) {
      if (hide) {
        return;
      }
      for (const el of container) {
        (el.matches(selector) ? toUnhide : toHide).push(el);
      }
      return;
    } else if (hide) {
      toHide = $$(selector, container);
    } else {
      toUnhide = $$(selector, container);
    }
  }
}

function showFiltersStats() {
  const active = filtersSelector.hide !== '';
  $('#filters summary').classList.toggle('active', active);
  $('#reset-filters').disabled = !active;
  const numTotal = installed.children.length;
  const numHidden = installed.getElementsByClassName('entry hidden').length;
  const numShown = numTotal - numHidden;
  if (filtersSelector.numShown !== numShown ||
      filtersSelector.numTotal !== numTotal) {
    filtersSelector.numShown = numShown;
    filtersSelector.numTotal = numTotal;
    $('#filters-stats').textContent = t('filteredStyles', [numShown, numTotal]);
    document.body.classList.toggle('all-styles-hidden-by-filters',
      !numShown && numTotal && filtersSelector.hide);
  }
}

function searchStyles({immediately, container}) {
  const el = $('#search');
  const query = el.value.trim();
  if (query === el.lastValue && !immediately && !container) {
    return;
  }
  if (!immediately) {
    debounce(searchStyles, 150, {immediately: true});
    return;
  }
  el.lastValue = query;

  const entries = container && container.children || container || installed.children;
  return API.searchDB({
    query,
    ids: [...entries].map(el => el.styleId),
  }).then(ids => {
    ids = new Set(ids);
    let needsRefilter = false;
    for (const entry of entries) {
      const isMatching = ids.has(entry.styleId);
      if (entry.classList.contains('not-matching') !== !isMatching) {
        entry.classList.toggle('not-matching', !isMatching);
        needsRefilter = true;
      }
    }
    if (needsRefilter && !container) {
      filterOnChange({forceRefilter: true});
    }
    return container;
  });
}
