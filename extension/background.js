if (typeof importScripts === 'function') importScripts('config.js', 'shared.js');
const extensionAPI = globalThis.browser || chrome;
const running = new Map();
extensionAPI.runtime.onMessage.addListener((message, sender, reply) => {
  if (!sender.tab || !Number.isInteger(sender.tab.id) || sender.frameId !== 0) return false;
  const key = `${sender.tab.id}:${message.id}`;
  if (message.type === 'ALLY_CANCEL') { running.get(key)?.abort(); reply({ok: true}); return false; }
  if (message.type !== 'ALLY_ADAPT') return false;
  if (!AllyShared.valid(message.text) || typeof message.id !== 'string') { reply({ok: false, error: 'Selecione de 1 a 100 caracteres.'}); return false; }
  const controller = new AbortController();
  running.set(key, controller);
  const timer = setTimeout(() => controller.abort(), 50000);
  (async () => {
    try {
      const response = await fetch(`${AllyConfig.backendUrl}/api/adapt`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text: message.text}), signal: controller.signal,
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'O backend não conseguiu traduzir.');
      if (!AllyShared.validResult(data, message.text)) throw new Error('O backend retornou dados inválidos.');
      reply({ok: true, data});
    } catch (error) {
      reply({ok: false, error: error.name === 'AbortError' ? 'Operação cancelada ou tempo máximo excedido.' : error instanceof TypeError ? 'Não foi possível conectar ao backend. Verifique se ele está em execução.' : error.message});
    } finally { clearTimeout(timer); running.delete(key); }
  })();
  return true;
});
