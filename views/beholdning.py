from datetime import date, datetime

import pandas as pd
import streamlit as st

from mymatti import ai, core
from views.common import flash, freshness_label, load_state, save_state, show_flash

COLS = ["id", "Vare", "Mængde", "Enhed", "Kategori", "Placering", "Udløber", "Minimum"]


def _to_date(value) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _frame(items: list[dict]) -> pd.DataFrame:
    rows = [{
        "id": i.get("id"), "Vare": i["name"], "Mængde": float(i["qty"]), "Enhed": i["unit"],
        "Kategori": i["category"], "Placering": i["location"], "Udløber": _to_date(i.get("expires")),
        "Minimum": i.get("min_qty"),
    } for i in items]
    df = pd.DataFrame(rows, columns=COLS)
    df["Mængde"] = df["Mængde"].astype(float)
    df["Minimum"] = df["Minimum"].astype(float)
    df["Udløber"] = pd.to_datetime(df["Udløber"]).dt.date
    return df


def _items(df: pd.DataFrame) -> list[dict]:
    out = []
    for row in df.to_dict("records"):
        name = row.get("Vare")
        if not isinstance(name, str) or not name.strip():
            continue
        expires = row.get("Udløber")
        item_id = row.get("id")
        out.append(core.make_item({
            "id": item_id if isinstance(item_id, str) else None,
            "name": name,
            "qty": 0 if pd.isna(row.get("Mængde")) else row["Mængde"],
            "unit": row.get("Enhed"), "category": row.get("Kategori"), "location": row.get("Placering"),
            "expires": expires.isoformat() if isinstance(expires, date) and not pd.isna(expires) else None,
            "min_qty": None if pd.isna(row.get("Minimum")) else row["Minimum"],
        }))
    return out


def _editor(df: pd.DataFrame, key: str) -> pd.DataFrame:
    return st.data_editor(
        df, key=key, hide_index=True, num_rows="dynamic", width="stretch",
        column_config={
            "id": None,
            "Vare": st.column_config.TextColumn(required=True),
            "Mængde": st.column_config.NumberColumn(min_value=0.0, format="%.2f", default=1.0),
            "Enhed": st.column_config.SelectboxColumn(options=core.UNITS, default="stk", required=True),
            "Kategori": st.column_config.SelectboxColumn(options=core.CATEGORIES, default="Andet", required=True),
            "Placering": st.column_config.SelectboxColumn(options=core.LOCATIONS, default="Kolonial", required=True),
            "Udløber": st.column_config.DateColumn(format="DD.MM.YYYY"),
            "Minimum": st.column_config.NumberColumn(
                min_value=0.0, format="%.2f",
                help="Fast vare: når beholdningen kommer under dette tal, ryger varen på indkøbslisten."),
        },
    )


def render() -> None:
    state = load_state()
    show_flash()
    st.title("🥕 Beholdning")

    _add_section(state)
    _pending_section(state)

    st.subheader("Det har vi")
    if not state["inventory"]:
        st.caption("Ingen varer endnu.")
    profile = core.family_profile(state)
    flagged = [(i["name"], core.check_text(i["name"], profile)) for i in state["inventory"]]
    flagged = [(n, h) for n, h in flagged if h]
    if flagged:
        with st.expander(f"⚠️ {len(flagged)} vare(r) på lager ser ud til at indeholde familiens allergener"):
            for name, hits in flagged:
                st.markdown(f"- **{name}**: {'; '.join(hits)}")
            st.caption("Disse varer bliver holdt ude af opskrifter til de berørte personer.")

    ordered = sorted(state["inventory"], key=lambda i: (core.days_left(i) is None, core.days_left(i) or 0))
    view = st.segmented_control("Visning", ["Kort", "Tabel"], default="Kort", key="inv_view",
                                label_visibility="collapsed")
    if view != "Tabel":
        _cards(state, ordered, {name for name, _ in flagged})
        return

    version = st.session_state.setdefault("inv_version", 0)
    original = _frame(ordered)
    edited = _editor(original, f"inv_{version}")
    st.caption("Ret direkte i tabellen. Tilføj en række nederst, eller markér rækker og slet dem. "
               "Varer med et **Minimum** er faste varer, som appen selv lægger på indkøbslisten.")
    if not edited.reset_index(drop=True).equals(original):
        state["inventory"] = _items(edited)
        core.sync_staples(state)
        save_state(state)
        st.session_state["inv_version"] = version + 1
        st.rerun()


