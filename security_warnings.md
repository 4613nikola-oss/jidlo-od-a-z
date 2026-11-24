# Bezpečnostní poznámky – appka Jídlo od A–Z

## Účty přes Supabase (od 2026-11-23)

* **Veřejný klíč v kódu (`sb_publishable_…`) je v pořádku** – je určený pro prohlížeč. Data chrání pravidla v databázi (Row Level Security v `supabase/ucty.sql`): každý přihlášený vidí a mění jen svůj řádek, nepřihlášený nic.
* **Tajný klíč (`sb_secret_…` / `service_role`) ani heslo k databázi nikdy do kódu ani do chatu.** Obchází všechna pravidla.
* **Riziko:** kdyby se v Supabase vypnulo Row Level Security u tabulky `uzivatelska_data`, data by byla čitelná pro kohokoli s veřejným klíčem. Po každé změně tabulky zkontrolovat v Supabase → Table Editor, že je u ní „RLS enabled“.
* **Citlivější údaje:** profil obsahuje váhu, výšku, věk a cíl. Před spuštěním účtů dokončit a nechat zkontrolovat text Ochrana soukromí (v appce je zatím koncept).
* **E-maily:** vestavěné posílání e-mailů v Supabase má nízký limit (pár e-mailů za hodinu) – stačí na zkoušení. Pro skutečný provoz napojit vlastní SMTP (např. Brevo, Resend).
* **SMTP klíč Brevo (2026-11-24) byl omylem vložen do chatu.** Niky ho ponechala – jde o cvičný projekt, ostrý provoz se neplánuje. **Kdyby se z projektu někdy stalo něco skutečného:** klíč v Brevo smazat, vygenerovat nový a vložit jen do Supabase (Authentication → Emails → SMTP Settings → Password). Klíč nikdy do chatu, kódu ani screenshotů.
* **Smazání účtu** jde přes funkci `smazat_ucet()` (SECURITY DEFINER), která vždy maže jen účet volajícího.
* Odhlášení data v zařízení nemaže – na sdíleném počítači je potřeba smazat data prohlížeče.
