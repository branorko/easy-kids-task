"""Úlohy pre domácnosť – Home Assistant integrácia."""
from __future__ import annotations

import json
import logging
import os
import uuid

from homeassistant.core import CoreState, HomeAssistant
from homeassistant.helpers.typing import ConfigType
from homeassistant.helpers.storage import Store
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import HomeAssistantView

_LOGGER = logging.getLogger(__name__)

DOMAIN = "ulohy"
STORAGE_KEY = "ulohy.data"
STORAGE_VERSION = 1
LOVELACE_RESOURCE_URL = "/ulohy_static/ulohy-card.js"

DEFAULT_DATA = {
    "persons": [],
    "tasks": [],
    "permanentTasks": [],
    "pointsLog": {},
    "adminPin": None,
    "settings": {"showChecked": False}
}

_SETUP_DONE = False


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    global _SETUP_DONE
    if _SETUP_DONE:
        return True
    _SETUP_DONE = True

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load()
    if data is None:
        data = DEFAULT_DATA.copy()
        await store.async_save(data)
    else:
        changed = False
        for key in ("permanentTasks", "pointsLog"):
            if key not in data:
                data[key] = [] if key == "permanentTasks" else {}
                changed = True
        for p in data.get("persons", []):
            if "points" not in p:
                p["points"] = 0
                changed = True
        if changed:
            await store.async_save(data)

    hass.data[DOMAIN] = {"store": store, "data": data}
    hass.http.register_view(UlohyDataView(hass))

    js_path = os.path.join(os.path.dirname(__file__), "www", "ulohy-card.js")
    if os.path.isfile(js_path):
        try:
            from homeassistant.components.http import StaticPathConfig
            await hass.http.async_register_static_paths([
                StaticPathConfig(LOVELACE_RESOURCE_URL, js_path, cache_headers=False)
            ])
        except (ImportError, AttributeError):
            hass.http.register_static_path(LOVELACE_RESOURCE_URL, js_path, cache_headers=False)
        add_extra_js_url(hass, LOVELACE_RESOURCE_URL)

    async def _register_when_ready(event=None):
        await _async_register_lovelace_resource(hass)

    if hass.state is CoreState.running:
        # integrácia sa načítala až po štarte (napr. reload) – event už nepríde
        hass.async_create_task(_register_when_ready())
    else:
        hass.bus.async_listen_once("homeassistant_started", _register_when_ready)

    _LOGGER.info("[ulohy] v%s načítaná", await hass.async_add_executor_job(_read_version))
    return True


def _read_version() -> str:
    """Verzia z manifest.json – jediný zdroj pravdy pre číslovanie."""
    try:
        path = os.path.join(os.path.dirname(__file__), "manifest.json")
        with open(path, encoding="utf-8") as f:
            return str(json.load(f).get("version", "0"))
    except Exception:  # noqa: BLE001
        return "0"


def _find_resources_collection(hass: HomeAssistant):
    """Živá kolekcia Lovelace zdrojov (None ak dashboardy bežia v YAML režime)."""
    ll = hass.data.get("lovelace")
    if ll is None:
        return None
    res = ll.get("resources") if isinstance(ll, dict) else getattr(ll, "resources", None)
    return res if hasattr(res, "async_create_item") else None


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Zaregistruje / aktualizuje zdroj karty. Verzia v URL = verzia z manifest.json."""
    version = await hass.async_add_executor_job(_read_version)
    resource_url = f"{LOVELACE_RESOURCE_URL}?v={version}"

    # 1) Preferované: priamo cez živú kolekciu HA – zmena sa prejaví hneď a HA ju
    #    nemôže neskôr prepísať svojou kópiou v pamäti.
    try:
        resources = _find_resources_collection(hass)
        if resources is not None:
            if not getattr(resources, "loaded", True):
                await resources.async_load()
                resources.loaded = True
            existing = next(
                (i for i in resources.async_items() if LOVELACE_RESOURCE_URL in i.get("url", "")),
                None,
            )
            if existing is None:
                await resources.async_create_item({"res_type": "module", "url": resource_url})
                _LOGGER.info("[ulohy] Lovelace resource pridaný: %s", resource_url)
            elif existing.get("url") != resource_url:
                await resources.async_update_item(
                    existing["id"], {"res_type": "module", "url": resource_url}
                )
                _LOGGER.info("[ulohy] Lovelace resource aktualizovaný: %s", resource_url)
            else:
                _LOGGER.info("[ulohy] Lovelace resource je aktuálny: %s", resource_url)
            return
    except Exception as e:  # noqa: BLE001
        _LOGGER.warning("[ulohy] Registrácia cez živú kolekciu zlyhala (%s), skúšam súbor", e)

    # 2) Záloha: zápis priamo do .storage/lovelace_resources
    try:
        resources_store = Store(hass, 1, "lovelace_resources")
        resources_data = await resources_store.async_load() or {"items": []}
        items = resources_data.get("items", [])
        existing = next((i for i in items if LOVELACE_RESOURCE_URL in i.get("url", "")), None)

        if existing is None:
            items.append({"id": uuid.uuid4().hex, "type": "module", "url": resource_url})
            resources_data["items"] = items
            await resources_store.async_save(resources_data)
            _LOGGER.info("[ulohy] Lovelace resource pridaný (súbor): %s", resource_url)
        elif existing.get("url") != resource_url:
            existing["url"] = resource_url
            await resources_store.async_save(resources_data)
            _LOGGER.info("[ulohy] Lovelace resource aktualizovaný (súbor): %s", resource_url)
        else:
            _LOGGER.info("[ulohy] Lovelace resource je aktuálny (súbor): %s", resource_url)
    except Exception as e:  # noqa: BLE001
        _LOGGER.warning("[ulohy] Registrácia resource zlyhala: %s", e)


class UlohyDataView(HomeAssistantView):
    url = "/api/ulohy/data"
    name = "api:ulohy:data"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request):
        from aiohttp.web import Response
        import json
        domain_data = self._hass.data.get(DOMAIN, {})
        store = domain_data.get("store")
        data = await store.async_load() if store else domain_data.get("data", DEFAULT_DATA)
        return Response(text=json.dumps(data or DEFAULT_DATA), content_type="application/json")

    async def post(self, request):
        from aiohttp.web import Response
        import json
        try:
            body = await request.json()
        except Exception:
            return Response(text=json.dumps({"error": "Neplatný JSON"}), status=400, content_type="application/json")
        domain_data = self._hass.data.get(DOMAIN, {})
        store = domain_data.get("store")
        if store is None:
            return Response(text=json.dumps({"error": "Store nedostupný"}), status=500, content_type="application/json")
        domain_data["data"] = body
        await store.async_save(body)
        return Response(text=json.dumps({"ok": True}), content_type="application/json")


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    return await async_setup(hass, {})


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    global _SETUP_DONE
    _SETUP_DONE = False
    hass.data.pop(DOMAIN, None)
    return True
