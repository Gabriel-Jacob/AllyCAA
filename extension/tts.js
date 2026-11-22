globalThis.AllyTTS = class {
  constructor(text, slider, status, onstate = () => {}) {
    this.onstate = onstate;
    this.speaking = false;
    this.text = text;
    this.slider = slider;
    this.status = status;
    this.generation = 0;
    this.positions = Array.from(text.matchAll(/\S+/gu), m => m.index);
    slider.min = '0';
    slider.max = String(Math.max(0, this.positions.length - 1));
    slider.step = '1';
    slider.value = '0';
    slider.disabled = !this.supported() || !this.positions.length;
    this.describe(0);
    slider.addEventListener('input', () => this.describe(Number(slider.value)));
    slider.addEventListener('change', () => this.speak(Number(slider.value)));
  }
  supported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
  describe(index) {
    const word = this.text.slice(this.positions[index] || 0).split(/\s/u)[0];
    this.slider.setAttribute('aria-valuetext', `Palavra ${index + 1} de ${this.positions.length}: ${word}`);
  }
  say(message) {
    this.status.textContent = message;
    this.status.className = message.startsWith('⚠') ? 'small' : 'sr-only';
  }
  setSpeaking(value) {
    if (this.speaking === value) return;
    this.speaking = value;
    this.onstate(value);
  }
  stop() {
    this.generation++;
    if (this.supported()) window.speechSynthesis.cancel();
    this.setSpeaking(false);
  }
  speak(index = Number(this.slider.value)) {
    this.stop();
    if (!this.supported()) { this.say('⚠ Leitura em voz alta indisponível neste navegador.'); return; }
    const generation = this.generation;
    const offset = this.positions[index] || 0;
    const utterance = new SpeechSynthesisUtterance(this.text.slice(offset));
    this.utterance = utterance; // Keep a strong reference until completion.
    utterance.lang = 'pt-BR';
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase() === 'pt-br') || voices.find(v => v.lang.toLowerCase().startsWith('pt'));
    if (voice) utterance.voice = voice;
    this.say(voice ? '▶ Lendo o texto.' : '▶ Lendo. A voz em português depende das vozes instaladas.');
    utterance.onboundary = event => {
      if (generation !== this.generation) return;
      const absolute = offset + event.charIndex;
      const at = this.positions.findLastIndex(p => p <= absolute);
      this.slider.value = String(Math.max(0, at)); this.describe(Math.max(0, at));
    };
    utterance.onend = () => { if (generation === this.generation) { this.say('✓ Leitura concluída.'); this.setSpeaking(false); } };
    utterance.onerror = event => {
      if (generation !== this.generation) return;
      this.setSpeaking(false);
      if (!['canceled', 'interrupted'].includes(event.error)) this.say('⚠ Não foi possível reproduzir a voz. Verifique as vozes do navegador.');
    };
    speechSynthesis.speak(utterance);
    this.setSpeaking(true);
  }
};
