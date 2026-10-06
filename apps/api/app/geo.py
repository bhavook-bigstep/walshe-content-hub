"""Curated location reference data (AC53).

A small, deterministic country → state/region → city hierarchy focused on the board's markets, so
the provider's New-entry form has real cascading dropdowns and the agent catalog's location filters
have a closed, consistent vocabulary. Not exhaustive by design (a PoC) — extend the dict to add
coverage; nothing else needs to change.
"""

from __future__ import annotations

from app.models.catalog import Season

# country -> state/region/county -> [cities/towns]
GEO: dict[str, dict[str, list[str]]] = {
    "Ireland": {
        "Galway": ["Galway City", "Clifden", "Salthill"],
        "Clare": ["Ennis", "Doolin", "Lahinch"],
        "Dublin": ["Dublin", "Dún Laoghaire", "Howth"],
        "Kerry": ["Killarney", "Dingle", "Tralee"],
        "Mayo": ["Westport", "Castlebar", "Achill"],
        "Donegal": ["Letterkenny", "Donegal Town", "Bundoran"],
        "Cork": ["Cork", "Kinsale", "Cobh"],
        "Sligo": ["Sligo", "Strandhill"],
    },
    "United Kingdom": {
        "Northern Ireland": ["Belfast", "Derry"],
        "Scotland": ["Edinburgh", "Glasgow"],
        "England": ["London", "Manchester"],
    },
    "Australia": {
        "New South Wales": ["Sydney", "Newcastle", "Byron Bay"],
        "Victoria": ["Melbourne", "Geelong", "Great Ocean Road"],
        "Queensland": ["Brisbane", "Cairns", "Gold Coast", "Port Douglas"],
        "Western Australia": ["Perth", "Margaret River", "Broome"],
        "South Australia": ["Adelaide", "Barossa Valley"],
        "Tasmania": ["Hobart", "Launceston"],
        "Northern Territory": ["Darwin", "Alice Springs", "Uluru"],
        "Australian Capital Territory": ["Canberra"],
    },
    "New Zealand": {
        "Auckland": ["Auckland"],
        "Otago": ["Queenstown", "Dunedin"],
        "Canterbury": ["Christchurch"],
    },
    "Germany": {
        "Bavaria": ["Munich", "Nuremberg"],
        "Berlin": ["Berlin"],
    },
}

# The fixed season vocabulary, in calendar order, as {value, label} for the filter UI.
SEASONS: list[dict[str, str]] = [
    {"value": Season.spring.value, "label": "Spring"},
    {"value": Season.summer.value, "label": "Summer"},
    {"value": Season.autumn.value, "label": "Autumn"},
    {"value": Season.winter.value, "label": "Winter"},
    {"value": Season.year_round.value, "label": "Year-round"},
]
