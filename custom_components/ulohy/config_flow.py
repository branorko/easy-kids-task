"""Config flow pre Úlohy integráciu."""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
import voluptuous as vol

DOMAIN = "ulohy"


class UlohyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Jednoduchý config flow — žiadne vstupy nie sú potrebné."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Prvý krok — okamžite vytvorí entry."""
        # Zabraň duplicitnej inštalácii
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="Úlohy pre domácnosť", data={})

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({}),
            description_placeholders={},
        )
