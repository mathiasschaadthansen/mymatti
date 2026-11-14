from datetime import date

import pandas as pd
import streamlit as st

from mymatti import ai, core
from views.common import DISCLAIMER, flash, load_state, save_state, show_flash


def render() -> None:
    state = load_state()
    show_flash()
    st.title("🍳 Opskrifter")

    tab_new, tab_saved = st.tabs(["Forslag ud fra lageret", f"Gemte ({len(state['saved_recipes'])})"])
    with tab_new:
        _generator(state)
        safe = [r for r in state["suggestions"] if not r.get("allergy_hits")]
        blocked = [r for r in state["suggestions"] if r.get("allergy_hits")]
        all_missing = [(r, i) for r in safe for i in r["ingredients"]
                       if not any(s["id"] == i.get("inventory_id") for s in state["inventory"])]
        if len(safe) > 1 and all_missing:
            if st.button(f"🛒 Læg alt, der mangler til de {len(safe)} retter, på indkøbslisten"):
                for recipe, ing in all_missing:
                    core.add_shopping(state, ing["name"], ing.get("amount", ""), recipe["title"],
                                      ing.get("category", "Andet"), source="recipe")
                save_state(state)
                flash("Manglende varer lagt på indkøbslisten")
                st.rerun()
        for recipe in safe:
            _recipe_card(state, recipe, saved=False)
        if blocked:
            with st.expander(f"🚫 {len(blocked)} forslag frasorteret af allergitjekket"):
                for recipe in blocked:
                    st.markdown(f"**{recipe['title']}**")
                    for hit in recipe["allergy_hits"]:
                        st.markdown(f"- {hit}")
        if state["suggestions"]:
            st.caption(DISCLAIMER)
    with tab_saved:
        if not state["saved_recipes"]:
            st.caption("Ingen gemte opskrifter endnu.")
        profile = core.family_profile(state)
        for recipe in state["saved_recipes"]:
            # Allergier kan være ændret, siden opskriften blev gemt – tjek igen.
            recipe["allergy_hits"] = core.check_recipe(recipe, profile)
            _recipe_card(state, recipe, saved=True)


def _generator(state: dict) -> None:
    if not ai.available():
        st.info("Opskriftsforslag kræver, at AI er sat op (se README).")
        return
    if not [i for i in state["inventory"] if i["qty"] > 0]:
        st.info("Lageret er tomt – tilføj varer under **Beholdning** først.")
        return

    with st.form("generate"):
        family = state["family"]
        eaters = st.multiselect(
            "Hvem spiser med?", [m["id"] for m in family], default=[m["id"] for m in family],
            format_func=lambda mid: next(m["name"] for m in family if m["id"] == mid),
            help="Opskrifterne skal være sikre for alle, der spiser med.",
        ) if family else None
        c1, c2, c3 = st.columns(3)
        meal = c1.selectbox("Måltid", ["Aftensmad", "Madpakker", "Frokost", "Morgenmad", "Bagværk/dessert"])
        persons = c2.number_input("Personer", 1, 20, int(state["settings"]["persons"]))
        max_time = c3.select_slider("Maks. tid (min)", [15, 20, 30, 45, 60, 90], value=20)
        c4, c5 = st.columns(2)
        count = c4.slider("Antal forslag", 1, 7, 3, help="Vælg 5-7 for en ugeplan.")
        max_missing = c5.slider("Må købe op til … ekstra varer", 0, 6, 2)
        wishes = st.text_input("Ønsker (valgfrit)", placeholder="Fx børnevenligt, vegetarisk, brug kyllingen")
        go = st.form_submit_button("Find opskrifter", type="primary")

    if not go:
        return
    if family and not eaters:
        st.warning("Vælg mindst én, der spiser med.")
        return
    profile = core.family_profile(state, eaters)
    # Varer med de spisendes allergener sendes slet ikke til AI'en.
    usable = [i for i in state["inventory"] if not core.check_text(i["name"], profile)]
    traces = ("Varer med 'kan indeholde spor af' er i orden." if state["settings"].get("traces_ok")
              else "Undgå også varer, der typisk er mærket 'kan indeholde spor af' allergenerne.")
    opts = {"count": count, "meal": meal, "persons": persons, "max_time": max_time,
            "max_missing": max_missing, "wishes": wishes, "traces": traces}
    try:
        with st.spinner("Finder på retter ud fra jeres lager…"):
            state["suggestions"] = ai.generate_recipes(usable, profile, opts)
    except ai.AIError as exc:
        st.error(str(exc))
        return
    save_state(state)
    st.rerun()


