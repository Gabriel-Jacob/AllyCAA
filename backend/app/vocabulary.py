import json
import logging
from pathlib import Path

log = logging.getLogger('allycaa')

MAX_SYNSETS = 6
MAX_CANDIDATOS = 6


def build_index(pictograms):
    index = {}
    for p in pictograms:
        for kw in p.get('keywords', []):
            word = str(kw.get('keyword', '')).strip().lower()
            if word and word not in index:
                index[word] = p.get('_id')
    return index


def load_wordnet():
    try:
        import wn
        return wn.Wordnet('own-pt')
    except Exception:
        log.warning('Rodar scripts/instalar_openwordnet_pt.py. ')
        return None


class Vocabulary:
    def __init__(self, index, wordnet=None):
        self.index, self.wordnet = index, wordnet
        self.direction = self._detect_direction()

    @classmethod
    def load(cls, path, wordnet=True):
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if not isinstance(data, list) or not data:
            raise ValueError('O vocabulário ARASAAC deve ser uma lista não vazia.')
        return cls(build_index(data), load_wordnet() if wordnet else None)

    def find(self, word):
        key = word.strip().lower()
        return self.index.get(key) if key else None

    def _detect_direction(self):
        # No release v1.0.0 do OpenWordnet-PT, hypernyms()/hyponyms() vêm invertidos no pacote wn.
        # Calibra com 'fruta' (mais geral que 'maçã'); se inconclusivo, desativa hiperônimos.
        if self.wordnet is None:
            return None
        try:
            for s in self.wordnet.synsets('maçã'):
                if 'fruta' in {l.lower() for h in s.hyponyms() for l in h.lemmas()}:
                    return 'invertida'
                if 'fruta' in {l.lower() for h in s.hypernyms() for l in h.lemmas()}:
                    return 'normal'
        except Exception:
            log.warning('Falha ao calibrar os hiperônimos do WordNet; degrau desativado.')
        return None

    def _more_general(self, synset):
        if self.direction == 'invertida':
            return synset.hyponyms()
        if self.direction == 'normal':
            return synset.hypernyms()
        return []

    def wordnet_candidates(self, word):
        out = {'sinonimo': [], 'hiperonimo': []}
        if self.wordnet is None:
            return out
        try:
            original = word.strip().lower()
            seen = {original}
            synsets = self.wordnet.synsets(original)[:MAX_SYNSETS]
            for s in synsets:
                for lemma in s.lemmas():
                    term = lemma.strip().lower()
                    if term and term not in seen:
                        seen.add(term)
                        out['sinonimo'].append(term)
            for s in synsets:
                for h in self._more_general(s):
                    for lemma in h.lemmas():
                        term = lemma.strip().lower()
                        if term and term not in seen:
                            seen.add(term)
                            out['hiperonimo'].append(term)
        except Exception:
            log.warning('Falha na consulta local ao WordNet; candidatos indisponíveis para esta palavra.')
            return {'sinonimo': [], 'hiperonimo': []}
        return out
