import streamlit as st

from mymatti import ai, core, recalls, storage
from views.common import DISCLAIMER, freshness_label, load_state, save_state, show_flash


@st.cache_data(ttl=3600, show_spinner=False)
def _recalls() -> list[dict]:
    return recalls.fetch()


def render() -> None:
    state = load_state()
    if core.sync_staples(state):
        save_state(state)
    show_flash()

    st.title("Mymatti")
    st.caption("Brug det I har, køb det I mangler – og pas på allergierne.")

    soon = core.expiring(state, 3)
    low = core.low_stock(state)
    in_stock = len([i for i in state["inventory"] if i["qty"] > 0])
    stats = [("På lager", in_stock, ""), ("Brug snart", len(soon), "warn" if soon else ""),
             ("Mangler", len(low), "alert" if low else ""), ("Indkøb", len(state["shopping"]), "")]
    st.markdown('<div class="mm-stats">' + "".join(
        f'<div class="mm-stat {cls}"><b>{value}</b><span>{label}</span></div>' for label, value, cls in stats
    ) + "</div>", unsafe_allow_html=True)

    budget = state["settings"].get("budget_month") or 0
    if budget:
        spent = core.month_spent(state)
        st.progress(min(spent / budget, 1.0),
                    text=f"Madbudget denne måned: {spent:,.0f} af {budget:,.0f} kr. brugt".replace(",", "."))
        if spent > budget:
            st.warning(f"I er {spent - budget:,.0f} kr. over månedens budget.".replace(",", "."))

    if not state["family"]:
        st.warning("Start med at indtaste familiens allergier under **Familie & allergier**, "
                   "så opskrifterne tager højde for dem.")
    if not state["inventory"]:
        st.info("Lageret er tomt. Gå til **Beholdning** og skriv, hvad I har i køleskab, fryser og skabe.")

    profile = core.family_profile(state)
    _render_recalls(state, profile)

    if soon:
        st.subheader("Brug først")
        for item in soon:
            st.markdown(f"- **{item['name']}** · {core.fmt_qty(item['qty'], item['unit'])} · "
                        f"{item['location']} · {freshness_label(item)}")
        st.caption("Under **Opskrifter** bliver disse varer prioriteret.")

    if low:
        st.subheader("Faste varer, der er ved at slippe op")
        for item in low:
            st.markdown(f"- **{item['name']}** · har {core.fmt_qty(item['qty'], item['unit'])}, "
                        f"minimum {core.fmt_qty(item['min_qty'], item['unit'])}")
        st.caption("De er lagt på indkøbslisten automatisk.")

    if profile["allergens"] or profile["other"]:
        st.subheader("Familiens allergier")
        for key, who in profile["allergens"].items():
            st.markdown(f"- {core.ALLERGENS[key]['label']} – {', '.join(who)}")
        for term, who in profile["other"].items():
            st.markdown(f"- {term.capitalize()} – {', '.join(who)}")
        st.caption(DISCLAIMER)

    st.divider()
    ai_status = "tilsluttet" if ai.available() else "ikke sat op (se README)"
    st.caption(f"Data gemmes i: {storage.backend_name()} · AI: {ai_status}")
    if storage.backend_name() == "lokal fil":
        st.caption("⚠️ Lokal fil forsvinder, når en hostet app genstarter. Sæt Supabase op for varig lagring.")


def _render_recalls(state: dict, profile: dict) -> None:
    try:
        feed = _recalls()
    except Exception:
        st.caption("Kunne ikke hente tilbagekaldte produkter fra Fødevarestyrelsen lige nu.")
        return
    hits = recalls.relevant(feed, state, profile)
    if hits:
        st.subheader("⚠️ Tilbagekaldte produkter, der kan vedrøre jer")
        for hit in hits:
            why = []
            if hit["items"]:
                why.append("matcher jeres varer: " + ", ".join(hit["items"]))
            if hit["allergens"]:
                why.append("udeklareret allergen: " + ", ".join(hit["allergens"]))
            when = hit["published"].strftime("%d.%m.%Y") if hit["published"] else ""
            st.warning(f"**[{hit['title']}]({hit['link']})** {when}\n\n{hit['description']}\n\n"
                       f"_{'; '.join(why).capitalize()}_")
        st.caption("Matchet er lavet på varenavn. Tjek mærke, batch og dato i Fødevarestyrelsens opslag.")
    with st.expander(f"Seneste tilbagekald fra Fødevarestyrelsen ({len(feed)} de sidste 60 dage)"):
        for recall in feed[:15]:
            when = recall["published"].strftime("%d.%m") if recall["published"] else ""
            st.markdown(f"- {when} · [{recall['title']}]({recall['link']})")
        st.markdown(f"[Se alle tilbagekald]({recalls.PAGE_URL})")
