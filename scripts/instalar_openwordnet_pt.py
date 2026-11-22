import os
import tempfile
import urllib.request

import wn

URL = "https://github.com/own-pt/openWordnet-PT/releases/download/v1.0.0/own-pt.tar.gz"


def ja_instalado() -> bool:
    try:
        wn.Wordnet("own-pt")
        return True
    except Exception:
        return False


def main():
    if ja_instalado():
        print("OpenWordnet-PT já está instalado.")
        return

    destino = os.path.join(tempfile.gettempdir(), "own-pt.tar.gz")
    print(f"Baixando {URL} ...")
    urllib.request.urlretrieve(URL, destino)

    print("Registrando no pacote wn...")
    wn.add(destino, progress_handler=None)

    if ja_instalado():
        print("OpenWordnet-PT instalado.")
    else:
        print("Algo deu errado: 'own-pt' não apareceu após a instalação.")


if __name__ == "__main__":
    main()
