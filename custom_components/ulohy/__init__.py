"""Úlohy pre domácnosť – Home Assistant integrácia."""
from __future__ import annotations

import logging
import os

from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType
from homeassistant.helpers.storage import Store
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import HomeAssistantView

_LOGGER = logging.getLogger(__name__)

DOMAIN = "ulohy"
STORAGE_KEY = "ulohy.data"
STORAGE_VERSION = 1

DEFAULT_DATA = {
    "persons": [],
    "tasks": [],
    "adminPin": None,
    "settings": {
        "showChecked": False
    }
}


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Nastavenie integrácie pri štarte HA."""

    # --- Perzistentné úložisko ---
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    data = await store.async_load()
    if data is None:
        data = DEFAULT_DATA.copy()
        await store.async_save(data)
        _LOGGER.info("[ulohy] Vytvorené nové úložisko dát")
    else:
        _LOGGER.info("[ulohy] Načítané dáta z úložiska (%d osôb, %d úloh)",
                     len(data.get("persons", [])),
                     len(data.get("tasks", [])))

    hass.data[DOMAIN] = {
        "store": store,
        "data": data,
    }

    # --- Registrácia HTTP API ---
    hass.http.register_view(UlohyDataView(hass))

    # --- Registrácia frontendu (JS karta) ---
    js_path = os.path.join(os.path.dirname(__file__), "www", "ulohy-card.js")
    if os.path.isfile(js_path):
        url = f"/ulohy_static/ulohy-card.js"
        hass.http.register_static_path(url, js_path, cache_headers=False)
        add_extra_js_url(hass, url)
        _LOGGER.info("[ulohy] Frontend karta registrovaná: %s", url)
    else:
        _LOGGER.warning("[ulohy] ulohy-card.js nenájdená v %s", js_path)

    return True


class UlohyDataView(HomeAssistantView):
    """REST API endpoint pre čítanie a zápis dát úloh."""

    url = "/api/ulohy/data"
    name = "api:ulohy:data"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request):
        """Vráti aktuálne dáta."""
        from aiohttp.web import Response
        import json

        domain_data = self._hass.data.get(DOMAIN, {})
        data = domain_data.get("data", DEFAULT_DATA)
        return Response(
            text=json.dumps(data),
            content_type="application/json",
        )

    async def post(self, request):
        """Uloží nové dáta."""
        from aiohttp.web import Response
        import json

        try:
            body = await request.json()
        except Exception:
            return Response(
                text=json.dumps({"error": "Neplatný JSON"}),
                status=400,
                content_type="application/json",
            )

        domain_data = self._hass.data.get(DOMAIN, {})
        store: Store = domain_data.get("store")
        if store is None:
            return Response(
                text=json.dumps({"error": "Store nie je dostupný"}),
                status=500,
                content_type="application/json",
            )

        domain_data["data"] = body
        await store.async_save(body)
        _LOGGER.debug("[ulohy] Dáta uložené (%d osôb, %d úloh)",
                      len(body.get("persons", [])),
                      len(body.get("tasks", [])))

        return Response(
            text=json.dumps({"ok": True}),
            content_type="application/json",
        )
