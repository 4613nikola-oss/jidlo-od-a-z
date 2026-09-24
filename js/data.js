/*
  DATA APLIKACE – tvoje "kartotéka"
  ---------------------------------
  Tady jsou všechny recepty a články, se kterými appka pracuje.
  Nový recept přidáš tak, že zkopíruješ jeden blok { ... } a přepíšeš hodnoty.

  POZOR: recepty i kcal níže jsou jen UKÁZKOVÉ. Až budou tvoje recepty
  na webu s kcal na porci, nahraď je skutečnými.

  Kolonky receptu:
    id         – jedinečné krátké jméno bez mezer a diakritiky
    nazev      – název receptu
    kategorie  – "slane" | "sladke" | "napoje"
    jidlo      – kdy se hodí: "snidane", "obed", "vecere", "svacina" (může jich být víc)
    kcal       – kcal na 1 porci
    cas        – přibližný čas přípravy v minutách
    suroviny   – hlavní suroviny malými písmeny (podle nich hledá Lednička a plní se Nákup)
    odkaz      – adresa receptu na blogu
*/

const RECEPTY = [
    {
        id: "ovesna-kase",
        nazev: "Ovesná kaše s jablkem a skořicí",
        kategorie: "sladke",
        jidlo: ["snidane"],
        kcal: 350,
        cas: 10,
        suroviny: ["ovesné vločky", "mléko", "jablko", "skořice", "ořechy"],
        odkaz: "../sladke.html"
    },
    {
        id: "tvarohova-pomazanka",
        nazev: "Tvarohová pomazánka na kváskovém chlebu",
        kategorie: "slane",
        jidlo: ["snidane", "vecere"],
        kcal: 320,
        cas: 10,
        suroviny: ["tvaroh", "pažitka", "kváskový chléb", "ředkvičky"],
        odkaz: "../slane.html"
    },
    {
        id: "omeleta",
        nazev: "Omeleta se zeleninou a sýrem",
        kategorie: "slane",
        jidlo: ["snidane", "vecere"],
        kcal: 300,
        cas: 15,
        suroviny: ["vejce", "paprika", "rajčata", "sýr", "cibule"],
        odkaz: "../slane.html"
    },
    {
        id: "latte",
        nazev: "Latte s ovesným mlékem",
        kategorie: "napoje",
        jidlo: ["snidane", "svacina"],
        kcal: 120,
        cas: 5,
        suroviny: ["káva", "ovesné mléko"],
        odkaz: "../napoje.html"
    },
    {
        id: "quiche",
        nazev: "Špenátový quiche",
        kategorie: "slane",
        jidlo: ["obed", "vecere"],
        kcal: 420,
        cas: 60,
        suroviny: ["vejce", "špenát", "sýr", "celozrnná mouka", "máslo", "mléko"],
        odkaz: "../slane.html"
    },
    {
        id: "kureci-salat",
        nazev: "Kuřecí salát s quinoou",
        kategorie: "slane",
        jidlo: ["obed"],
        kcal: 480,
        cas: 25,
        suroviny: ["kuřecí maso", "quinoa", "rajčata", "okurka", "olivový olej", "citron"],
        odkaz: "../slane.html"
    },
    {
        id: "cockovy-salat",
        nazev: "Čočkový salát s fetou",
        kategorie: "slane",
        jidlo: ["obed", "vecere"],
        kcal: 450,
        cas: 30,
        suroviny: ["čočka", "cibule", "rajčata", "olivový olej", "feta"],
        odkaz: "../slane.html"
    },
    {
        id: "pecena-zelenina",
        nazev: "Pečená zelenina s cizrnou",
        kategorie: "slane",
        jidlo: ["obed", "vecere"],
        kcal: 390,
        cas: 40,
        suroviny: ["cizrna", "cuketa", "paprika", "cibule", "olivový olej"],
        odkaz: "../slane.html"
    },
    {
        id: "dynovy-kolac",
        nazev: "Slaný koláč s dýní a fetou",
        kategorie: "slane",
        jidlo: ["obed", "vecere"],
        kcal: 410,
        cas: 55,
        suroviny: ["dýně", "feta", "vejce", "celozrnná mouka", "máslo"],
        odkaz: "../slane.html"
    },
    {
        id: "bananovy-chlebicek",
        nazev: "Banánový chlebíček bez cukru",
        kategorie: "sladke",
        jidlo: ["snidane", "svacina"],
        kcal: 210,
        cas: 50,
        suroviny: ["banán", "vejce", "ovesné vločky", "ořechy", "skořice"],
        odkaz: "../sladke.html"
    },
    {
        id: "tvarohovy-dezert",
        nazev: "Tvarohový dezert s jahodami",
        kategorie: "sladke",
        jidlo: ["svacina"],
        kcal: 190,
        cas: 10,
        suroviny: ["tvaroh", "jogurt", "jahody", "med"],
        odkaz: "../sladke.html"
    },
    {
        id: "datlove-kulicky",
        nazev: "Čokoládové kuličky z datlí",
        kategorie: "sladke",
        jidlo: ["svacina"],
        kcal: 180,
        cas: 15,
        suroviny: ["datle", "ořechy", "kakao"],
        odkaz: "../sladke.html"
    },
    {
        id: "zelene-smoothie",
        nazev: "Zelené smoothie",
        kategorie: "napoje",
        jidlo: ["snidane", "svacina"],
        kcal: 150,
        cas: 5,
        suroviny: ["špenát", "banán", "jablko", "jogurt"],
        odkaz: "../napoje.html"
    },
    {
        id: "ledovy-caj",
        nazev: "Ledový čaj s mátou a citronem",
        kategorie: "napoje",
        jidlo: ["svacina"],
        kcal: 40,
        cas: 10,
        suroviny: ["čaj", "máta", "citron", "med"],
        odkaz: "../napoje.html"
    }
];

/*
  ČLÁNKY
    cile – ke kterým cílům článek doporučit: "hubnout", "udrzet", "nabrat" (nebo "vse")
*/
const CLANKY = [
    {
        nazev: "Jak správně počítat kalorie a nebát se jich",
        odkaz: "../clanky.html",
        cile: ["vse"]
    },
    {
        nazev: "Proč po některém jídle cítíme útlum a jak to změnit",
        odkaz: "../clanky.html",
        cile: ["hubnout", "udrzet"]
    },
    {
        nazev: "Tajemství sytivého pečení: Jak nahradit bílou mouku a cukr",
        odkaz: "../clanky.html",
        cile: ["hubnout", "nabrat"]
    },
    {
        nazev: "Domácí kvásek krok za krokem: Zvládne to opravdu každý",
        odkaz: "../clanky.html",
        cile: ["udrzet", "nabrat"]
    }
];
