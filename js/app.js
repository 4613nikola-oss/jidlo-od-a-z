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

    // Bezpečné uložení/načtení – když prohlížeč ukládání nepovolí, appka funguje dál
    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem("jidloaz-" + key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem("jidloaz-" + key, JSON.stringify(value)); } catch (e) { /* nic */ }
        }
    };

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
        filter: "vse"
    };

    /* ============ ZÁLOŽKY ============ */

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
        if (name === "den") renderDay();
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
    }

    function fillForm(p) {
        form.querySelector(`input[name="goal"][value="${p.goal}"]`).checked = true;
        form.querySelector(`input[name="gender"][value="${p.gender}"]`).checked = true;
        $("#age").value = p.age;
        $("#weight").value = p.weight;
        $("#height").value = p.height;
        $("#activity").value = String(p.activity);
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
            goal: form.querySelector('input[name="goal"]:checked').value,
            gender: form.querySelector('input[name="gender"]:checked').value,
            age, weight, height,
            activity: parseFloat($("#activity").value)
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

    // Recepty vhodné pro dané jídlo, seřazené od nejlépe sedícího
    function candidatesFor(mealId, targetKcal) {
        return RECEPTY
            .filter((r) => r.jidlo.includes(mealId))
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

    function renderDay() {
        const hasProfile = !!state.profile;
        $("#day-empty").hidden = hasProfile;
        $("#day-content").hidden = !hasProfile;
        if (!hasProfile) return;

        const target = calculate(state.profile).target;
        $("#day-target").textContent = fmt(target);

        const plan = currentDayPlan();
        let sum = 0;

        $("#day-meals").innerHTML = plan.map(({ meal, mealTarget, pick }) => {
            if (!pick) {
                return `<article class="card meal">
                    <header class="meal-head"><h2>${meal.nazev}</h2><span class="meal-kcal">~ ${fmt(mealTarget)} kcal</span></header>
                    <p class="empty-text">Pro tohle jídlo zatím nemáš žádný recept.</p>
                </article>`;
            }
            const r = pick.recipe;
            const kcal = r.kcal * pick.porce;
            sum += kcal;
            const porceText = pick.porce === 1 ? "1 porce" : `${String(pick.porce).replace(".", ",")} porce`;
            return `<article class="card meal">
                <header class="meal-head">
                    <h2>${meal.nazev}</h2>
                    <span class="meal-kcal">cíl ~ ${fmt(mealTarget)} kcal</span>
                </header>
                <a class="meal-recipe" href="${esc(r.odkaz)}">${esc(r.nazev)}</a>
                <p class="meal-meta">${porceText} · ${fmt(kcal)} kcal · ${r.cas} min</p>
                <div class="meal-actions">
                    <button type="button" class="btn btn--ghost btn--small" data-action="swap" data-meal="${meal.id}">Jiný recept</button>
                    <button type="button" class="btn btn--ghost btn--small" data-action="shop-recipe" data-id="${r.id}">Na nákup</button>
                </div>
            </article>`;
        }).join("");

        $("#day-sum").textContent = fmt(sum);
    }

    /* ============ SPOLEČNÁ KARTA RECEPTU ============ */

    function recipeCard(r, extra) {
        const tags = r.jidlo.map((j) => JIDLA.find((m) => m.id === j).nazev).join(", ");
        return `<article class="card recipe">
            <div class="recipe-top">
                <span class="badge badge--${r.kategorie}">${KATEGORIE[r.kategorie]}</span>
                <span class="recipe-kcal">${fmt(r.kcal)} kcal / porce</span>
            </div>
            <h2 class="recipe-title"><a href="${esc(r.odkaz)}">${esc(r.nazev)}</a></h2>
            <p class="recipe-meta">${r.cas} min · ${tags}</p>
            ${extra || ""}
            <div class="recipe-actions">
                <a class="btn btn--ghost btn--small" href="${esc(r.odkaz)}">Otevřít recept</a>
                <button type="button" class="btn btn--ghost btn--small" data-action="shop-recipe" data-id="${r.id}">Na nákup</button>
            </div>
        </article>`;
    }

    /* ============ 3) LEDNIČKA ============ */

    const allIngredients = [...new Set(RECEPTY.flatMap((r) => r.suroviny))]
        .sort((a, b) => a.localeCompare(b, "cs"));

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

    function renderRecipes() {
        const q = $("#recipe-search").value.trim().toLowerCase();
        const list = RECEPTY.filter((r) =>
            (state.filter === "vse" || r.kategorie === state.filter) &&
            (r.nazev.toLowerCase().includes(q) || r.suroviny.some((s) => s.includes(q)))
        );
        $("#recipe-list").innerHTML = list.length
            ? list.map((r) => recipeCard(r)).join("")
            : `<p class="empty-text">Nic takového jsem nenašla.</p>`;
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
                    <span>${esc(item.text)}</span>
                </label>
                <button type="button" class="icon-btn" data-action="shop-remove" data-index="${i}" aria-label="Odebrat ${esc(item.text)}">×</button>
            </li>`).join("");

        const open = state.shop.filter((i) => !i.done).length;
        $("#shop-empty").hidden = state.shop.length > 0;
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
        renderShop();
    });

    /* ============ TLAČÍTKA NAPŘÍČ APPKOU ============ */

    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const recipe = btn.dataset.id ? RECEPTY.find((r) => r.id === btn.dataset.id) : null;

        if (action === "go-day") openTab("den");
        if (action === "go-profil") openTab("profil");

        if (action === "swap") {
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

    if (state.profile) {
        fillForm(state.profile);
        renderProfileResults();
    }
    renderFridge();
    renderRecipes();
    renderShop();

    const lastTab = store.get("tab", "profil");
    if (document.getElementById("panel-" + lastTab)) openTab(lastTab);
});
