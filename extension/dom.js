globalThis.AllyDOM = (() => {
  const forbidden = 'input,textarea,select,option,button,[contenteditable]:not([contenteditable="false"]),script,style,noscript,svg,canvas,[data-allycaa]';
  function visible(node) {
    let el = node.parentElement;
    if (!el || el.closest(forbidden)) return false;
    while (el) {
      const style = getComputedStyle(el);
      if (el.hidden || el.inert || el.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
      el = el.parentElement;
    }
    return true;
  }
  function capture(selection) {
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) throw new Error('Selecione um trecho de texto visível da página.');
    const range = selection.getRangeAt(0).cloneRange();
    const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    if (root.getRootNode() !== document) throw new Error('Este contexto de seleção não é suportado.');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const segments = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (end <= start) continue;
      if (!visible(node)) throw new Error('Selecione somente texto visível, fora de campos e controles.');
      segments.push({node, start, end, data: node.data});
    }
    if (!segments.length) throw new Error('Seleção sem texto suportado.');
    const text = range.toString();
    if (text !== segments.map(s => s.data.slice(s.start, s.end)).join('')) throw new Error('A seleção inclui conteúdo não suportado.');
    return {range, segments, text};
  }
  function unchanged(snapshot) {
    return snapshot.segments.every(s => s.node.isConnected && s.node.data === s.data && visible(s.node)) && snapshot.range.toString() === snapshot.text;
  }
  function apply(snapshot, host) {
    if (!unchanged(snapshot)) throw new Error('O trecho foi alterado. Selecione o texto novamente.');
    const wrappers = [];
    const linkLabels = [];
    try {
      const links = new Set(snapshot.segments.flatMap(s => {
        const link = s.node.parentElement.closest('a[href]');
        return link ? [link] : [];
      }));
      for (const link of links) {
        if (!link.hasAttribute('aria-label') && !link.hasAttribute('aria-labelledby')) {
          const name = link.textContent;
          link.setAttribute('aria-label', name);
          linkLabels.push({link, name});
        }
      }
      for (const s of snapshot.segments) {
        const selected = s.node.splitText(s.start);
        selected.splitText(s.end - s.start);
        const wrapper = document.createElement('span');
        wrapper.dataset.allycaa = 'original';
        wrapper.hidden = true;
        wrapper.style.setProperty('display', 'none', 'important');
        selected.before(wrapper);
        wrapper.append(selected);
        wrappers.push(wrapper);
      }
      wrappers[0].before(host);
    } catch (error) {
      wrappers.forEach(w => w.replaceWith(...w.childNodes));
      linkLabels.forEach(({link, name}) => { if (link.getAttribute('aria-label') === name) link.removeAttribute('aria-label'); });
      throw error;
    }
    return () => {
      host.remove();
      wrappers.forEach(w => { if (w.parentNode) w.replaceWith(...w.childNodes); });
      linkLabels.forEach(({link, name}) => { if (link.getAttribute('aria-label') === name) link.removeAttribute('aria-label'); });
    };
  }
  const VALID = 'allycaa-valid', INVALID = 'allycaa-invalid';
  function clearHighlight() {
    try { globalThis.CSS?.highlights?.delete(VALID); globalThis.CSS?.highlights?.delete(INVALID); } catch {}
  }
  function highlight(snapshot, limit) {
    clearHighlight();
    if (!globalThis.CSS?.highlights || typeof globalThis.Highlight !== 'function') return false;
    const valid = [], invalid = [];
    let seen = 0;
    const add = (list, s, from, to) => {
      if (to <= from) return;
      const r = document.createRange(); r.setStart(s.node, from); r.setEnd(s.node, to); list.push(r);
    };
    for (const s of snapshot.segments) {
      const points = Array.from(s.data.slice(s.start, s.end)); 
      if (seen >= limit) add(invalid, s, s.start, s.end);
      else if (seen + points.length <= limit) add(valid, s, s.start, s.end);
      else {
        const cut = s.start + points.slice(0, limit - seen).join('').length;
        add(valid, s, s.start, cut); add(invalid, s, cut, s.end);
      }
      seen += points.length;
    }
    if (valid.length) CSS.highlights.set(VALID, new Highlight(...valid));
    if (invalid.length) CSS.highlights.set(INVALID, new Highlight(...invalid));
    return true;
  }
  return {capture, unchanged, apply, highlight, clearHighlight};
})();
