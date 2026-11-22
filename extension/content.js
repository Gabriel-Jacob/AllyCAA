(() => {
  if (globalThis.__allycaaLoaded) return;
  globalThis.__allycaaLoaded = true;
  const api = globalThis.browser || chrome;
  let panelHost, pending, restore, resultHost, tts, focusBefore, confirmButton;
  const CREDITS = 'Pictogramas: Sergio Palao / ARASAAC. Governo de Aragão. CC BY-NC-SA.';
  let version = 0;
  const el = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const button = (label, handler, secondary = false) => {
    const node = el('button', label, {type: 'button'});
    if (secondary) node.className = 'secondary';
    node.addEventListener('click', handler);
    return node;
  };
  function shell(kind, title) {
    const host = el('span', undefined, {'data-allycaa': kind});
    const shadow = host.attachShadow({mode: 'open'});
    shadow.append(el('style', AllyStyle));
    const box = el('section', undefined, {class: `panel ${kind}`, role: kind === 'confirmation' ? 'dialog' : 'region', lang: 'pt-BR'});
    box.setAttribute(title ? 'aria-labelledby' : 'aria-label', title ? 'ally-title' : 'Adaptação em CAA');
    if (title) box.append(el('h2', title, {id: 'ally-title'}));
    shadow.append(box);
    host.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); });
    host.addEventListener('pointerup', event => event.stopPropagation());
    host.addEventListener('keydown', event => event.stopPropagation());
    return {host, box};
  }
  function stopPending() {
    version++;
    if (pending) { api.runtime.sendMessage({type: 'ALLY_CANCEL', id: pending}).catch(() => {}); pending = null; }
  }
  function closePanel(returnFocus = true) {
    stopPending(); AllyDOM.clearHighlight(); panelHost?.remove(); panelHost = null; confirmButton = null;
    if (returnFocus && focusBefore?.isConnected) focusBefore.focus({preventScroll: true});
  }
  function exit() {
    closePanel(false); tts?.stop(); tts = null;
    restore?.(); restore = null; resultHost = null;
    if (focusBefore?.isConnected) focusBefore.focus({preventScroll: true});
  }
  function showError(message) {
    if (restore) return;
    closePanel(false);
    const {host, box} = shell('confirmation', 'AllyCAA');
    box.append(el('p', `⚠ ${message}`, {role: 'alert'}), button('Fechar', () => closePanel()));
    document.documentElement.append(host); panelHost = host;
    box.querySelector('button').focus();
  }
  function render(data, snapshot) {
    const {host, box} = shell('result', '');
    const text = el('div', undefined, {class: 'caa-text', role: 'group', 'aria-label': 'Texto original com pictogramas'});
    for (const token of data.tokens) {
      const cell = el('span', undefined, {class: 'caa-word'});
      const slot = el('span', undefined, {class: 'caa-slot'});
      if (token.image_url) {
        const image = el('img', undefined, {alt: '', referrerpolicy: 'no-referrer'});
        image.addEventListener('error', () => image.remove(), {once: true});
        image.src = token.image_url;
        slot.append(image);
      }
      cell.append(slot, el('span', token.text, {class: 'caa-label'}));
      text.append(cell);
    }
    box.append(text);
    const status = el('p', '', {class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'});
    const slider = el('input', undefined, {id: 'ally-position', type: 'range', 'aria-describedby': 'ally-timeline-help'});
    box.append(el('label', 'Posição da leitura', {for: 'ally-position'}), slider,
      el('p', 'Clique ou use as setas para ouvir a partir de uma palavra. A barra indica posição no texto, não segundos.', {id: 'ally-timeline-help', class: 'sr-only'}));
    let toggle;
    const reader = new AllyTTS(snapshot.text, slider, status, speaking => {
      if (toggle) toggle.textContent = speaking ? '■ Interromper' : '▶ Ouvir';
    });
    toggle = button('▶ Ouvir', () => { if (reader.speaking) { reader.stop(); reader.say('■ Leitura interrompida.'); } else reader.speak(); });
    const actions = el('div', undefined, {class: 'actions'});
    actions.append(toggle, button('Voltar ao texto original', exit, true));
    box.append(actions, status);
    window.getSelection()?.removeAllRanges();
    AllyDOM.clearHighlight();
    restore = AllyDOM.apply(snapshot, host);
    tts = reader; resultHost = host;
    host.addEventListener('keydown', event => { if (event.key === 'Escape') exit(); });
    toggle.focus({preventScroll: true});
    host.scrollIntoView({block: 'nearest', behavior: 'instant'});
  }
  function preview(snapshot) {
    if (restore) return;
    closePanel(false);
    focusBefore = document.activeElement;
    const {host, box} = shell('confirmation', 'Traduzir para CAA');
    const [inside, outside] = AllyShared.split(snapshot.text);
    const text = el('p', undefined, {class: 'preview', 'aria-label': 'Texto selecionado'});
    text.append(el('span', inside, {class: 'valid'}), el('span', outside, {class: 'invalid'}));
    const count = AllyShared.count(snapshot.text);
    const valid = AllyShared.valid(snapshot.text);
    const message = valid ? '✓ Seleção válida.' : count > 100 ? '⚠ Limite excedido. Selecione até 100 caracteres.' : '⚠ Selecione um texto não vazio.';
    const status = el('p', message, {role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'});
    box.append(text, el('p', `${count} de 100 caracteres`), status);
    const actions = el('div', undefined, {class: 'actions'});
    const confirm = button('Traduzir para CAA', async () => {
      if (!AllyShared.valid(snapshot.text) || !AllyDOM.unchanged(snapshot)) { status.textContent = '⚠ A seleção foi alterada. Selecione novamente.'; confirm.disabled = true; return; }
      confirm.disabled = true;
      status.textContent = 'Aguarde. Adaptando o texto e buscando pictogramas…';
      const ticket = ++version;
      const id = crypto.randomUUID(); pending = id;
      try {
        const response = await api.runtime.sendMessage({type: 'ALLY_ADAPT', id, text: snapshot.text});
        if (ticket !== version) return;
        pending = null;
        if (!response?.ok) throw new Error(response?.error || 'O backend retornou uma resposta inválida.');
        if (!AllyShared.validResult(response.data, snapshot.text)) throw new Error('O backend retornou uma resposta inválida.');
        if (!AllyDOM.unchanged(snapshot)) throw new Error('O trecho foi alterado. Selecione novamente.');
        panelHost?.remove(); panelHost = null;
        render(response.data, snapshot);
      } catch (error) {
        if (ticket !== version) return;
        status.textContent = `⚠ ${error.message || 'Não foi possível conectar ao backend.'}`;
        if (!panelHost) showError(error.message);
        confirm.disabled = !valid;
      }
    });
    confirm.disabled = !valid;
    actions.append(confirm, button('Cancelar', () => closePanel(), true));
    box.append(actions, el('p', CREDITS, {class: 'small credits'}));
    host.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
    document.documentElement.append(host); panelHost = host; confirmButton = confirm;
    return confirm;
  }
  function selected(focus = false) {
    if (restore) return;
    try {
      const selection = window.getSelection(), snapshot = AllyDOM.capture(selection);
      const first = preview(snapshot);
      if (AllyDOM.highlight(snapshot, 100)) selection.removeAllRanges();
      if (focus) (first?.disabled ? panelHost?.shadowRoot.querySelector('button.secondary') : first)?.focus();
    }
    catch (error) { if (focus) showError(error.message); }
  }
  document.addEventListener('pointerup', event => {
    if (event.composedPath().some(n => n?.hasAttribute?.('data-allycaa'))) return;
    if (!window.getSelection()?.isCollapsed) selected();
  });
  document.addEventListener('keyup', event => {
    if (event.composedPath().some(n => n?.hasAttribute?.('data-allycaa'))) return;
    if (event.key === 'Shift' && !window.getSelection()?.isCollapsed) selected(true);
  });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'ALLY_OPEN') {
      if (restore) resultHost?.shadowRoot.querySelector('button')?.focus();
      else if (confirmButton?.isConnected && window.getSelection()?.isCollapsed) (confirmButton.disabled ? panelHost.shadowRoot.querySelector('button.secondary') : confirmButton).focus();
      else selected(true);
      respond({ok: true});
    }
  });
  window.addEventListener('pagehide', exit);
})();