# Hvor meget ét tryk på plus/minus ændrer, afhængigt af enheden.
STEP = {"g": 100.0, "ml": 100.0, "kg": 0.5, "l": 0.5}


def _cards(state: dict, ordered: list[dict], flagged: set[str]) -> None:
    """Lageret som kort – ét pr. vare – så det kan bruges med én hånd på telefonen."""
    where = st.segmented_control("Placering", ["Alle"] + core.LOCATIONS, default="Alle", key="inv_where",
                                 label_visibility="collapsed") or "Alle"
    shown = [i for i in ordered if where == "Alle" or i["location"] == where]
    if state["inventory"] and not shown:
        st.caption(f"Ingen varer i {where.lower()}.")
    for item in shown:
        step = STEP.get(item["unit"], 1.0)
        with st.container(border=True, key=f"card_{item['id']}"):
            warn = " ⚠️" if item["name"] in flagged else ""
            details = [item["location"], freshness_label(item)]
            if item.get("min_qty"):
                details.append(f"📌 minimum {core.fmt_qty(item['min_qty'], item['unit'])}")
            st.markdown(f"**{item['name']}**{warn} · {core.fmt_qty(item['qty'], item['unit'])}  \n"
                        f"<span class='mm-fresh'>{' · '.join(d for d in details if d)}</span>",
                        unsafe_allow_html=True)
            with st.container(horizontal=True, key=f"cardrow_{item['id']}"):
                if st.button("−", key=f"minus_{item['id']}", help=f"Brugt {core.fmt_qty(step, item['unit'])}"):
                    core.deduct(state, item["id"], step)
                    _commit(state)
                if st.button("＋", key=f"plus_{item['id']}", help=f"Læg {core.fmt_qty(step, item['unit'])} til"):
                    item["qty"] = round(item["qty"] + step, 3)
                    _commit(state)
                with st.popover("Ret"):
                    _edit_form(state, item)


def _commit(state: dict, message: str | None = None) -> None:
    core.sync_staples(state)
    save_state(state)
    if message:
        flash(message)
    st.rerun()


def _edit_form(state: dict, item: dict) -> None:
    with st.form(f"edit_{item['id']}"):
        name = st.text_input("Vare", item["name"])
        c1, c2 = st.columns(2)
        qty = c1.number_input("Mængde", 0.0, 100000.0, float(item["qty"]), step=STEP.get(item["unit"], 1.0))
        unit = c2.selectbox("Enhed", core.UNITS, index=core.UNITS.index(item["unit"]))
        location = st.selectbox("Placering", core.LOCATIONS, index=core.LOCATIONS.index(item["location"]))
        category = st.selectbox("Kategori", core.CATEGORIES, index=core.CATEGORIES.index(item["category"]))
        no_date = st.checkbox("Ingen udløbsdato", value=not item.get("expires"))
        expires = st.date_input("Udløber", _to_date(item.get("expires")) or date.today(), format="DD.MM.YYYY")
        minimum = st.number_input("Minimum (fast vare – 0 for ikke fast)", 0.0, 100000.0,
                                  float(item.get("min_qty") or 0))
        c3, c4 = st.columns(2)
        save = c3.form_submit_button("Gem", type="primary", width="stretch")
        delete = c4.form_submit_button("Slet vare", width="stretch")
    if save and name.strip():
        updated = core.make_item({
            "id": item["id"], "name": name, "qty": qty, "unit": unit, "location": location,
            "category": category, "expires": None if no_date else expires.isoformat(), "min_qty": minimum,
        })
        updated["qty"] = qty  # make_item behandler 0 som "ukendt"
        item.update(updated)
        _commit(state, f"{updated['name']} opdateret")
    if delete:
        state["inventory"] = [i for i in state["inventory"] if i["id"] != item["id"]]
        _commit(state, f"{item['name']} slettet")


