globalThis.AllyShared = Object.freeze({
  count: text => Array.from(text).length,
  valid: text => typeof text === 'string' && text.trim().length > 0 && Array.from(text).length <= 100,
  split: text => [Array.from(text).slice(0, 100).join(''), Array.from(text).slice(100).join('')],
  validResult(data, original) {
    return data && data.original_text === original && Array.isArray(data.tokens) &&
      data.tokens.length > 0 && data.tokens.length <= 100 && data.tokens.every((t, i) =>
        t.index === i && typeof t.text === 'string' && t.text.length > 0 && original.includes(t.text) &&
        ((t.pictogram_id === null && t.image_url === null) ||
         (Number.isSafeInteger(t.pictogram_id) && t.pictogram_id > 0 &&
          t.image_url === `https://static.arasaac.org/pictograms/${t.pictogram_id}/${t.pictogram_id}_500.png`)));
  }
});
