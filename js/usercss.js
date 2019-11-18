'use strict';

const usercss = (() => {
  const GLOBAL_METAS = {
    author: undefined,
    description: undefined,
    homepageURL: 'url',
    updateURL: 'updateUrl',
    name: undefined,
  };
  const RX_META = /\/\*!?\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i;
  const ERR_ARGS_IS_LIST = new Set(['missingMandatory', 'missingChar']);
  return {buildMeta, buildCode, assignVars};

  function buildMeta(sourceCode) {
    sourceCode = sourceCode.replace(/\r\n?/g, '\n');

    const style = {
      enabled: true,
      sourceCode,
      sections: []
    };

    const match = sourceCode.match(RX_META);
    if (!match) {
      throw new Error('can not find metadata');
    }

    return backgroundWorker.parseUsercssMeta(match[0], match.index)
      .catch(err => {
        if (err.code) {
          const args = ERR_ARGS_IS_LIST.has(err.code) ? drawList(err.args) : err.args;
          const message = chrome.i18n.getMessage(`meta_${err.code}`, args);
          if (message) {
            err.message = message;
          }
        }
        throw err;
      })
      .then(({metadata}) => {
        style.usercssData = metadata;
        for (const [key, value] of Object.entries(GLOBAL_METAS)) {
          if (metadata[key] !== undefined) {
            style[value || key] = metadata[key];
          }
        }
        return style;
      });
  }

  function drawList(items) {
    return items.map(i => i.length === 1 ? JSON.stringify(i) : i).join(', ');
  }

  function buildCode(style, allowErrors) {
    const match = style.sourceCode.match(RX_META);
    return backgroundWorker.compileUsercss(
      style.usercssData.preprocessor,
      style.sourceCode.slice(0, match.index) + style.sourceCode.slice(match.index + match[0].length),
      style.usercssData.vars
    )
      .then(({sections, errors}) => {
        if (!errors.length) errors = false;
        if (!sections.length || errors && !allowErrors) {
          throw errors;
        }
        style.sections = sections;
        return allowErrors ? {style, errors} : style;
      });
  }

  function assignVars(style, oldStyle) {
    const {usercssData: {vars}} = style;
    const {usercssData: {vars: oldVars}} = oldStyle;
    if (!vars || !oldVars) {
      return Promise.resolve();
    }
    for (const key of Object.keys(vars)) {
      if (oldVars[key] && oldVars[key].value) {
        vars[key].value = oldVars[key].value;
      }
    }
    return backgroundWorker.nullifyInvalidVars(vars)
      .then(vars => {
        style.usercssData.vars = vars;
      });
  }
})();