def _add_section(state: dict) -> None:
    st.subheader("Tilføj varer")
    tab_text, tab_photo, tab_staple = st.tabs(["✍️ Skriv", "📷 Foto af køleskab eller bon", "📌 Fast vare"])

    with tab_text:
        with st.form("add_text", clear_on_submit=True):
            text = st.text_area(
                "Hvad har I?", height=110,
                placeholder="Fx: 2 l havremælk, 400 g kyllingebryst, ris, 3 dåser flåede tomater, løg",
                help="Du kan også indsætte teksten fra en ordrebekræftelse fra Bilka ToGo.",
            )
            submitted = st.form_submit_button("Fortolk varer", type="primary")
        if submitted and text.strip():
            items = None
            if ai.available():
                try:
                    with st.spinner("Læser listen…"):
                        items = ai.parse_items_text(text)
                except ai.AIError as exc:
                    st.warning(f"{exc} Bruger simpel tolkning i stedet.")
            if items is None:
                items = core.parse_text(text)
            st.session_state["pending"] = [core.make_item(i) for i in items]
            st.session_state["pending_version"] = st.session_state.get("pending_version", 0) + 1

    with tab_staple:
        st.caption("Faste varer skal altid være i huset. Kommer beholdningen under minimum, "
                   "lægger appen dem selv på indkøbslisten.")
        with st.form("add_staple", clear_on_submit=True):
            c1, c2, c3, c4 = st.columns([3, 2, 2, 2])
            name = c1.text_input("Vare", placeholder="Fx havregryn")
            have = c2.number_input("Har nu", 0.0, 1000.0, 0.0, step=1.0)
            minimum = c3.number_input("Minimum", 0.0, 1000.0, 1.0, step=1.0)
            unit = c4.selectbox("Enhed", core.UNITS, index=core.UNITS.index("pk"))
            if st.form_submit_button("Tilføj fast vare") and name.strip() and minimum > 0:
                existing = next((i for i in state["inventory"] if i["name"].lower() == name.strip().lower()), None)
                if existing:
                    existing["min_qty"] = minimum
                else:
                    state["inventory"].append(core.make_item(
                        {"name": name, "qty": have, "unit": unit, "min_qty": minimum, "category": "Kolonial"}))
                    state["inventory"][-1]["qty"] = have  # make_item behandler 0 som "ukendt"
                core.sync_staples(state)
                save_state(state)
                st.session_state["inv_version"] = st.session_state.get("inv_version", 0) + 1
                flash(f"{name.strip()} er nu en fast vare")
                st.rerun()

    with tab_photo:
        if not ai.available():
            st.info("Foto-genkendelse kræver, at AI er sat op (se README).")
            return
        kind = st.radio("Hvad viser billedet?", ["Køleskab/skab", "Kassebon"], horizontal=True)
        upload = st.file_uploader("Vælg eller tag et billede", type=["jpg", "jpeg", "png", "webp"])
        if upload and st.button("Find varer på billedet", type="primary"):
            try:
                with st.spinner("Kigger på billedet…"):
                    items = ai.parse_items_image(upload.getvalue(), upload.type or "image/jpeg",
                                                 "bon" if kind == "Kassebon" else "koleskab")
            except ai.AIError as exc:
                st.error(str(exc))
            else:
                st.session_state["pending"] = [core.make_item(i) for i in items]
                st.session_state["pending_version"] = st.session_state.get("pending_version", 0) + 1


def _pending_section(state: dict) -> None:
    pending = st.session_state.get("pending")
    if pending is None:
        return
    if not pending:
        st.warning("Der blev ikke fundet nogen varer. Prøv at skrive dem på en anden måde.")
        st.session_state.pop("pending")
        return
    with st.container(border=True):
        st.markdown("**Tjek varerne, før de lægges på lager**")
        st.caption("Mængde og holdbarhed er et skøn. Sæt den rigtige dato på **kød og mejeri** – resten kan stå.")
        edited = _editor(_frame(pending), f"pending_{st.session_state.get('pending_version', 0)}")
        col_ok, col_cancel = st.columns(2)
        if col_ok.button("Læg på lager", type="primary", width="stretch"):
            items = _items(edited)
            for item in items:
                item.pop("id", None)
                core.add_item(state, item)
            core.sync_staples(state)
            save_state(state)
            st.session_state.pop("pending")
            st.session_state["inv_version"] = st.session_state.get("inv_version", 0) + 1
            flash(f"{len(items)} vare(r) lagt på lager")
            st.rerun()
        if col_cancel.button("Fortryd", width="stretch"):
            st.session_state.pop("pending")
            st.rerun()
