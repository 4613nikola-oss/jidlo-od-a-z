# Jídlo od A–Z

Aplikace pro Niky's kitchen: kalorická kalkulačka, jídelníček a recepty z ledničky.

## Co umí

- **Profil** – z věku, váhy, výšky, pohybu a cíle (hubnout / udržet / nabrat) spočítá denní příjem v kcal (rovnice Mifflin-St Jeor).
- **Můj den** – rozdělí příjem na snídani, oběd, večeři a svačinu, navrhne recepty a počet porcí.
- **Lednička** – podle surovin doma ukáže, co jde uvařit a co chybí.
- **Recepty** – slané, sladké a nápoje, s hledáním.
- **Nákup** – nákupní seznam z receptů, celého dne nebo ledničky.
- Doporučí články z blogu podle cíle, pamatuje si údaje (localStorage) a jde přidat na plochu mobilu.

## Struktura

```
index.html      stránka aplikace
manifest.json   nastavení pro přidání na plochu
ikona.svg       ikona
css/app.css     vzhled
js/app.js       logika aplikace
js/data.js      recepty a články (zatím ukázková data)
```

## Spuštění

Stačí otevřít `index.html` v prohlížeči. Odkazy na články (`../clanky.html` apod.) fungují, když je složka aplikace umístěná ve složce webu.

### Přes Docker

```
docker compose up -d --build
```

Appka poběží na http://localhost:8080. Změny v HTML, CSS a JS se projeví po obnovení stránky. Zastavení: `docker compose down`.

## Plán

- skutečné recepty s kcal místo ukázkových
- týdenní jídelníček
- napojení na e-shop s krabičkovými jídly
