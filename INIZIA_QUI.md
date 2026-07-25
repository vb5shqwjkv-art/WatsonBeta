# 📚 Inizia qui — l'assistente vocale per studiare

Una guida semplice per far partire il sito sul tuo computer e usarlo per ore,
al minimo costo. Detti a voce, il documento si scrive e si formatta da solo.

- 🎙️ **Voce → testo**: gratis (usa il riconoscimento vocale di Chrome)
- 💻 **Hosting**: gratis (gira sul tuo computer)
- 🧠 **Cervello (Google Gemini)**: **gratis** (piano gratuito, senza carta di credito)

---

## Cosa ti serve (una volta sola)

1. **Google Chrome** (il dettato in italiano funziona bene solo su Chrome o Edge).
2. **Node.js** — scaricalo da **nodejs.org**, versione **LTS**, e installalo.
3. Una **chiave Google Gemini** — gratuita, la creiamo al passo 2.

---

## Passo 1 — Scarica il progetto

Da GitHub, sul branch **`claude/ai-voice-document-assistant-2wkp7z`**:
pulsante verde **Code → Download ZIP**. Poi **estrai** la cartella dove vuoi
(es. sul Desktop).

> In alternativa, se sai usare git:
> `git clone` del repository e `git checkout claude/ai-voice-document-assistant-2wkp7z`.

---

## Passo 2 — La chiave Google Gemini (gratis)

1. Vai su **aistudio.google.com** e accedi con il tuo account Google.
2. Clicca **"Get API key"** (in alto) → **"Create API key"**.
3. **Copia** la chiave (inizia con `AIza...`).

💡 *Costo:* **zero**. Nessuna carta di credito. Il piano gratuito ha solo dei
**limiti di velocità** (quante richieste al minuto): per studiare vanno benissimo;
se detti tantissimo di seguito e li superi, basta aspettare qualche secondo.

---

## Passo 3 — Il file della chiave (già pronto)

Nella cartella del progetto trovi un file chiamato **`.env.local.pronto`**.

1. **Rinominalo** in **`.env.local`** (togli `.pronto`).
2. Aprilo con un editor di testo e **incolla la tua chiave Google** al posto di
   `AIza-INCOLLA-QUI-LA-TUA-CHIAVE-GOOGLE`.
3. Salva. Dentro deve esserci:

```
OPENAI_API_KEY=AIza...la-tua-chiave...
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_REASONING_MODEL=gemini-2.0-flash
```

> Nota: la voce si chiama `OPENAI_API_KEY` solo per motivi tecnici, ma qui ci va
> la tua **chiave Google** — è normale.

La chiave resta **solo sul tuo computer** e non viene mai condivisa.

> **Rete di salvataggio:** in fondo al file trovi già pronte (commentate) le righe
> per passare a **OpenAI gpt-4o-mini** — da usare solo se con Gemini qualche
> comando complesso non dovesse funzionare. Costa pochi centesimi, non euro.

---

## Passo 4 — Avvia

Apri il **Terminale** dentro la cartella del progetto e lancia:

```bash
npm install     # solo la primissima volta
npm run dev
```

Quando vedi *"ready"*, il sito è attivo.

---

## Passo 5 — Usa il sito

Apri **http://localhost:3000/editor** con **Google Chrome**.

- 🎙️ **Microfono** (verde, a sinistra): premilo e **consenti il microfono**.
  Si scrive **solo** mentre è acceso. Parla in italiano.
- ✏️ **Matita** (verde scuro, a destra): attiva la **correzione manuale** — solo
  con questa accesa puoi cliccare e correggere a mano.
- **Nuovo** (in alto): svuota il foglio per ricominciare.
- **PDF / Word**: scarica il documento del momento.

Per finire di studiare: chiudi il Terminale (o premi `Ctrl+C`).

---

## Cosa puoi dire (esempi)

Detti contenuto e comandi **insieme**, come a una persona:

- *"Scrivi come titolo «Il tessuto osseo» con un carattere più grande."*
- *"Vai a capo e scrivi una descrizione… la parola osso in arancione e sottolineata."*
- *"Sotto la parola osso fai una freccia verso il basso."*
- *"Fai un elenco puntato: cellule, matrice, fibre."*
- *"Adesso compariamo osso spugnoso e osso compatto"* → crea due **colonne**
  affiancate; poi *"sotto osso spugnoso scrivi che è leggero e poroso."*
- *"Aggiungi una colonna: cartilagine."* / *"Togli l'ultima colonna."*
- *"Al rigo 3 sottolinea"*, *"scrivi in verde"*, *"fai una tabella"*, *"torna indietro"*.

Il testo **fluisce** come un discorso: va a capo solo quando dici **"vai a capo"**.

---

## Se qualcosa non va

- **Il microfono non parte** → usa **Chrome**, e controlla di aver dato il permesso
  al microfono (icona vicino alla barra degli indirizzi).
- **"Errore" / non scrive niente** → di solito la chiave Google è sbagliata o
  incollata male: ricontrolla il file `.env.local` (le tre righe) e riprova.
- **Si ferma dopo tanti comandi di fila** → hai toccato il limite di velocità
  gratuito di Gemini: aspetta qualche secondo e riparti.
- **Cambi la chiave o il file?** → ferma (`Ctrl+C`) e rilancia `npm run dev`.

Buono studio! 🎓
