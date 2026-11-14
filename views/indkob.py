import streamlit as st

from mymatti import core
from views.common import DISCLAIMER, flash, load_state, save_state, show_flash


def render() -> None:
    state = load_state()
    if core.sync_staples(state):
        save_state(state)
    show_flash()
    profile = core.family_profile(state)

    st.title("🛒 Indkøb til Bilka ToGo")
    st.caption("Listen bygges af faste varer under minimum, manglende ingredienser fra opskrifter "
               "og det, I selv tilføjer. I gennemgår og bestiller selv hos Bilka ToGo.")

    with st.form("add_manual", clear_on_submit=True):
        c1, c2, c3 = st.columns([3, 2, 2])
        name = c1.text_input("Vare", placeholder="Fx havregryn")
        amount = c2.text_input("Mængde", placeholder="Fx 1 kg")
        category = c3.selectbox("Varegruppe", core.CATEGORIES, index=core.CATEGORIES.index("Andet"))
        if st.form_submit_button("Tilføj") and name.strip():
            core.add_shopping(state, name, amount, "", category)
            save_state(state)
            st.rerun()

    if not state["shopping"]:
        st.success("Indkøbslisten er tom.")
        return

    changed = False
    for category in core.CATEGORIES:
        entries = [e for e in state["shopping"] if e["category"] == category]
        if not entries:
            continue
        st.markdown(f"**{category}**")
        for entry in entries:
            c1, c2, c3 = st.columns([6, 3, 1], vertical_alignment="center")
            label = entry["name"] + (f" · {entry['amount']}" if entry.get("amount") else "")
            checked = c1.checkbox(label, value=entry["in_cart"], key=f"cart_{entry['id']}",
                                  help=entry.get("reason") or None)
            hits = core.check_text(entry["name"], profile)
            if hits:
                c1.caption("⚠️ " + "; ".join(hits))
            elif entry.get("reason"):
                c1.caption(entry["reason"])
            c2.link_button("Find hos Bilka", core.bilka_url(state, entry["name"]), width="stretch")
            if c3.button("✕", key=f"rm_{entry['id']}", help="Fjern fra listen"):
                state["shopping"].remove(entry)
                if entry["source"] == "auto":
                    # Ellers ville den faste vare straks blive lagt på listen igen.
                    for item in state["inventory"]:
                        if item["name"].lower() == entry["name"].lower():
                            item["min_qty"] = None
                    flash(f"{entry['name']} er ikke længere en fast vare")
                save_state(state)
                st.rerun()
            if checked != entry["in_cart"]:
                entry["in_cart"] = checked
                changed = True
    if changed:
        save_state(state)
        st.rerun()

    in_cart = [e for e in state["shopping"] if e["in_cart"]]
    st.caption(f"{len(in_cart)} af {len(state['shopping'])} lagt i kurven. Sæt flueben, når en vare er i kurven.")
    if profile["allergens"] or profile["other"]:
        st.caption(DISCLAIMER)

    st.divider()
    st.subheader("Gør bestillingen klar")
    st.markdown("**1. Læg varerne i kurven** – enten via *Find hos Bilka*-knapperne ovenfor, "
                "eller lad Claude gøre det med HandleMCP:")
    with st.expander("Lad Claude fylde kurven (HandleMCP)"):
        st.markdown(
            "[HandleMCP](https://handlemcp.dk/bilkatogo-api/) er et gratis open source-værktøj, som kører på "
            "din egen computer og lader Claude søge varer og fylde kurven hos Bilka ToGo med dit eget login. "
            "Det bestiller og betaler aldrig. Det er uofficielt og kan holde op med at virke uden varsel.\n\n"
            "Opsætning én gang (kræver [uv](https://docs.astral.sh/uv/) og Claude Code):")
        st.code("uvx handle-mcp@latest login bilkatogo\nclaude mcp add handle -- uvx handle-mcp@latest",
                language="bash")
        st.markdown("Kopiér derefter denne besked ind i Claude:")
        st.code(core.handle_prompt(state, profile), language=None)
    with st.expander("Indkøbslisten som tekst"):
        st.code(core.shopping_as_text(state), language=None)

    st.markdown("**2. Gennemgå kurven og bestil** hos Bilka ToGo – vælg tid og betal selv.")
    st.link_button("Åbn Bilka ToGo", "https://www.bilkatogo.dk/", type="primary")

    st.markdown("**3. Når bestillingen er gennemført**, lægges de afkrydsede varer på lageret:")
    amount = st.number_input("Hvad kom bestillingen på? (kr., valgfrit – bruges til månedsbudgettet)",
                             0.0, 100000.0, 0.0, step=50.0)
    if st.button(f"Bestilling gennemført – læg {len(in_cart)} vare(r) på lager", disabled=not in_cart):
        core.record_order(state, amount)
        count = core.receive_purchased(state)
        core.sync_staples(state)
        save_state(state)
        flash(f"{count} vare(r) lagt på lager. Ret mængder og datoer under Beholdning.")
        st.rerun()