def _recipe_card(state: dict, recipe: dict, saved: bool) -> None:
    stock = {i["id"]: i for i in state["inventory"]}
    rid = recipe["id"]
    missing = [i for i in recipe["ingredients"] if i.get("inventory_id") not in stock]

    with st.container(border=True):
        st.subheader(recipe["title"])
        meta = [f"⏱ {recipe.get('time_min', '?')} min", f"👥 {recipe.get('servings', '?')} pers."]
        meta.append("✅ alt på lager" if not missing else f"🛒 mangler {len(missing)}")
        st.caption(" · ".join(meta))
        if recipe.get("allergy_hits"):
            st.error("Indeholder allergener for familien:\n\n" + "\n".join(f"- {h}" for h in recipe["allergy_hits"]))
        elif recipe.get("eaters"):
            st.caption(f"Allergitjekket for: {', '.join(recipe['eaters'])}")
        st.write(recipe.get("description", ""))

        with st.expander("Ingredienser og fremgangsmåde"):
            for ing in recipe["ingredients"]:
                mark = "🛒" if ing in missing else "✅"
                st.markdown(f"{mark} {ing['amount']} {ing['name']}")
            others = [core.ALLERGENS[a]["label"] for a in recipe.get("allergens", []) if a in core.ALLERGENS]
            if others:
                st.caption("Indeholder: " + ", ".join(others))
            st.markdown("\n".join(f"{n}. {step}" for n, step in enumerate(recipe.get("steps", []), 1)))
            if recipe.get("tip"):
                st.info(f"💡 {recipe['tip']}")

        c1, c2, c3 = st.columns(3)
        if c1.button("🛒 Mangler → indkøb", key=f"shop_{rid}", disabled=not missing, width="stretch"):
            for ing in missing:
                core.add_shopping(state, ing["name"], ing.get("amount", ""), recipe["title"],
                                  ing.get("category", "Andet"), source="recipe")
            save_state(state)
            flash(f"{len(missing)} vare(r) lagt på indkøbslisten")
            st.rerun()
        if c2.button("✅ Vi har lavet den", key=f"cook_{rid}", width="stretch"):
            st.session_state["cooking"] = rid
        if saved:
            if c3.button("🗑 Fjern", key=f"del_{rid}", width="stretch"):
                state["saved_recipes"] = [r for r in state["saved_recipes"] if r["id"] != rid]
                save_state(state)
                st.rerun()
        else:
            already = any(r["title"] == recipe["title"] for r in state["saved_recipes"])
            if c3.button("⭐ Gem", key=f"save_{rid}", disabled=already, width="stretch"):
                state["saved_recipes"].append({**recipe, "id": core.new_id()})
                save_state(state)
                flash("Opskrift gemt")
                st.rerun()

        if st.session_state.get("cooking") == rid:
            _cook_form(state, recipe, stock)


def _cook_form(state: dict, recipe: dict, stock: dict) -> None:
    used = [i for i in recipe["ingredients"] if i.get("inventory_id") in stock]
    st.markdown("**Hvad brugte I?** Ret mængderne, så lageret passer.")
    if not used:
        st.caption("Opskriften bruger ingen varer, der stadig er på lager.")
    rows = [{
        "id": i["inventory_id"], "Vare": stock[i["inventory_id"]]["name"],
        "På lager": core.fmt_qty(stock[i["inventory_id"]]["qty"], stock[i["inventory_id"]]["unit"]),
        "Brugt": float(i.get("use_qty") or 0), "Enhed": stock[i["inventory_id"]]["unit"],
    } for i in used]
    df = pd.DataFrame(rows, columns=["id", "Vare", "På lager", "Brugt", "Enhed"])
    edited = st.data_editor(
        df, key=f"cookdf_{recipe['id']}", hide_index=True, width="stretch",
        disabled=["Vare", "På lager", "Enhed"],
        column_config={"id": None, "Brugt": st.column_config.NumberColumn(min_value=0.0, format="%.2f")},
    )
    c1, c2 = st.columns(2)
    if c1.button("Træk fra lageret", type="primary", key=f"cookok_{recipe['id']}", width="stretch"):
        for row in edited.to_dict("records"):
            if not pd.isna(row["Brugt"]) and row["Brugt"] > 0:
                core.deduct(state, row["id"], float(row["Brugt"]))
        state["log"] = ([{"date": date.today().isoformat(), "title": recipe["title"]}] + state["log"])[:50]
        core.sync_staples(state)
        save_state(state)
        st.session_state.pop("cooking", None)
        flash("Lageret er opdateret")
        st.rerun()
    if c2.button("Fortryd", key=f"cookno_{recipe['id']}", width="stretch"):
        st.session_state.pop("cooking", None)
        st.rerun()
