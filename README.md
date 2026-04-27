# Jira Time Logger Firefox Extension

Un semplice plugin Firefox per catturare un ticket Jira aperto e salvare un log di tempo esterno in un file CSV.

## Installazione

1. Copia `hosts.template.json` in `hosts.json` e aggiungi i domini Jira che vuoi usare. Questo file è pensato per essere locale e non deve finire su Git.
2. Apri Firefox e vai su `about:debugging#/runtime/this-firefox`.
3. Clicca su `Carica componente aggiuntivo temporaneo`.
4. Seleziona il file `manifest.json` in questa cartella.

## Uso

1. Apri una pagina issue Jira valida.
2. Apri l'estensione con l'icona di Firefox.
3. Inserisci il tempo e le note.
4. Clicca su `Salva e scarica` per salvare nel log e scaricare un file CSV.

Il file CSV viene scritto localmente nella cartella di download di Firefox. Per ora questo è il modo più semplice per memorizzare il log al di fuori di Jira.
