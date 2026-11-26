(() => {
  'use strict';
  const loader = document.currentScript;
  const origin = loader ? new URL(loader.src, location.href).origin : null;
  if (!origin || typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const launcher = event.target instanceof Element ? event.target.closest('a[data-outbound-chat]') : null;
    if (!launcher) return;
    const target = new URL(launcher.href);
    if (target.origin !== origin || !/^\/chat\/widget\/[a-z][a-z0-9-]{0,39}\/?$/.test(target.pathname) || target.search || target.hash) return;

    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Website chat');
    Object.assign(dialog.style, {
      position: 'fixed', inset: 'auto 16px 16px auto', margin: '0', padding: '0',
      width: 'min(420px, calc(100% - 32px))', height: 'min(660px, calc(100% - 32px))',
      maxWidth: 'none', maxHeight: 'none', border: '1px solid #d3d9e3', borderRadius: '16px',
      background: '#fff', color: '#162238', overflow: 'hidden', boxShadow: '0 18px 60px #16223840',
    });
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: '44px', padding: '0 12px', font: '14px system-ui',
    });
    const newTab = document.createElement('a');
    newTab.href = target.href;
    newTab.target = '_blank';
    newTab.rel = 'noopener noreferrer';
    newTab.textContent = 'Open chat in a new tab';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.autofocus = true;
    close.style.minHeight = '32px';
    close.addEventListener('click', () => dialog.close());
    bar.append(newTab, close);

    const frame = document.createElement('iframe');
    frame.title = 'Customer conversation';
    frame.src = target.href;
    frame.referrerPolicy = 'no-referrer';
    frame.sandbox.value = 'allow-scripts allow-same-origin allow-forms';
    Object.assign(frame.style, { width: '100%', height: 'calc(100% - 44px)', display: 'block', border: '0' });
    dialog.append(bar, frame);
    dialog.addEventListener('close', () => {
      dialog.remove();
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    }, { once: true });
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch {
      dialog.remove();
      return;
    }
    event.preventDefault();
    launcher.setAttribute('aria-expanded', 'true');
  });
})();
