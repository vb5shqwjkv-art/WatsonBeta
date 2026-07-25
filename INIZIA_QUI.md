# 📚 Inizia qui — l'assistente vocale per studiare

Una guida semplice per far partire il sito sul tuo computer e usarlo per ore,
al minimo costo. Detti a voce, il documento si scrive e si formatta da solo.

- 🎙️ **Voce → testo**: gratis (usa il riconoscimento vocale di Chrome)
- 💻 **Hosting**: gratis (gira sul tuo computer)
- 🧠 **Cervello (OpenAI gpt-4o-mini)**: pochi centesimi, con tetto di spesa bloccato

---

## Cosa ti serve (una volta sola)

1. **Google Chrome** (il dettato in italiano funziona bene solo su Chrome o Edge).
2. **Node.js** — scaricalo da **nodejs.org**, versione **LTS**, e installalo.
3. Una **chiave OpenAI** (la creiamo al passo 2).

---

## Passo 1 — Scarica il progetto

Da GitHub, sul branch **`claude/ai-voice-document-assistant-2wkp7z`**:
pulsante verde **Code → Download ZIP**. Poi **estrai** la cartella dove vuoi
(es. sul Desktop).

> In alternativa, se sai usare git:
> `git clone` del repository e `git checkout claude/ai-voice-document-assistant-2wkp7z`.

---

## Passo 2 — La chiave OpenAI (+ tetto di spesa)

1. Vai su **platform.openai.com** e accedi/registrati.
2. **Billing** → aggiungi una carta e carica **5 $** (l'API è separata da ChatGPT).
3. **Limits / Budget** → imposta un **tetto mensile** basso, es. **3 $**: da lì in
   poi non potrai **mai** spendere di più (il sistema si blocca da solo).
4. **API keys** → **Create new secret key** → **copia** la chiave (inizia con `sk-...`).

💡 *Costo reale:* circa **0,05–0,1 centesimi a comando**. Una sessione di studio
di ore ≈ **10–30 centesimi**. 5 $ durano **settimane/mesi**.

---

## Passo 3 — Il file della chiave (già pronto)

Nella cartella del progetto trovi un file chiamato **`.env.local.pronto`**.

1. **Rinominalo** in **`.env.local`** (togli `.pronto`).
2. Aprilo con un editor di testo e **incolla la tua chiave** al posto di
   `sk-INCOLLA-QUI-LA-TUA-CHIAVE-OPENAI`.
3. Salva. Dentro deve esserci:

```
OPENAI_API_KEY=sk-...la-tua-chiave...
OPENAI_REASONING_MODEL=gpt-4o-mini
```

La chiave resta **solo sul tuo computer** e non viene mai condivisa.

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
- **"Errore" / non scrive niente** → di solito la chiave OpenAI è sbagliata o senza
  credito: ricontrolla il file `.env.local` e il Billing su OpenAI.
- **Cambi la chiave o il file?** → ferma (`Ctrl+C`) e rilancia `npm run dev`.

Buono studio! 🎓
