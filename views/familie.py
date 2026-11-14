import streamlit as st

from mymatti import core
from views.common import DISCLAIMER, flash, load_state, save_state, show_flash


def render() -> None:
    state = load_state()
    show_flash()
    st.title("👨‍👩‍👧 Familie & allergier")
    st.caption("Allergierne bruges i alle opskrifter, på lageret, på indkøbslisten og ved tilbagekaldte produkter.")

    for member in state["family"]:
        summary = [core.ALLERGENS[a]["label"].split(" (")[0] for a in member["allergies"] if a in core.ALLERGENS]
        summary += core.free_text_terms(member.get("other_allergies", ""))
        title = f"{member['name']} – {', '.join(summary) if summary else 'ingen allergier'}"
        with st.expander(title):
            _member_form(state, member)

    with st.expander("➕ Tilføj familiemedlem", expanded=not state["family"]):
        _member_form(state, None)

    st.warning(DISCLAIMER)

    st.subheader("Indstillinger")
    with st.form("settings"):
        persons = st.number_input("Antal personer I normalt laver mad til", 1, 20,
                                  int(state["settings"]["persons"]))
        url = st.text_input("Søge-link til Bilka ToGo", state["settings"]["bilka_url"],
                            help="{q} erstattes med varenavnet. Ret kun, hvis Bilka ændrer deres søgeside.")
        if st.form_submit_button("Gem indstillinger"):
            if "{q}" not in url:
                st.error("Linket skal indeholde {q}.")
            else:
                state["settings"].update({"persons": int(persons), "bilka_url": url.strip()})
                save_state(state)
                flash("Indstillinger gemt")
                st.rerun()


def _member_form(state: dict, member: dict | None) -> None:
    key = member["id"] if member else "new"
    with st.form(f"member_{key}", clear_on_submit=member is None):
        name = st.text_input("Navn", member["name"] if member else "")
        allergies = st.multiselect(
            "Allergier og intolerancer", list(core.ALLERGENS),
            default=[a for a in member["allergies"] if a in core.ALLERGENS] if member else [],
            format_func=lambda k: core.ALLERGENS[k]["label"],
        )
        other = st.text_input("Andre allergier (adskil med komma)",
                              member.get("other_allergies", "") if member else "",
                              placeholder="Fx kiwi, æble, koriander")
        dislikes = st.text_input("Kan ikke lide (ikke allergi)",
                                 member.get("dislikes", "") if member else "",
                                 placeholder="Fx svampe, oliven")
        c1, c2 = st.columns(2)
        save = c1.form_submit_button("Gem", type="primary", width="stretch")
        delete = c2.form_submit_button("Slet", width="stretch") if member else False

    if save:
        if not name.strip():
            st.error("Skriv et navn.")
            return
        data = {"name": name.strip(), "allergies": allergies, "other_allergies": other.strip(),
                "dislikes": dislikes.strip()}
        if member:
            member.update(data)
        else:
            state["family"].append({"id": core.new_id(), **data})
        # Gamle forslag er tjekket mod de gamle allergier – de skal ikke blive stående.
        state["suggestions"] = []
        save_state(state)
        flash(f"{data['name']} gemt")
        st.rerun()
    if delete:
        state["family"].remove(member)
        state["suggestions"] = []
        save_state(state)
        st.rerun()
