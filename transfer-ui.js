// Transfer loading decoration only.
// This file intentionally does not touch retarget/bake state or math.
// app.js owns the real Transfer operation; this wrapper only gives the
// browser one painted frame for the A -> B border before calling it.

function installTransferUi() {
  const button = document.getElementById('applyRetarget');
  const overlay = document.getElementById('sourceTransferProgress');

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

    overlay.classList.add('running');
    button.classList.add('is-loading');

    const label = button.querySelector('b');
    if (label) label.textContent = 'Transfiriendo…';
  }

  function finishOverlay() {
    overlay.classList.remove('running');
    overlay.classList.add('complete');

    button.classList.remove('is-loading');
    const label = button.querySelector('b');
    if (label) label.textContent = 'Transfer';

    hideTimer = window.setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('complete');
      hideTimer = 0;
    }, 900);
  }

  let primedByPointer = false;

  // Prime only the visual effect on pointer-down. This gives the compositor
  // time to paint A -> B before the click, without delaying the real Transfer.
  button.addEventListener('pointerdown', () => {
    if (uiBusy || button.disabled) return;
    primedByPointer = true;
    resetOverlay();
  }, { passive: true });

  // If the pointer is released without producing a click (drag/cancel),
  // clean up the primed visual state.
  document.addEventListener('pointerup', () => {
    if (!primedByPointer || uiBusy) return;
    window.setTimeout(() => {
      if (!primedByPointer || uiBusy) return;
      overlay.hidden = true;
      overlay.classList.remove('running', 'complete');
      button.classList.remove('is-loading');
      const label = button.querySelector('b');
      if (label) label.textContent = 'Transfer';
      primedByPointer = false;
    }, 0);
  }, { passive: true });

  button.onclick = event => {
    if (uiBusy || button.disabled) return;

    uiBusy = true;

    // Keyboard/programmatic activation has no pointer-down to prime the UI.
    // Start the decoration, but call the original Transfer immediately:
    // no RAF, no timeout, no artificial wait is inserted before retargeting.
    if (!primedByPointer) resetOverlay();
    primedByPointer = false;

    const startedAt = performance.now();
    try {
      coreTransfer.call(button, event);
    } finally {
      const elapsed = performance.now() - startedAt;
      console.debug(`[Transfer UI] core Transfer: ${elapsed.toFixed(1)} ms`);
      finishOverlay();
      uiBusy = false;
    }
  };
}

installTransferUi();
