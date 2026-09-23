// Transfer loading decoration only.
// This file intentionally does not touch retarget/bake state or math.
// app.js owns the real Transfer operation; this wrapper only gives the
// browser one painted frame for the A -> B border before calling it.

function installTransferUi() {
  const button = document.getElementById('applyRetarget');
  const overlay = document.getElementById('sourceTransferProgress');
  const percent = document.getElementById('sourceTransferPercent');

  if (!button || !overlay || typeof button.onclick !== 'function') {
    requestAnimationFrame(installTransferUi);
    return;
  }

  if (button.dataset.transferUiInstalled === 'true') return;
  button.dataset.transferUiInstalled = 'true';

  const coreTransfer = button.onclick;
  let uiBusy = false;
  let hideTimer = 0;

  function resetOverlay() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }

    overlay.hidden = false;
    overlay.classList.remove('running', 'complete');

    // Restart CSS animations from A on every Transfer.
    void overlay.getBoundingClientRect();

    if (percent) percent.textContent = '…';
    overlay.classList.add('running');
    button.classList.add('is-loading');

    const label = button.querySelector('b');
    if (label) label.textContent = 'Transfiriendo…';
  }

  function finishOverlay() {
    overlay.classList.remove('running');
    overlay.classList.add('complete');

    if (percent) percent.textContent = '100%';

    button.classList.remove('is-loading');
    const label = button.querySelector('b');
    if (label) label.textContent = 'Transfer';

    hideTimer = window.setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('complete');
      hideTimer = 0;
    }, 900);
  }

  button.onclick = event => {
    if (uiBusy || button.disabled) return;

    uiBusy = true;
    resetOverlay();

    // Two RAFs guarantee that point A + the first border frame are actually
    // painted before the original synchronous Transfer begins.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          coreTransfer.call(button, event);
        } finally {
          finishOverlay();
          uiBusy = false;
        }
      });
    });
  };
}

installTransferUi();
