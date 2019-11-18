'use strict';

CodeMirror.defineExtension('refreshOnView', function () {
  const cm = this;
  if (typeof IntersectionObserver === 'undefined') {
    cm.isRefreshed = true;
    cm.refresh();
    return;
  }
  const wrapper = cm.display.wrapper;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        cm.isRefreshed = true;
        cm.refresh();
        observer.disconnect();
      }
    }
  });
  observer.observe(wrapper);
});
