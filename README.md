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
4. Clicca su `Salva` per memorizzare il log localmente nel browser.
5. Quando vuoi scaricare il backup, clicca su `Esporta CSV`.
6. Se vuoi svuotare tutti i log salvati, clicca su `Svuota Cache` (con conferma).

Il log viene memorizzato in `browser.storage.local`, quindi resta disponibile anche dopo il riavvio del browser. Il file CSV viene generato solo su richiesta e viene salvato con un nome mensile del tipo `jira-time-log-<user>-YYYY-MM.csv`.

> Nota: lo storage locale è persistente, ma per sicurezza ti conviene esportare il CSV regolarmente come copia esterna.