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
LOVELACE_RESOURCE_URL = "/ulohy_static/ulohy-card.js"
LOVELACE_RESOURCE_VERSION = 1

DEFAULT_DATA = {
    "persons": [],
    "tasks": [],
    "adminPin": None,
    "settings": {"showChecked": False}
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

    hass.data[DOMAIN] = {"store": store, "data": data}

    # --- Registrácia HTTP API ---
    hass.http.register_view(UlohyDataView(hass))

    # --- Registrácia statického JS súboru ---
    js_path = os.path.join(os.path.dirname(__file__), "www", "ulohy-card.js")
    if os.path.isfile(js_path):
        url = LOVELACE_RESOURCE_URL
        try:
            from homeassistant.components.http import StaticPathConfig
            await hass.http.async_register_static_paths([
                StaticPathConfig(url, js_path, cache_headers=False)
            ])
        except (ImportError, AttributeError):
            hass.http.register_static_path(url, js_path, cache_headers=False)
        add_extra_js_url(hass, url)
        _LOGGER.info("[ulohy] Frontend karta registrovaná: %s", url)
    else:
        _LOGGER.warning("[ulohy] ulohy-card.js nenájdená v %s", js_path)

    # --- Auto-registrácia Lovelace resource ---
    hass.async_create_task(_async_register_lovelace_resource(hass))

    return True


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Automaticky zaregistruje JS kartu v Lovelace resources."""
    try:
        lovelace = hass.data.get("lovelace")
        if lovelace is None:
            _LOGGER.debug("[ulohy] Lovelace nie je dostupné, preskakujem registráciu resources")
            return

        resource_url = f"{LOVELACE_RESOURCE_URL}?v={LOVELACE_RESOURCE_VERSION}"

        # Použijeme HA storage pre lovelace resources
        resources_store = Store(hass, 1, "lovelace_resources")
        resources_data = await resources_store.async_load() or {"items": []}
        items = resources_data.get("items", [])

        # Skontroluj či už existuje náš resource (s akoukoľvek verziou)
        existing = None
        for item in items:
            if LOVELACE_RESOURCE_URL in item.get("url", ""):
                existing = item
                break

        if existing is None:
            # Pridaj nový resource
            new_id = max((item.get("id", 0) for item in items), default=0) + 1
            items.append({
                "id": new_id,
                "type": "module",
                "url": resource_url
            })
            resources_data["items"] = items
            await resources_store.async_save(resources_data)
            _LOGGER.info("[ulohy] Lovelace resource pridaný: %s", resource_url)
        elif existing.get("url") != resource_url:
            # Aktualizuj verziu
            existing["url"] = resource_url
            await resources_store.async_save(resources_data)
            _LOGGER.info("[ulohy] Lovelace resource aktualizovaný: %s", resource_url)
        else:
            _LOGGER.debug("[ulohy] Lovelace resource už existuje: %s", resource_url)

    except Exception as e:
        _LOGGER.warning("[ulohy] Nepodarilo sa zaregistrovať Lovelace resource: %s", e)


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


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Nastavenie cez config entry (config_flow)."""
    return await async_setup(hass, {})


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """Odinštalovanie integrácie."""
    hass.data.pop(DOMAIN, None)
    return True
