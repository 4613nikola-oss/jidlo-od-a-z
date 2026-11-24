/*
  JÍDLO OD A–Z – logika aplikace
  ---------------------------
  1) Profil     – výpočet BMR, denního výdeje a cíle
  2) Můj den    – rozdělení cíle do jídel + návrh receptů
  3) Lednička   – recepty podle surovin, které máš doma
  4) Recepty    – přehled s filtrem a hledáním
  5) Nákup      – nákupní seznam
  Vše se ukládá do prohlížeče (localStorage), takže po zavření appky nic nezmizí.
*/

document.addEventListener("DOMContentLoaded", function () {

    /* ============ POMOCNÉ FUNKCE ============ */

    const $ = (sel) => document.querySelector(sel);

    // Když prohlížeč ukládání nepovolí, appka funguje dál, ale řekne to uživateli
    function warnStorage() {
        const el = $("#storage-warning");
        if (el) el.hidden = false;
    }

    // Bezpečné uložení/načtení
    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem("jidloaz-" + key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem("jidloaz-" + key, JSON.stringify(value)); } catch (e) { warnStorage(); }
            // změna dat, která patří do účtu → za chvíli se odešle (viz ÚČET níže)
            if (SYNC_KEYS.includes(key)) {
                try { localStorage.setItem("jidloaz-zmeneno", new Date().toISOString()); } catch (e) { /* nic */ }
                if (cloud.user) naplanujUlozeni();
            }
        }
    };

    /* ============ ÚČET (Supabase, EU) – nepovinný ============ */
    // Veřejná adresa a veřejný (publishable) klíč projektu – smí být v kódu.
    // Data chrání pravidla v databázi (Row Level Security): každý vidí jen svůj řádek.
    const SUPABASE_URL = "https://eohgscmupoxeedwsbakd.supabase.co";
    const SUPABASE_KEY = "sb_publishable_0s7suU4_pLplPbkUHviBZg_RZ3kI_g2";
    const SUPABASE_LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
    // Co se ukládá do účtu (pití po dnech ne – stačí v telefonu)
    const SYNC_KEYS = ["profile", "day", "fridge", "shop", "fav", "view", "swaps", "stamps", "change-skip"];
    const cloud = { sb: null, user: null, timer: null };

    // Kontrola hned při spuštění, ať se to člověk dozví dřív, než něco vyplní
    try {
        localStorage.setItem("jidloaz-test", "1");
        localStorage.removeItem("jidloaz-test");
    } catch (e) { warnStorage(); }

    // Ochrana proti vložení HTML z textu, který napíše uživatel
    function esc(text) {
        return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    const fmt = (n) => Math.round(n).toLocaleString("cs-CZ");

    let toastTimer;
    function toast(message) {
        const el = $("#toast");
        el.textContent = message;
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
    }

    /* ============ RECEPTY Z DATABÁZE ============ */

    // Recepty a články jsou v databázi webu Niky's Kitchen. Web z nich při sestavení
    // vyrobí soubor api/appka.json. Když se ho nepodaří stáhnout (bez internetu, web zrovna neběží),
    // appka použije záložní recepty z js/data.js – funguje tedy vždycky.
    const WEB_URL = ["localhost", "127.0.0.1"].includes(location.hostname)
        ? "http://localhost:3000/"
        : "https://4613nikola-oss.github.io/nikys-kitchen-web/";

    async function loadFromWeb() {
        try {
            const res = await fetch(WEB_URL + "api/appka.json", { cache: "no-cache" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            if (!Array.isArray(data.recepty) || !data.recepty.length) throw new Error("žádné recepty");
            RECEPTY.splice(0, RECEPTY.length, ...data.recepty.map((r) => ({ ...r, odkaz: WEB_URL + r.odkaz })));
            if (Array.isArray(data.clanky) && data.clanky.length) {
                CLANKY.splice(0, CLANKY.length, ...data.clanky.map((c) => ({ ...c, odkaz: WEB_URL + c.odkaz })));
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    // Odkazy na web (hlavička, tipy na obchod) vedou na správnou adresu i na počítači při vývoji
    document.querySelectorAll("[data-web-link]").forEach((a) => { a.href = WEB_URL + a.dataset.webLink; });

    const KATEGORIE = { slane: "Slané", sladke: "Sladké", napoje: "Nápoje" };
    const JIDLA = [
        { id: "snidane", nazev: "Snídaně", podil: 0.25 },
        { id: "obed",    nazev: "Oběd",    podil: 0.35 },
        { id: "vecere",  nazev: "Večeře",  podil: 0.30 },
        { id: "svacina", nazev: "Svačina", podil: 0.10 }
    ];

    /* ============ STAV APLIKACE ============ */

    const state = {
        profile: store.get("profile", null),   // vyplněné údaje + výsledky
        day: store.get("day", {}),             // vybraný recept pro každé jídlo
        fridge: store.get("fridge", []),       // vybrané suroviny
        shop: store.get("shop", []),           // položky nákupu { text, done }
        fav: store.get("fav", []),             // oblíbené recepty (id)
        view: store.get("view", "day"),        // Můj den: den / týden / měsíc
        swaps: store.get("swaps", {}),         // „Jiný recept“ v týdnu a měsíci (klíč = jídlo + den nebo 3denní blok)
        stamps: store.get("stamps", []),       // razítka do kuchařky { typ, klic, datum, popis }
        changeSkip: store.get("change-skip", ""), // týden, kdy malou změnu přeskočil (pondělí jako text)
        water: store.get("water", {}),         // vypité sklenice podle dne { "2026-11-23": 5 }
        filter: "vse"
    };

    // Orientační cena běžného balení v Kč (odhad nákupu; skutečné ceny se liší podle obchodu)
    const CENY = {
        "banán": 35, "borůvky": 69, "brambory": 30, "cibule": 15, "citron": 12, "cuketa": 25, "datle": 59, "feta": 45,
        "jablko": 30, "jahody": 69, "jogurt": 25, "kakao": 49, "kiwi": 39, "kuřecí maso": 129, "kváskový chléb": 59,
        "káva": 149, "limetka": 12, "med": 99, "mléko": 25, "mozzarella": 30, "máta": 29, "okurka": 20, "olej": 59,
        "olivový olej": 179, "ovesné vločky": 25, "ořechy": 69, "paprika": 25, "pažitka": 25, "piniové oříšky": 89,
        "quinoa": 69, "rajčata": 39, "rostlinné mléko": 45, "sýr": 49, "tvaroh": 30, "vejce": 59, "zázvor": 25,
        "čaj": 39, "česnek": 15, "čočka": 39, "ředkvičky": 25, "špenát": 39
    };
    const cena = (text) => CENY[text.toLowerCase()] || 30; // vlastní položka: odhad 30 Kč
    const DNY = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

    /* ============ ZÁLOŽKY ============ */

    // Animace 3: Tečka → dort. Přehraje se znovu při každém otevření „Můj den“.
    function replayMorph() {
        const m = document.querySelector("#panel-den .morph");
        if (!m) return;
        m.classList.remove("play");
        void m.getBoundingClientRect(); // restart animace
        m.classList.add("play");
    }

    function openTab(name) {
        document.querySelectorAll(".tab").forEach((tab) => {
            const active = tab.dataset.tab === name;
            tab.classList.toggle("is-active", active);
            if (active) tab.setAttribute("aria-current", "page");
            else tab.removeAttribute("aria-current");
        });
        document.querySelectorAll(".panel").forEach((panel) => {
            panel.hidden = panel.id !== "panel-" + name;
        });
        if (name === "den") {
            renderDay();
            replayMorph();
        }
        window.scrollTo({ top: 0 });
        store.set("tab", name);
    }

    document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => openTab(tab.dataset.tab));
    });

    /* ============ 1) PROFIL A KALKULAČKA ============ */

    const form = $("#profile-form");
    const fields = [
        { id: "age",    min: 18,  max: 100, message: "Zadej věk mezi 18 a 100 lety." },
        { id: "weight", min: 30,  max: 250, message: "Zadej hmotnost mezi 30 a 250 kg." },
        { id: "height", min: 120, max: 230, message: "Zadej výšku mezi 120 a 230 cm." }
    ];

    function checkField(field) {
        const input = document.getElementById(field.id);
        const error = document.getElementById(field.id + "-error");
        const value = parseFloat(input.value);
        const ok = !isNaN(value) && value >= field.min && value <= field.max;
        error.textContent = ok ? "" : field.message;
        input.classList.toggle("is-invalid", !ok);
        input.setAttribute("aria-invalid", ok ? "false" : "true");
        return ok ? value : null;
    }

    fields.forEach((field) => {
        document.getElementById(field.id).addEventListener("input", function () {
            if (this.classList.contains("is-invalid")) checkField(field);
        });
    });

    function calculate(p) {
        // BMR – Mifflin-St Jeorova rovnice
        let bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age;
        bmr += p.gender === "female" ? -161 : 5;
        const tdee = bmr * p.activity;

        let target, note;
        if (p.goal === "hubnout") {
            target = Math.max(tdee * 0.85, bmr);
            note = "Mírný deficit, asi o 15 % méně než výdej. Nikdy ne pod bazální metabolismus.";
        } else if (p.goal === "nabrat") {
            target = tdee * 1.1;
            note = "Mírný přebytek, asi o 10 % víc než výdej. Nejlépe spolu s posilováním.";
        } else {
            target = tdee;
            note = "Tolik energie drží tvoji váhu na místě.";
        }
        return { bmr, tdee, target, note };
    }

    function renderProfileResults() {
        const p = state.profile;
        if (!p) return;
        const r = calculate(p);
        $("#r-bmr").textContent = fmt(r.bmr);
        $("#r-tdee").textContent = fmt(r.tdee);
        $("#r-target").textContent = fmt(r.target);
        $("#r-goal-note").textContent = r.note;

        const articles = CLANKY.filter((a) => a.cile.includes("vse") || a.cile.includes(p.goal));
        $("#r-articles").innerHTML = articles
            .map((a) => `<li><a href="${esc(a.odkaz)}">${esc(a.nazev)}</a></li>`)
            .join("");

        $("#profile-results").hidden = false;
        renderProfileChip();
    }

    // Karta „Můj profil“ nahoře v Profilu: zvolený avatar, dnešní cíl a jestli se ukládá do účtu
    function renderProfileChip() {
        const p = state.profile;
        $("#me-card").hidden = !p;
        $("#profil-comic").hidden = !!p;
        if (!p) return;
        $("#me-avatar").setAttribute("href", "#" + (p.avatar || "t-nova"));
        $("#me-kcal").textContent = "Dnes: " + fmt(calculate(p).target) + " kcal";
        const status = $("#me-status");
        status.textContent = cloud.user ? "☁️ Přihlášeno – ukládá se do účtu" : "📱 Bez účtu – data jen v tomhle zařízení · Přihlásit";
        status.classList.toggle("is-online", !!cloud.user);
    }

    // Avatar se uloží hned po kliknutí (když už je profil spočítaný)
    $("#avatar-pick").addEventListener("change", (e) => {
        if (!state.profile || !e.target.matches('input[name="avatar"]')) return;
        state.profile.avatar = e.target.value;
        store.set("profile", state.profile);
        renderProfileChip();
    });

    function fillForm(p) {
        const av = form.querySelector(`input[name="avatar"][value="${p.avatar || "t-nova"}"]`);
        if (av) av.checked = true;
        form.querySelector(`input[name="goal"][value="${p.goal}"]`).checked = true;
        form.querySelector(`input[name="gender"][value="${p.gender}"]`).checked = true;
        $("#age").value = p.age;
        $("#weight").value = p.weight;
        $("#height").value = p.height;
        $("#activity").value = String(p.activity);
        form.querySelectorAll('input[name="diet"]').forEach((c) => { c.checked = (p.diet || []).includes(c.value); });
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        const age = checkField(fields[0]);
        const weight = checkField(fields[1]);
        const height = checkField(fields[2]);

        if (age === null || weight === null || height === null) {
            $("#profile-results").hidden = true;
            form.querySelector(".is-invalid").focus();
            return;
        }

        state.profile = {
            avatar: (form.querySelector('input[name="avatar"]:checked') || {}).value || "t-nova",
            goal: form.querySelector('input[name="goal"]:checked').value,
            gender: form.querySelector('input[name="gender"]:checked').value,
            age, weight, height,
            activity: parseFloat($("#activity").value),
            diet: [...form.querySelectorAll('input[name="diet"]:checked')].map((c) => c.value)
        };
        store.set("profile", state.profile);
        renderProfileResults();
        $("#profile-results").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    /* ============ 2) MŮJ DEN ============ */

    // Kolik porcí sníst, aby recept seděl na cílové kcal (zaokrouhleno na půlky, 0,5–2,5)
    function portionFor(recipe, targetKcal) {
        const raw = targetKcal / recipe.kcal;
        return Math.min(2.5, Math.max(0.5, Math.round(raw * 2) / 2));
    }

    // Jídelníček z profilu: vegetariánsky, bez lepku, bez mléka.
    // Recept bez údaje (záložní data bez internetu) radši vynecháme, než abychom nabídli něco nevhodného.
    function sediNaJidelnicek(r) {
        const diet = (state.profile && state.profile.diet) || [];
        if (diet.includes("vege") && r.vege !== true) return false;
        if (diet.includes("bezlepku") && (!Array.isArray(r.alergeny) || r.alergeny.includes("lepek"))) return false;
        if (diet.includes("bezmleka") && (!Array.isArray(r.alergeny) || r.alergeny.includes("mleko"))) return false;
        return true;
    }

    // Orientační cíle: pití podle EFSA (ženy ~1,6 l, muži ~2 l z nápojů), bílkoviny g/kg podle cíle
    function waterTarget(p) {
        return (p.gender === "male" ? 8 : 7) + (p.activity >= 1.725 ? 1 : 0);
    }
    function proteinTarget(p) {
        const naKilo = { hubnout: 1.4, udrzet: 1.0, nabrat: 1.8 }[p.goal] || 1.0;
        return Math.round(p.weight * naKilo);
    }

    // Recepty vhodné pro dané jídlo, seřazené od nejlépe sedícího
    function candidatesFor(mealId, targetKcal) {
        return RECEPTY
            // recepty bez kcal (ještě je doplníme) do plánu dne nepatří – nedá se spočítat porce
            .filter((r) => r.kcal && r.jidlo.includes(mealId) && sediNaJidelnicek(r))
            .map((r) => {
                const porce = portionFor(r, targetKcal);
                return { recipe: r, porce, diff: Math.abs(r.kcal * porce - targetKcal) + Math.abs(porce - 1) * 60 };
            })
            .sort((a, b) => a.diff - b.diff);
    }

    function currentDayPlan() {
        const target = calculate(state.profile).target;
        return JIDLA.map((meal) => {
            const mealTarget = target * meal.podil;
            const list = candidatesFor(meal.id, mealTarget);
            if (!list.length) return { meal, mealTarget, pick: null };
            const index = (state.day[meal.id] || 0) % list.length;
            return { meal, mealTarget, pick: list[index] };
        });
    }

    /* ---- MŮJ TÝDEN A MĚSÍC ---- */
    // Obědy a večeře se mění po 3 dnech (jeden základ uvaříš dopředu), snídaně a svačiny každý den.
    // Měsíc = 4 týdny za sebou; dny se počítají průběžně, takže se týdny navzájem liší.
    const variDopredu = (mealId) => mealId === "obed" || mealId === "vecere";
    // Klíč pro „Jiný recept“: oběd/večeře platí pro celý 3denní blok, ostatní jen pro jeden den
    const swapKey = (mealId, den) => variDopredu(mealId) ? `${mealId}-b${Math.floor(den / 3)}` : `${mealId}-d${den}`;

    // Pondělí tohoto týdne (od něj se počítají data v plánu)
    function mondayOf(date) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d;
    }
    const kratkeDatum = (d) => `${d.getDate()}. ${d.getMonth() + 1}.`;

    function weekPlan(t = 0) {
        const target = calculate(state.profile).target;
        const start = mondayOf(new Date());
        return DNY.map((nazevDne, d) => {
            const den = t * 7 + d; // pořadí dne od začátku plánu
            const datum = new Date(start);
            datum.setDate(start.getDate() + den);
            return {
                nazevDne, datum, den,
                jidla: JIDLA.map((meal) => {
                    const mealTarget = target * meal.podil;
                    const list = candidatesFor(meal.id, mealTarget);
                    if (!list.length) return { meal, pick: null };
                    const key = swapKey(meal.id, den);
                    const posun = (variDopredu(meal.id) ? Math.floor(den / 3) : den) + (state.swaps[key] || 0);
                    return { meal, key, pick: list[((state.day[meal.id] || 0) + posun) % list.length] };
                })
            };
        });
    }

    const daySum = (den) => den.jidla.reduce((a, j) => a + (j.pick ? j.pick.recipe.kcal * j.pick.porce : 0), 0);

    function weekDaysHtml(t) {
        return weekPlan(t).map((den, d) => `<article class="card week-day${d % 2 ? " week-day--alt" : ""}">
                <header class="meal-head"><h2>${den.nazevDne} <span class="week-date">${kratkeDatum(den.datum)}</span></h2><span class="meal-kcal">~ ${fmt(daySum(den))} kcal</span></header>
                <ul class="week-meals">${den.jidla.map((j) => j.pick
                    ? `<li><span class="week-meal">${j.meal.nazev}</span> <a href="${esc(j.pick.recipe.odkaz)}">${esc(j.pick.recipe.nazev)}</a>
                        <button type="button" class="swap-btn" data-action="swap-plan" data-key="${j.key}" aria-label="Jiný recept: ${j.meal.nazev}, ${den.nazevDne}" title="Jiný recept">🔄</button></li>`
                    : `<li><span class="week-meal">${j.meal.nazev}</span> <em>zatím bez receptu</em></li>`).join("")}</ul>
            </article>`).join("");
    }

    function renderWeek() {
        $("#week-days").innerHTML = weekDaysHtml(0);
    }

    // Kolik různých receptů je v plánu – když málo, upozorníme, že se jídla opakují
    function renderMonth() {
        const tydny = [0, 1, 2, 3];
        const ruzne = new Set(tydny.flatMap((t) => weekPlan(t).flatMap((den) => den.jidla.filter((j) => j.pick).map((j) => j.pick.recipe.id))));
        $("#month-note").hidden = ruzne.size >= 20;
        $("#month-weeks").innerHTML = tydny.map((t) => {
            const dny = weekPlan(t);
            const prumer = dny.reduce((a, den) => a + daySum(den), 0) / 7;
            const nazev = t === 0 ? "Tento týden" : t === 1 ? "Příští týden" : `Týden ${t + 1}`;
            return `<details class="card month-week"${t === 0 ? " open" : ""}>
                <summary><span class="month-week-title">${nazev}</span> <span class="week-date">${kratkeDatum(dny[0].datum)} – ${kratkeDatum(dny[6].datum)}</span> <span class="meal-kcal">~ ${fmt(prumer)} kcal / den</span></summary>
                <div class="week-list">${weekDaysHtml(t)}</div>
                <button type="button" class="btn btn--primary btn--full" data-action="shop-week" data-week="${t}">${nazev} na nákup</button>
            </details>`;
        }).join("");
    }

    function renderView() {
        const hasProfile = !!state.profile;
        $("#view-switch").hidden = !hasProfile;
        $("#week-content").hidden = !hasProfile || state.view !== "week";
        $("#month-content").hidden = !hasProfile || state.view !== "month";
        document.querySelectorAll("#view-switch .seg").forEach((b) => {
            const on = b.dataset.view === state.view;
            b.classList.toggle("is-on", on);
            b.setAttribute("aria-pressed", on);
        });
        if (hasProfile && state.view === "week") renderWeek();
        if (hasProfile && state.view === "month") renderMonth();
    }

    $("#view-switch").addEventListener("click", (e) => {
        const b = e.target.closest("[data-view]");
        if (!b) return;
        state.view = b.dataset.view;
        store.set("view", state.view);
        renderDay();
    });

    /* ============ RAZÍTKA A MOJE KUCHAŘKA ============ */
    // Chválíme, nehlídáme: žádné série, které se přeruší, nic se nemaže.
    // Jediná výjimka: „Uvařeno“ jde ještě týž den vrátit (kdyby se člověk překlikl).

    const pad = (n) => String(n).padStart(2, "0");
    const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dnes = () => dateKey(new Date());
    const tydenKey = () => dateKey(mondayOf(new Date()));

    const RAZITKA = {
        recept: { ikona: "🍳", nazev: "Uvařený recept" },
        den:    { ikona: "📅", nazev: "Splněný den" },
        tyden:  { ikona: "🗓️", nazev: "Splněný týden" },
        zmena:  { ikona: "🌱", nazev: "Malá změna" }
    };

    // 1 malá změna týdně – střídají se dokola
    const ZMENY = [
        "Ke každému jídlu si dej sklenici vody.",
        "Přidej si každý den jednu zeleninu navíc.",
        "Aspoň jednu večeři sněz bez telefonu.",
        "Jednou za týden zkus recept, který je pro tebe nový.",
        "Ke snídani si přidej něco s bílkovinou – jogurt, vejce, tvaroh.",
        "Po obědě se projdi aspoň 10 minut.",
        "Nakup podle seznamu z appky – a nic navíc.",
        "Uvař si oběd dopředu na 2–3 dny.",
        "Sladké si dej klidně – ale v klidu, u stolu, s chutí.",
        "Měj po ruce zdravou svačinu, ať tě hlad nepřekvapí.",
        "Jez pomaleji – polož příbor mezi sousty.",
        "Jednou týdně si dej rybu nebo luštěniny."
    ];
    function zmenaTydne() {
        // počet týdnů od pevného pondělí → každý týden jiný úkol, pro všechny stejný
        const tydny = Math.round((mondayOf(new Date()) - new Date(2026, 0, 5)) / (7 * 864e5));
        return ZMENY[((tydny % ZMENY.length) + ZMENY.length) % ZMENY.length];
    }

    const maRazitko = (klic) => state.stamps.some((s) => s.klic === klic);
    // Razítka a kuchařka jsou odměna za účet. Kdo je už má z dřívějška, nic mu nezmizí.
    const muzeRazitka = () => !!cloud.user || state.stamps.length > 0;
    function pozviKUctu(text) {
        openTab("profil");
        toast(text);
        setTimeout(() => {
            $("#account").scrollIntoView({ behavior: "smooth", block: "start" });
            $("#login-email").focus({ preventScroll: true });
        }, 300);
    }
    function pridejRazitko(typ, klic, popis) {
        if (maRazitko(klic)) return false;
        state.stamps.push({ typ, klic, datum: dnes(), popis });
        store.set("stamps", state.stamps);
        return true;
    }
    function odeberRazitko(klic) {
        state.stamps = state.stamps.filter((s) => s.klic !== klic);
        store.set("stamps", state.stamps);
    }

    // Den je splněný, když jsou uvařená všechna jídla z plánu; týden, když je splněných aspoň 5 dní ze 7
    function zkontrolujDenATyden() {
        const jidla = currentDayPlan().filter((p) => p.pick);
        const denKlic = "d-" + dnes();
        const denSplnen = jidla.length > 0 && jidla.every((p) => maRazitko(`r-${dnes()}-${p.meal.id}`));
        let novy = null;
        if (denSplnen && pridejRazitko("den", denKlic, "Splněný den")) novy = "den";
        if (!denSplnen && maRazitko(denKlic)) odeberRazitko(denKlic);

        const pondeli = tydenKey();
        const dnuVTydnu = state.stamps.filter((s) => s.typ === "den" && s.klic.slice(2) >= pondeli).length;
        const tydenKlic = "t-" + pondeli;
        if (dnuVTydnu >= 5 && pridejRazitko("tyden", tydenKlic, "Splněný týden")) novy = "tyden";
        if (dnuVTydnu < 5 && maRazitko(tydenKlic)) odeberRazitko(tydenKlic);
        return novy;
    }

    const razitekText = (n) => `${n} ${n === 1 ? "razítko" : n >= 2 && n <= 4 ? "razítka" : "razítek"}`;

    // Tečka se mění podle počtu razítek: 5 = vaří, 15 = slaví, 30 = dort
    function renderCookbook() {
        const n = state.stamps.length;
        const zamceno = !muzeRazitka();
        $("#cookbook-count").textContent = zamceno ? "🔒 s účtem" : razitekText(n);
        $("#stamps").hidden = zamceno;
        $("#cookbook-login").hidden = !zamceno;
        const img = $("#cookbook-img");
        const svg = $("#cookbook-svg");
        let obrazek = null, symbol = "#t-nova", text;
        if (zamceno) text = "S účtem tu sbíráš razítka za uvařená jídla. A já se za ně proměňuju!";
        else if (n === 0) text = "Uvař první recept z Můj den a dostaneš první razítko!";
        else if (n < 5) text = `Už ${razitekText(n)}! Ještě ${5 - n} a začnu vařit s tebou.`;
        else if (n < 15) { obrazek = "img/tecka-vari.svg"; text = `${razitekText(n)}! Ještě ${15 - n} a budu slavit.`; }
        else if (n < 30) { obrazek = "img/tecka-slavi.svg"; text = `${razitekText(n)}! Ještě ${30 - n} a proměním se v dort.`; }
        else { symbol = "#t-nova-dort"; text = `${razitekText(n)}! Jsi kuchařská hvězda.`; }
        img.hidden = !obrazek;
        svg.style.display = obrazek ? "none" : "";
        if (obrazek) img.src = obrazek;
        svg.querySelector("use").setAttribute("href", symbol);
        $("#cookbook-bubble").textContent = text;

        $("#stamps").innerHTML = state.stamps.map((s) => {
            const r = RAZITKA[s.typ] || RAZITKA.recept;
            const datum = s.datum.split("-").reverse().map(Number).slice(0, 2).join(". ") + ".";
            const popis = `${r.nazev}${s.popis && s.typ === "recept" ? ": " + s.popis : ""}, ${datum}`;
            return `<li class="stamp stamp--${s.typ}" title="${esc(popis)}"><span aria-hidden="true">${r.ikona}</span><span class="sr-only">${esc(popis)}</span></li>`;
        }).join("");
    }

    function renderChange() {
        const card = $("#change-card");
        const tyden = tydenKey();
        card.hidden = !state.profile || state.changeSkip === tyden || !muzeRazitka();
        if (card.hidden) return;
        $("#change-text").textContent = zmenaTydne();
        $("#change-actions").innerHTML = maRazitko("z-" + tyden)
            ? `<p class="change-done">✓ Splněno – razítko 🌱 máš v kuchařce.</p>`
            : `<button type="button" class="btn btn--primary btn--small" data-action="change-done">Splněno ✓</button>
               <button type="button" class="btn btn--ghost btn--small" data-action="change-skip">Tento týden ne</button>`;
    }

    function renderDay() {
        const hasProfile = !!state.profile;
        renderChange();
        $("#day-empty").hidden = hasProfile;
        $("#day-content").hidden = !hasProfile || state.view !== "day";
        renderView();
        if (!hasProfile) return;

        const target = calculate(state.profile).target;
        $("#day-target").textContent = fmt(target);

        const plan = currentDayPlan();
        let sum = 0;
        let bilkoviny = 0, bezUdaje = false;
        // nápověda k razítkům přímo nad jídly
        $("#stamp-hint").textContent = muzeRazitka()
            ? "🍳 Uvařeno? Klikni u jídla na „Mám uvařeno“ a dostaneš razítko do Moje kuchařky (v Profilu)."
            : "🍳 S účtem dostaneš za každé uvařené jídlo razítko do Moje kuchařky (v Profilu).";

        $("#day-meals").innerHTML = plan.map(({ meal, mealTarget, pick }) => {
            if (!pick) {
                return `<article class="card meal">
                    <header class="meal-head"><h2>${meal.nazev}</h2><span class="meal-kcal">~ ${fmt(mealTarget)} kcal</span></header>
                    <p class="empty-text">${(state.profile.diet || []).length
                        ? "S tvým jídelníčkem (Profil) sem zatím žádný recept nesedí. Nové recepty přibývají – nebo si omezení v Profilu uprav."
                        : "Pro tohle jídlo zatím nemáš žádný recept."}</p>
                </article>`;
            }
            const r = pick.recipe;
            const kcal = r.kcal * pick.porce;
            sum += kcal;
            if (typeof r.bilkoviny === "number") bilkoviny += r.bilkoviny * pick.porce; else bezUdaje = true;
            const porceText = pick.porce === 1 ? "1 porce" : `${String(pick.porce).replace(".", ",")} porce`;
            return `<article class="card meal">
                <header class="meal-head">
                    <h2>${meal.nazev}</h2>
                    <span class="meal-kcal">cíl ~ ${fmt(mealTarget)} kcal</span>
                </header>
                <a class="meal-recipe" href="${esc(r.odkaz)}">${esc(r.nazev)}</a>
                <p class="meal-meta">${porceText} · ${fmt(kcal)} kcal${typeof r.bilkoviny === "number" ? ` · 💪 ${fmt(r.bilkoviny * pick.porce)} g bílkovin` : ""} · ${r.cas} min</p>
                <div class="meal-actions">
                    ${(() => {
                        const uvareno = maRazitko(`r-${dnes()}-${meal.id}`);
                        return `<button type="button" class="btn btn--small cooked-btn${uvareno ? " is-on" : ""}" data-action="cooked" data-meal="${meal.id}" data-name="${esc(r.nazev)}" aria-pressed="${uvareno}">${uvareno ? "✓ Uvařeno" : "🍳 Mám uvařeno"}</button>`;
                    })()}
                    <button type="button" class="btn btn--ghost btn--small" data-action="swap" data-meal="${meal.id}">Jiný recept</button>
                    <button type="button" class="btn btn--ghost btn--small" data-action="shop-recipe" data-id="${r.id}">Na nákup</button>
                </div>
            </article>`;
        }).join("");

        $("#day-sum").textContent = fmt(sum);
        $("#day-protein").textContent = bezUdaje || !plan.some((p) => p.pick)
            ? ""
            : `💪 Bílkoviny ~${fmt(bilkoviny)} z ${fmt(proteinTarget(state.profile))} g (orientačně)`;
        renderWater();
    }

    function renderWater() {
        if (!state.profile) return;
        const cil = waterTarget(state.profile);
        const vypito = state.water[dnes()] || 0;
        $("#water-count").textContent = `${vypito} z ${cil} sklenic${vypito >= cil ? " ✓" : ""}`;
        // každá sklenice je tlačítko: klik vyplní až po ni, klik na poslední plnou ji vyprázdní
        $("#water-glasses").innerHTML = Array.from({ length: Math.max(cil, vypito) }, (_, i) =>
            `<button type="button" class="glass${i < vypito ? " is-full" : ""}" data-action="water-set" data-n="${i + 1 === vypito ? i : i + 1}"
                aria-label="${i + 1 === vypito ? `Odebrat ${i + 1}. sklenici` : `Vypito ${i + 1} ${i === 0 ? "sklenice" : i < 4 ? "sklenice" : "sklenic"}`}"></button>`).join("");
    }

    /* ============ SPOLEČNÁ KARTA RECEPTU ============ */

    function recipeCard(r, extra) {
        const tags = r.jidlo.map((j) => JIDLA.find((m) => m.id === j).nazev).join(", ");
        return `<article class="card recipe">
            <div class="recipe-top">
                <span class="badge badge--${r.kategorie}">${KATEGORIE[r.kategorie]}</span>
                <span class="recipe-kcal">${r.kcal ? fmt(r.kcal) + " kcal / porce" : "kcal doplníme"}</span>
            </div>
            <h2 class="recipe-title"><a href="${esc(r.odkaz)}">${esc(r.nazev)}</a>
                <button type="button" class="fav-btn${state.fav.includes(r.id) ? " is-fav" : ""}" data-action="fav" data-id="${r.id}"
                    aria-pressed="${state.fav.includes(r.id)}" aria-label="${state.fav.includes(r.id) ? "Odebrat z oblíbených" : "Přidat do oblíbených"}: ${esc(r.nazev)}">
                    <svg aria-hidden="true"><use href="#i-oblibene"/></svg></button></h2>
            <p class="recipe-meta">${r.cas} min${typeof r.bilkoviny === "number" && r.bilkoviny > 0 ? ` · 💪 ${r.bilkoviny} g bílkovin` : ""}${r.vege ? " · 🥕 vege" : ""} · ${tags}</p>
            ${extra || ""}
            <div class="recipe-actions">
                <a class="btn btn--ghost btn--small" href="${esc(r.odkaz)}">Otevřít recept</a>
                <button type="button" class="btn btn--ghost btn--small" data-action="shop-recipe" data-id="${r.id}">Na nákup</button>
            </div>
        </article>`;
    }

    /* ============ 3) LEDNIČKA ============ */

    // Všechny suroviny ze všech receptů (po načtení receptů z webu se přepočítají)
    let allIngredients = [];
    function refreshIngredients() {
        allIngredients = [...new Set(RECEPTY.flatMap((r) => r.suroviny))]
            .sort((a, b) => a.localeCompare(b, "cs"));
    }
    refreshIngredients();

    function renderFridge() {
        const q = $("#fridge-search").value.trim().toLowerCase();
        const visible = allIngredients.filter((s) => s.includes(q));

        $("#fridge-chips").innerHTML = visible.length
            ? visible.map((s) => {
                const on = state.fridge.includes(s);
                return `<button type="button" class="chip${on ? " is-on" : ""}" data-ingredient="${esc(s)}" aria-pressed="${on}">${esc(s)}</button>`;
            }).join("")
            : `<p class="empty-text">Tuhle surovinu zatím žádný recept nepoužívá.</p>`;

        const n = state.fridge.length;
        $("#fridge-count").textContent = n === 0 ? "Nic nevybráno"
            : n === 1 ? "Vybrána 1 surovina"
            : n < 5 ? `Vybrány ${n} suroviny` : `Vybráno ${n} surovin`;

        if (!n) {
            $("#fridge-results").innerHTML = `<p class="empty-text">Klikni na suroviny, které máš doma.</p>`;
            return;
        }

        const matches = RECEPTY
            .map((r) => {
                const have = r.suroviny.filter((s) => state.fridge.includes(s));
                const missing = r.suroviny.filter((s) => !state.fridge.includes(s));
                return { r, have, missing, score: have.length / r.suroviny.length };
            })
            .filter((m) => m.have.length > 0)
            .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);

        if (!matches.length) {
            $("#fridge-results").innerHTML = `<p class="empty-text">Z těchhle surovin zatím nic nenajdu. Zkus přidat další.</p>`;
            return;
        }

        $("#fridge-results").innerHTML = `<h2 class="list-title">Co z toho uvaříš</h2>` + matches.map((m) => {
            const status = m.missing.length === 0
                ? `<p class="match match--full">Máš všechno, můžeš vařit.</p>`
                : `<p class="match">Máš ${m.have.length} z ${m.r.suroviny.length}. Chybí: ${m.missing.map(esc).join(", ")}
                   <button type="button" class="link-btn" data-action="shop-missing" data-id="${m.r.id}">Chybějící na nákup</button></p>`;
            return recipeCard(m.r, status);
        }).join("");
    }

    $("#fridge-search").addEventListener("input", renderFridge);

    $("#fridge-chips").addEventListener("click", (e) => {
        const chip = e.target.closest("[data-ingredient]");
        if (!chip) return;
        const s = chip.dataset.ingredient;
        state.fridge = state.fridge.includes(s) ? state.fridge.filter((x) => x !== s) : [...state.fridge, s];
        store.set("fridge", state.fridge);
        renderFridge();
    });

    /* ============ 4) RECEPTY ============ */

    /* Hledání, které promine překlep a nevadí mu diakritika („omleta“ najde „Omeleta“) */
    const bezDiakritiky = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    function vzdalenost(a, b) {
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
        }
        return d[a.length][b.length];
    }
    function slovaReceptu(r) {
        return bezDiakritiky(`${r.nazev} ${r.suroviny.join(" ")}`).split(/[^a-z0-9]+/).filter(Boolean);
    }
    // Každé slovo dotazu musí sedět (přesně, začátkem, nebo s malým překlepem)
    function sediNaDotaz(r, dotaz) {
        const slova = slovaReceptu(r);
        return bezDiakritiky(dotaz).split(/\s+/).filter(Boolean).every((w) => {
            const tolerance = w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
            return slova.some((s) => s.includes(w) || Math.min(vzdalenost(w, s), vzdalenost(w, s.slice(0, w.length))) <= tolerance);
        });
    }
    // Když nic nesedí, nabídneme 3 nejpodobnější recepty
    function podobne(dotaz) {
        const q = bezDiakritiky(dotaz).split(/\s+/).filter(Boolean);
        return RECEPTY
            .map((r) => {
                const slova = slovaReceptu(r);
                return { r, skore: q.reduce((sum, w) => sum + Math.min(...slova.map((s) => vzdalenost(w, s.slice(0, w.length)))), 0) };
            })
            .sort((a, b) => a.skore - b.skore)
            .slice(0, 3)
            .map((x) => x.r);
    }

    function renderRecipes() {
        const q = $("#recipe-search").value.trim();
        const list = RECEPTY.filter((r) =>
            (state.filter === "vse" || r.kategorie === state.filter || (state.filter === "oblibene" && state.fav.includes(r.id)) || (state.filter === "vege" && r.vege === true)) && (!q || sediNaDotaz(r, q))
        );
        if (list.length) {
            $("#recipe-list").innerHTML = list.map((r) => recipeCard(r)).join("");
            return;
        }
        // Nikdy jen „nic tu není“: nabídneme podobné a cestu zpět
        const tipy = q ? podobne(q) : [];
        $("#recipe-list").innerHTML = `<div class="card empty">
            <p><strong>${q ? `„${esc(q)}“ jsem nenašla.` : state.filter === "oblibene" ? "Zatím nemáš oblíbené recepty. Přidáš je srdíčkem u receptu." : "V této kategorii zatím nic není."}</strong></p>
            ${tipy.length ? `<p>Možná hledáš:</p>` : ""}
            <div class="suggest">
                ${tipy.map((r) => `<button type="button" class="chip" data-action="search-suggest" data-name="${esc(r.nazev)}">${esc(r.nazev)}</button>`).join("")}
                <button type="button" class="btn btn--ghost btn--small" data-action="search-clear">Zobrazit všechny recepty</button>
            </div>
        </div>`;
    }

    $("#recipe-filters").addEventListener("click", (e) => {
        const chip = e.target.closest("[data-filter]");
        if (!chip) return;
        state.filter = chip.dataset.filter;
        document.querySelectorAll("#recipe-filters .chip").forEach((c) => {
            const on = c === chip;
            c.classList.toggle("is-on", on);
            c.setAttribute("aria-pressed", on);
        });
        renderRecipes();
    });

    $("#recipe-search").addEventListener("input", renderRecipes);

    /* ============ 5) NÁKUPNÍ SEZNAM ============ */

    function addToShop(items) {
        let added = 0;
        items.forEach((text) => {
            const clean = text.trim();
            if (!clean) return;
            const exists = state.shop.some((i) => i.text.toLowerCase() === clean.toLowerCase() && !i.done);
            if (!exists) { state.shop.push({ text: clean, done: false }); added++; }
        });
        store.set("shop", state.shop);
        renderShop();
        return added;
    }

    function renderShop() {
        const list = $("#shop-list");
        list.innerHTML = state.shop.map((item, i) => `
            <li class="shop-item${item.done ? " is-done" : ""}">
                <label>
                    <input type="checkbox" data-index="${i}" ${item.done ? "checked" : ""}>
                    <svg class="check-box" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6"/><path d="M6.5 12.5l4 4 7-8.5"/></svg>
                    <span class="check-text">${esc(item.text)}</span>
                </label>
                <span class="shop-links">
                    <a href="https://www.rohlik.cz/hledat?q=${encodeURIComponent(item.text)}" target="_blank" rel="noopener" class="shop-link shop-link--r" aria-label="Najít ${esc(item.text)} na Rohlíku">R</a>
                    <a href="https://www.kosik.cz/vyhledavani?search=${encodeURIComponent(item.text)}" target="_blank" rel="noopener" class="shop-link shop-link--k" aria-label="Najít ${esc(item.text)} na Košíku">K</a>
                </span>
                <button type="button" class="icon-btn" data-action="shop-remove" data-index="${i}" aria-label="Odebrat ${esc(item.text)}">×</button>
            </li>`).join("");

        updateShopMeta();
    }

    // počítadlo na záložce a tlačítko „Smazat koupené“ (bez překreslení seznamu)
    function updateShopMeta() {
        const open = state.shop.filter((i) => !i.done).length;
        $("#shop-empty").hidden = state.shop.length > 0;
        // odhad ceny jen za to, co ještě nemáš koupené
        $("#shop-tools").hidden = open === 0;
        $("#shop-price").textContent = fmt(state.shop.filter((i) => !i.done).reduce((a, i) => a + cena(i.text), 0));
        $("#shop-clear-done").hidden = !state.shop.some((i) => i.done);

        const badge = $("#shop-count");
        badge.hidden = open === 0;
        badge.textContent = open;
    }

    $("#shop-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const input = $("#shop-input");
        if (addToShop([input.value])) toast("Přidáno na nákup");
        input.value = "";
        input.focus();
    });

    $("#shop-list").addEventListener("change", (e) => {
        if (!e.target.matches("input[type=checkbox]")) return;
        state.shop[e.target.dataset.index].done = e.target.checked;
        store.set("shop", state.shop);
        // jen přepnout třídu – fajfka se nakreslí a text přeškrtne (animace 4)
        e.target.closest(".shop-item").classList.toggle("is-done", e.target.checked);
        updateShopMeta();
    });

    /* ============ TLAČÍTKA NAPŘÍČ APPKOU ============ */

    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const recipe = btn.dataset.id ? RECEPTY.find((r) => r.id === btn.dataset.id) : null;

        if (action === "search-suggest") {
            $("#recipe-search").value = btn.dataset.name;
            renderRecipes();
        }
        if (action === "search-clear") {
            $("#recipe-search").value = "";
            state.filter = "vse";
            document.querySelectorAll("#recipe-filters .chip").forEach((c) => {
                const on = c.dataset.filter === "vse";
                c.classList.toggle("is-on", on);
                c.setAttribute("aria-pressed", on);
            });
            renderRecipes();
        }

        if (action === "go-day") openTab("den");
        if (action === "go-profil") openTab("profil");

        if (action === "cooked" && state.profile && !muzeRazitka()) {
            pozviKUctu("Razítka do kuchařky sbíráš s účtem – stačí e-mail, žádné heslo 🍳");
        } else if (action === "cooked" && state.profile) {
            const klic = `r-${dnes()}-${btn.dataset.meal}`;
            if (maRazitko(klic)) {
                odeberRazitko(klic);
                zkontrolujDenATyden();
                toast("Vráceno – razítko jsem vzala zpátky");
            } else {
                pridejRazitko("recept", klic, btn.dataset.name);
                const novy = zkontrolujDenATyden();
                toast(novy === "tyden" ? "Týden splněný! 🗓️ Velké razítko do kuchařky"
                    : novy === "den" ? "Celý den splněný! 📅 Razítko navíc"
                    : "Razítko do kuchařky! 🍳");
            }
            renderDay();
            renderCookbook();
        }

        if (action === "water-plus" || action === "water-minus" || action === "water-set") {
            const den = dnes();
            const pred = state.water[den] || 0;
            const ted = action === "water-set" ? Math.max(0, Math.min(Number(btn.dataset.n) || 0, 20))
                : action === "water-plus" ? Math.min(pred + 1, 20) : Math.max(pred - 1, 0);
            // staré dny nepotřebujeme – drží se jen dnešek, ať úložiště neroste
            state.water = { [den]: ted };
            store.set("water", state.water);
            renderWater();
            if (ted > pred && state.profile && ted >= waterTarget(state.profile) && pred < waterTarget(state.profile)) toast("Dnešní pití splněné! 💧");
        }

        if (action === "change-done") {
            pridejRazitko("zmena", "z-" + tydenKey(), zmenaTydne());
            toast("Paráda! 🌱 Razítko za malou změnu");
            renderChange();
            renderCookbook();
        }

        if (action === "change-skip") {
            state.changeSkip = tydenKey();
            store.set("change-skip", state.changeSkip);
            toast("V pohodě, příští týden bude jiná");
            renderChange();
        }

        if (action === "swap") {
            // vyměněné jídlo už není to uvařené – razítko za původní recept zůstává
            state.day[btn.dataset.meal] = (state.day[btn.dataset.meal] || 0) + 1;
            store.set("day", state.day);
            renderDay();
        }

        if (action === "shop-recipe" && recipe) {
            const n = addToShop(recipe.suroviny);
            toast(n ? `Na nákup přidáno ${n} ${n === 1 ? "položka" : n < 5 ? "položky" : "položek"}` : "Suroviny už na seznamu máš");
        }

        if (action === "shop-missing" && recipe) {
            const missing = recipe.suroviny.filter((s) => !state.fridge.includes(s));
            addToShop(missing);
            toast("Chybějící suroviny jsou na nákupu");
        }

        if (action === "shop-day") {
            const items = currentDayPlan().filter((p) => p.pick).flatMap((p) => p.pick.recipe.suroviny);
            const n = addToShop(items);
            toast(n ? "Celý den je na nákupu" : "Suroviny už na seznamu máš");
        }

        if (action === "shop-week" && state.profile) {
            const items = weekPlan(Number(btn.dataset.week) || 0).flatMap((den) => den.jidla.filter((j) => j.pick).flatMap((j) => j.pick.recipe.suroviny));
            const n = addToShop([...new Set(items)]);
            toast(n ? `Týden je na nákupu (${n} ${n === 1 ? "položka" : n < 5 ? "položky" : "položek"})` : "Suroviny už na seznamu máš");
        }

        if (action === "swap-plan" && state.profile) {
            const key = btn.dataset.key;
            state.swaps[key] = (state.swaps[key] || 0) + 1;
            store.set("swaps", state.swaps);
            // otevřené týdny v měsíci zůstanou otevřené
            const open = [...document.querySelectorAll("#month-weeks details")].map((x) => x.open);
            renderView();
            document.querySelectorAll("#month-weeks details").forEach((x, i) => { if (open.length) x.open = open[i]; });
            toast(/-b\d+$/.test(key) ? "Vyměněno – platí pro všechny 3 dny, kdy se to jí" : "Vyměněno");
        }

        if (action === "fav" && recipe) {
            state.fav = state.fav.includes(recipe.id) ? state.fav.filter((x) => x !== recipe.id) : [...state.fav, recipe.id];
            store.set("fav", state.fav);
            toast(state.fav.includes(recipe.id) ? "Přidáno do oblíbených" : "Odebráno z oblíbených");
            renderRecipes();
            renderFridge();
        }

        // „Kup hotové“ bez vypisování: celý seznam do schránky nebo poslat dál
        const seznamText = () => state.shop.filter((i) => !i.done).map((i) => "• " + i.text).join("\n");
        if (action === "shop-copy") {
            navigator.clipboard?.writeText(seznamText()).then(() => toast("Seznam je zkopírovaný"), () => toast("Kopírování se nepovedlo"));
        }
        if (action === "shop-share") {
            const text = "Nákup z appky Jídlo od A–Z:\n" + seznamText();
            if (navigator.share) navigator.share({ title: "Nákupní seznam", text }).catch(() => {});
            else navigator.clipboard?.writeText(text).then(() => toast("Sdílení tu nejde, seznam jsem zkopírovala"));
        }

        if (action === "guide-done") {
            store.set("guide-done", true);
            $("#guide").hidden = true;
            $("#age").focus();
        }

        if (action === "shop-remove") {
            state.shop.splice(Number(btn.dataset.index), 1);
            store.set("shop", state.shop);
            renderShop();
        }

        if (action === "shop-clear-done") {
            state.shop = state.shop.filter((i) => !i.done);
            store.set("shop", state.shop);
            renderShop();
        }

        if (action === "fridge-clear") {
            state.fridge = [];
            store.set("fridge", state.fridge);
            renderFridge();
        }
    });

    /* ============ START ============ */

    // průvodce jen při prvním spuštění (bez profilu a dokud ho člověk nezavře)
    $("#guide").hidden = !!state.profile || store.get("guide-done", false);

    if (state.profile) {
        fillForm(state.profile);
        renderProfileResults();
    }
    /* ---- ÚČET: přihlášení odkazem z e-mailu, ukládání a načítání dat ---- */

    // Data, která patří do účtu, jako jeden objekt
    function snapshot() {
        const out = {};
        SYNC_KEYS.forEach((k) => {
            const v = store.get(k, undefined);
            if (v !== undefined) out[k] = v;
        });
        return out;
    }
    const maData = (d) => !!(d && (d.profile || (d.stamps && d.stamps.length) || (d.fav && d.fav.length) || (d.shop && d.shop.length) || (d.fridge && d.fridge.length)));
    const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // Zapíše data z účtu do zařízení a appku znovu načte (stav se čte při startu)
    function pouzijData(data) {
        try {
            SYNC_KEYS.forEach((k) => {
                if (k in data) localStorage.setItem("jidloaz-" + k, JSON.stringify(data[k]));
                else localStorage.removeItem("jidloaz-" + k);
            });
            localStorage.setItem("jidloaz-zmeneno", new Date().toISOString());
        } catch (e) { warnStorage(); return; }
        location.reload();
    }

    async function supabase() {
        if (cloud.sb) return cloud.sb;
        const { createClient } = await import(SUPABASE_LIB);
        cloud.sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
            // implicit: odkaz z e-mailu funguje, i když ho otevřeš v jiném prohlížeči než ten, kde jsi ho žádal/a
            auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return cloud.sb;
    }

    function syncText(text) { $("#sync-status").textContent = text; }

    function naplanujUlozeni() {
        clearTimeout(cloud.timer);
        syncText("Ukládám…");
        cloud.timer = setTimeout(ulozDoUctu, 1500);
    }

    // Zapamatuje si, ke kterému účtu tohle zařízení patří – pak se při přihlášení nemusí ptát
    function oznacZarizeni() {
        try { localStorage.setItem("jidloaz-ucet", cloud.user.id); } catch (e) { /* nic */ }
    }
    const jeMojeZarizeni = () => { try { return localStorage.getItem("jidloaz-ucet") === cloud.user.id; } catch (e) { return false; } };

    async function ulozDoUctu() {
        if (!cloud.user) return;
        const { error } = await cloud.sb.from("uzivatelska_data")
            .upsert({ user_id: cloud.user.id, data: snapshot(), upraveno: new Date().toISOString() });
        if (error) { syncText("Uložení se nepovedlo – zkusím to při další změně. Data v zařízení zůstávají."); return; }
        oznacZarizeni();
        syncText("Uloženo v účtu ✓ " + new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }));
    }

    // Vlastní okno místo confirm() prohlížeče: dvě jasná tlačítka. Vrátí "ucet" nebo "zarizeni".
    function zeptejSeNaData() {
        return new Promise((hotovo) => {
            const dlg = $("#data-dialog");
            const vyber = (volba) => { dlg.close(); hotovo(volba); };
            $("#data-from-account").onclick = () => vyber("ucet");
            $("#data-from-device").onclick = () => vyber("zarizeni");
            dlg.oncancel = (e) => { e.preventDefault(); }; // Esc nic nerozhodne – musí se vybrat
            dlg.showModal();
            $("#data-from-account").focus();
        });
    }

    // Po přihlášení: porovná data v zařízení a v účtu. Novější vyhrává, při prvním přihlášení se zeptá.
    async function srovnejData(prvniPrihlaseni) {
        const { data: row, error } = await cloud.sb.from("uzivatelska_data")
            .select("data, upraveno").eq("user_id", cloud.user.id).maybeSingle();
        if (error) { syncText("Účet se teď nepodařilo načíst. Appka jede dál z dat v zařízení."); return; }
        const mistni = snapshot();
        if (!row) {
            // nový účet: vezmeme, co je v zařízení
            await ulozDoUctu();
            if (maData(mistni)) toast("Data z tohoto zařízení jsou uložená v účtu ☁️");
            return;
        }
        if (stejne(row.data, mistni)) { oznacZarizeni(); syncText("Uloženo v účtu ✓"); return; }
        if (!maData(mistni)) { oznacZarizeni(); pouzijData(row.data); return; }
        // ptát se jen na „cizím“ zařízení (poprvé s tímhle účtem); na svém rozhodne novější
        if (prvniPrihlaseni && maData(row.data) && !jeMojeZarizeni()) {
            const volba = await zeptejSeNaData();
            oznacZarizeni();
            if (volba === "ucet") pouzijData(row.data);
            else { await ulozDoUctu(); toast("Data z tohoto zařízení jsou uložená v účtu ☁️"); }
            return;
        }
        // běžné otevření appky: novější vyhrává
        let mistniCas = "";
        try { mistniCas = localStorage.getItem("jidloaz-zmeneno") || ""; } catch (e) { /* nic */ }
        if (mistniCas && new Date(mistniCas) > new Date(row.upraveno)) await ulozDoUctu();
        else pouzijData(row.data);
    }

    function renderAccount() {
        $("#account-out").hidden = !!cloud.user;
        $("#account-in").hidden = !cloud.user;
        if (cloud.user) $("#account-email").textContent = cloud.user.email || "";
        renderProfileChip();
    }

    async function spustUcet() {
        const sb = await supabase();
        let prvni = location.hash.includes("access_token");
        sb.auth.onAuthStateChange((event, session) => {
            const predtim = cloud.user;
            cloud.user = session ? session.user : null;
            renderAccount();
            // přihlášení/odhlášení odemyká nebo zamyká razítka
            if (!!predtim !== !!cloud.user) { renderDay(); renderCookbook(); }
            if (cloud.user && !predtim) {
                // nevolat Supabase přímo uvnitř posluchače (doporučení knihovny) – až po dokončení
                setTimeout(() => {
                    srovnejData(prvni || event === "SIGNED_IN");
                    prvni = false;
                }, 0);
                if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + location.search);
            }
        });
    }

    $("#login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = $("#login-email");
        const email = input.value.trim();
        const chyba = $("#login-error");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            chyba.textContent = "Zkontroluj e-mail, něco v něm chybí.";
            input.setAttribute("aria-invalid", "true");
            input.focus();
            return;
        }
        chyba.textContent = "";
        input.setAttribute("aria-invalid", "false");
        const tlacitko = e.target.querySelector("button");
        tlacitko.disabled = true;
        try {
            await posliKod(email);
            $("#login-form").hidden = true;
            $("#code-form").hidden = false;
            $("#login-code").value = "";
            $("#code-error").textContent = "";
            $("#login-code").focus();
        } catch (err) {
            const kod = String((err && (err.code || err.message)) || "");
            if (/email_address_invalid|invalid/i.test(kod)) {
                chyba.textContent = "Tenhle e-mail nejde použít. Zkontroluj, jestli je správně – třeba jmeno.prijmeni@seznam.cz.";
                input.setAttribute("aria-invalid", "true");
                input.focus();
            } else if (/rate|limit|security purposes/i.test(kod)) {
                chyba.textContent = "E-mailů bylo poslední dobou moc. Zkus to prosím za chvíli znovu.";
            } else if (err && err.status >= 500) {
                chyba.textContent = "E-mail se teď nepodařilo odeslat – chyba je u nás, ne u tebe. Zkus to prosím později.";
            } else {
                chyba.textContent = "Kód se nepovedlo poslat. Zkontroluj připojení a zkus to znovu.";
            }
        } finally {
            tlacitko.disabled = false;
        }
    });

    // Pošle kód do e-mailu (bez odkazu – v poště nic nevaruje a jde to i z mobilu do počítače)
    async function posliKod(email) {
        const sb = await supabase();
        if (!cloud.posloucha) { cloud.posloucha = true; await spustUcet(); }
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw error;
        cloud.email = email;
        $("#login-sent").textContent = `Poslala jsem ti kód na ${email}. Opiš ho sem (koukni i do spamu). Platí 1 hodinu.`;
    }

    $("#code-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = $("#login-code");
        const kod = input.value.replace(/\s/g, "");
        const chyba = $("#code-error");
        if (!/^\d{6,8}$/.test(kod)) {
            chyba.textContent = "Kód má 6 číslic – opiš ho z e-mailu.";
            input.setAttribute("aria-invalid", "true");
            input.focus();
            return;
        }
        const tlacitko = e.target.querySelector("button[type='submit']");
        tlacitko.disabled = true;
        try {
            const { error } = await cloud.sb.auth.verifyOtp({ email: cloud.email, token: kod, type: "email" });
            if (error) throw error;
            // přihlášení dokončí posluchač onAuthStateChange (načte/uloží data)
            chyba.textContent = "";
            input.setAttribute("aria-invalid", "false");
            $("#code-form").hidden = true;
            $("#login-form").hidden = false;
            toast("Jsi přihlášený/á ☁️");
        } catch (err) {
            chyba.textContent = /expired|invalid|otp/i.test(String((err && (err.code || err.message)) || ""))
                ? "Kód nesedí nebo už vypršel. Zkontroluj ho, případně si pošli nový."
                : "Přihlášení se nepovedlo. Zkontroluj připojení a zkus to znovu.";
            input.setAttribute("aria-invalid", "true");
            input.focus();
        } finally {
            tlacitko.disabled = false;
        }
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action^='account-']");
        if (!btn || !cloud.sb) return;
        const action = btn.dataset.action;

        if (action === "account-download") {
            const obsah = JSON.stringify({ email: cloud.user && cloud.user.email, stazeno: new Date().toISOString(), data: snapshot() }, null, 2);
            const odkaz = document.createElement("a");
            odkaz.href = URL.createObjectURL(new Blob([obsah], { type: "application/json" }));
            odkaz.download = "jidlo-od-a-z-moje-data.json";
            document.body.appendChild(odkaz);
            odkaz.click();
            odkaz.remove();
        }

        // po odhlášení / smazání zase ukázat formulář na přihlášení
        const znovuFormular = () => { $("#login-form").hidden = false; $("#code-form").hidden = true; };

        if (action === "account-change-email") {
            znovuFormular();
            $("#login-email").focus();
        }

        if (action === "account-resend" && cloud.email) {
            btn.disabled = true;
            try {
                await posliKod(cloud.email);
                toast("Nový kód je na cestě ✉️");
            } catch (err) {
                $("#code-error").textContent = /rate|limit|security purposes/i.test(String((err && (err.code || err.message)) || ""))
                    ? "Nový kód jde poslat až za chvíli (asi za minutu)."
                    : "Kód se nepovedlo poslat. Zkus to prosím za chvíli.";
            } finally {
                btn.disabled = false;
            }
        }

        if (action === "account-logout") {
            await cloud.sb.auth.signOut();
            znovuFormular();
            toast("Odhlášeno. Data v tomhle zařízení zůstávají.");
        }

        if (action === "account-delete") {
            if (!confirm("Opravdu smazat účet?\n\nSmaže se účet i všechna data v něm a nejde to vrátit. Data v tomhle zařízení zůstanou.")) return;
            const { error } = await cloud.sb.rpc("smazat_ucet");
            if (error) { toast("Smazání se nepovedlo, zkus to prosím znovu."); return; }
            try { localStorage.removeItem("jidloaz-ucet"); } catch (e2) { /* nic */ }
            await cloud.sb.auth.signOut();
            znovuFormular();
            toast("Účet je smazaný.");
        }
    });

    // Knihovnu Supabase načteme jen tomu, kdo je přihlášený nebo se právě vrací z odkazu v e-mailu
    const maRelaci = (() => {
        try { return !!localStorage.getItem("sb-eohgscmupoxeedwsbakd-auth-token"); } catch (e) { return false; }
    })();
    if (maRelaci || location.hash.includes("access_token")) {
        cloud.posloucha = true;
        spustUcet().catch(() => syncText("Účet se teď nepodařilo načíst. Appka jede dál z dat v zařízení."));
    }
    renderAccount();

    renderFridge();
    renderRecipes();
    renderShop();
    renderCookbook();

    const lastTab = store.get("tab", "profil");
    if (document.getElementById("panel-" + lastTab)) openTab(lastTab);

    // Appka se ukáže hned se záložními recepty, a jakmile dorazí recepty z databáze, překreslí se
    loadFromWeb().then((ok) => {
        if (!ok) return;
        refreshIngredients();
        if (state.profile) renderProfileResults();
        renderDay();
        renderFridge();
        renderRecipes();
    });
});
