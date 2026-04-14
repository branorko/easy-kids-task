# Easy Kids Task – Home Assistant integrácia

Lovelace karta a backend integrácia pre správu domácich úloh pre deti.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

## Funkcie

- 👤 Správa osôb (členov domácnosti)
- 📋 Jednorazové a opakujúce sa úlohy (denne, týždenne, mesačne, ročne)
- ✅ Stavy: Treba spraviť → Urobená → Skontrolovaná
- 📅 Navigácia po dňoch, upozornenie na nesplnené úlohy z minulosti
- 🔐 PIN ochrana adminskej sekcie
- 💾 Dáta uložené v HA `.storage` – prežijú reštart aj zálohu HA
- 🔄 Zdieľané naprieč všetkými používateľmi a zariadeniami

## Inštalácia cez HACS

1. Otvor HACS → Integrácie → ⋮ → Vlastné repozitáre
2. Pridaj URL: `https://github.com/branorko/easy-kids-task`
3. Typ: **Integrácia**
4. Klikni **Inštalovať**
5. **Reštartuj Home Assistant**
6. Pridaj kartu do dashboardu:

```yaml
type: custom:ulohy-card
```

## Manuálna inštalácia

1. Stiahni poslednú verziu z [Releases](https://github.com/branorko/easy-kids-task/releases)
2. Skopíruj priečinok `custom_components/ulohy/` do `/config/custom_components/`
3. Reštartuj HA
4. Pridaj kartu do dashboardu (pozri vyššie)

## Použitie

- **Záložka Dnes** – zobrazí úlohy na vybraný deň, nesplnené z minulosti sú označené červenou
- **Záložka Osoby** – prehľad úloh každého člena domácnosti, kliknutím sa mení stav
- **Záložka ⚙** – admin sekcia (chránená PIN-om): správa osôb a úloh

## Licencia

MIT – voľne použiteľné a upraviteľné
