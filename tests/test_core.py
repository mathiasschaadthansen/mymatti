from datetime import date, timedelta

import pytest

from mymatti import core


@pytest.mark.parametrize("text,expected", [
    ("Sødmælk", {"maelk"}), ("Kokosmælk", set()), ("Havredrik", {"gluten"}),
    ("Revet ost", {"maelk"}), ("Toast", set()), ("Smør", {"maelk"}),
    ("Jordnøddesmør", {"jordnoedder"}), ("Æg", {"aeg"}), ("Aubergine/ægplante", set()),
    ("Pålæg", set()), ("Hvedemel", {"gluten"}), ("Majsmel", set()), ("Boghvedemel", set()),
    ("Glutenfri pasta", set()), ("Spaghetti", {"gluten"}), ("Karamel", set()),
    ("Muskatnød", set()), ("Hasselnødder", {"noedder"}), ("Mandler", {"noedder"}),
    ("Laks", {"fisk"}), ("Rejer", {"krebsdyr"}), ("Tahin", {"sesam"}),
    ("Sojasauce", {"soja", "gluten"}), ("Kartofler", set()), ("Ris", set()), ("Løg", set()),
    ("Laktosefri mælk", {"maelk"}), ("Vegansk ost", set()), ("Piskefløde", {"maelk"}),
    ("Æggeplante", set()), ("Hakket oksekød", set()), ("Rugbrød", {"gluten"}),
])
def test_allergens_in(text, expected):
    assert core.allergens_in(text) == expected


def _state():
    s = core.empty_state()
    s["family"] = [
        {"id": "a", "name": "Emma", "allergies": ["maelk"], "other_allergies": "kiwi", "dislikes": "svampe"},
        {"id": "b", "name": "Far", "allergies": [], "other_allergies": "", "dislikes": ""},
    ]
    return s


def test_profile_and_recipe_check():
    s = _state()
    profile = core.family_profile(s)
    assert profile["allergens"] == {"maelk": ["Emma"]}
    recipe = {"title": "Pasta", "ingredients": [{"name": "Piskefløde"}, {"name": "Kiwi"}], "allergens": []}
    hits = core.check_recipe(recipe, profile)
    assert len(hits) == 2 and "Mælk" in hits[0] and "Kiwi" in hits[1]
    assert core.check_recipe(recipe, core.family_profile(s, ["b"])) == []
    # AI-angivne allergener tæller også, selv om ordlisten ikke fanger dem
    assert core.check_recipe({"title": "X", "ingredients": [], "allergens": ["maelk"]}, profile)


def test_parse_text():
    items = core.parse_text("2 l mælk, 500g hakket oksekød\n3 æg; ris, 1,5 kg kartofler")
    assert [(i["name"], i["qty"], i["unit"]) for i in items] == [
        ("Mælk", 2, "l"), ("Hakket oksekød", 500, "g"), ("Æg", 3, "stk"), ("Ris", 1, "stk"),
        ("Kartofler", 1.5, "kg"),
    ]


def test_inventory_merge_deduct_and_staples():
    s = _state()
    core.add_item(s, {"name": "Mælk", "qty": 1, "unit": "l", "location": "Køleskab", "min_qty": 2,
                      "expires": "2030-01-10"})
    core.add_item(s, {"name": "mælk", "qty": 5, "unit": "dl", "location": "Køleskab", "expires": "2030-01-05"})
    assert len(s["inventory"]) == 1
    milk = s["inventory"][0]
    assert milk["qty"] == 1.5 and milk["expires"] == "2030-01-05"

    assert core.sync_staples(s) is True
    assert s["shopping"][0]["name"] == "Mælk" and s["shopping"][0]["amount"] == "mindst 0,5 l"
    assert core.sync_staples(s) is False

    core.deduct(s, milk["id"], 5)
    assert s["inventory"][0]["qty"] == 0  # fast vare bliver stående
    core.sync_staples(s)
    assert s["shopping"][0]["amount"] == "mindst 2 l"

    core.add_shopping(s, "Bananer", "6 stk", "Frugt", "Frugt & grønt")
    for e in s["shopping"]:
        e["in_cart"] = True
    assert core.receive_purchased(s) == 2
    assert s["shopping"] == []
    assert {i["name"]: (i["qty"], i["unit"], i["location"]) for i in s["inventory"]} == {
        "Mælk": (2, "l", "Køleskab"), "Bananer": (6, "stk", "Køleskab")}
    assert core.sync_staples(s) is False and s["shopping"] == []

    core.add_item(s, {"name": "Ris", "qty": 1, "unit": "kg"})
    rice = s["inventory"][-1]
    core.deduct(s, rice["id"], 1)
    assert rice not in s["inventory"]


def test_expiring_and_bilka_url():
    s = _state()
    soon = (date.today() + timedelta(days=1)).isoformat()
    core.add_item(s, {"name": "Kylling", "expires": soon})
    core.add_item(s, {"name": "Pasta"})
    assert [i["name"] for i in core.expiring(s)] == ["Kylling"]
    assert core.bilka_url(s, "hakket oksekød") == "https://www.bilkatogo.dk/s/?query=hakket%20oksek%C3%B8d"


def test_free_text_aliases_budget_and_prompt():
    s = _state()
    s["family"][0]["other_allergies"] = "oksekød, græskar"
    profile = core.family_profile(s)
    for text in ["Hakkebøf", "Oksebouillon", "Kalvefond", "Hokkaido", "Græskarkerner"]:
        assert core.check_text(text, profile), text
    for text in ["Kyllingebryst", "Squash", "Plantesmør", "Havremælk", "Knækbrød"]:
        assert not core.check_text(text, profile), text

    core.record_order(s, 850.5, date(2026, 11, 3))
    core.record_order(s, 400, date(2026, 10, 30))
    core.record_order(s, 0, date(2026, 11, 4))
    assert core.month_spent(s, date(2026, 11, 14)) == 850.5

    core.add_shopping(s, "Havregryn", "1 kg")
    prompt = core.handle_prompt(s, profile)
    assert "økologisk" in prompt and "spor af' er i orden" in prompt and "oksekød" in prompt
    assert "ikke bestille eller betale" in prompt
