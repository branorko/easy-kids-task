"""Úlohy pre domácnosť – Home Assistant integrácia."""
from __future__ import annotations

import logging
import os
import uuid

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
LOVELACE_RESOURCE_VERSION = 3   # zvýšiť pri každom release JS

DEFAULT_DATA = {
    "persons": [],
    "tasks": [],
    "permanentTasks": [],
    "adminPin": None,
    "settings": {"showChecked": False}
}

_SETUP_DONE = False   # guard proti dvojitej inicializácii


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Nastavenie integrácie pri štarte HA."""
    global _SETUP_DONE
    if _SETUP_DONE:
        _LOGGER.debug("[ulohy] async_setup už prebehol, preskakujem")
        return True
    _SETUP_DONE = True

    # --- Perzistentné úložisko ---
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load()
    if data is None:
        data = DEFAULT_DATA.copy()
        await store.async_save(data)
        _LOGGER.info("[ulohy] Vytvorené nové úložisko dát")
    else:
        # Migrácia: pridaj nové polia ak chýbajú
        changed = False
        if "permanentTasks" not in data:
            data["permanentTasks"] = []
            changed = True
        if "pointsLog" not in data:
            data["pointsLog"] = {}
            changed = True
        # Migrácia bodov na osobách
        for p in data.get("persons", []):
            if "points" not in p:
                p["points"] = 0
                changed = True
        if changed:
            await store.async_save(data)
        _LOGGER.info("[ulohy] Načítané dáta z úložiska (%d osôb, %d úloh, %d permanentných)",
                     len(data.get("persons", [])),
                     len(data.get("tasks", [])),
                     len(data.get("permanentTasks", [])))

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

    # --- Auto-registrácia Lovelace resource – čakáme kým HA plne naštartuje ---
    async def _register_when_ready(event=None):
        await _async_register_lovelace_resource(hass)

    hass.bus.async_listen_once("homeassistant_started", _register_when_ready)

    return True


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Automaticky zaregistruje JS kartu v Lovelace resources."""
    try:
        resource_url = f"{LOVELACE_RESOURCE_URL}?v={LOVELACE_RESOURCE_VERSION}"
        resources_store = Store(hass, 1, "lovelace_resources")
        resources_data = await resources_store.async_load() or {"items": []}
        items = resources_data.get("items", [])

        existing = next(
            (item for item in items if LOVELACE_RESOURCE_URL in item.get("url", "")),
            None
        )

        if existing is None:
            items.append({"id": uuid.uuid4().hex, "type": "module", "url": resource_url})
            resources_data["items"] = items
            await resources_store.async_save(resources_data)
            _LOGGER.info("[ulohy] Lovelace resource pridaný: %s", resource_url)
        elif existing.get("url") != resource_url:
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
        """Vráti aktuálne dáta priamo zo Store (nie z cache)."""
        from aiohttp.web import Response
        import json

        domain_data = self._hass.data.get(DOMAIN, {})
        store: Store = domain_data.get("store")
        if store:
            data = await store.async_load() or DEFAULT_DATA
        else:
            data = domain_data.get("data", DEFAULT_DATA)
        return Response(text=json.dumps(data), content_type="application/json")

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

        return Response(text=json.dumps({"ok": True}), content_type="application/json")


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Nastavenie cez config entry (config_flow)."""
    return await async_setup(hass, {})


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """Odinštalovanie integrácie."""
    global _SETUP_DONE
    _SETUP_DONE = False
    hass.data.pop(DOMAIN, None)
    return True
