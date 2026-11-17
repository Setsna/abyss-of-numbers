# Schriften

| Datei | Herkunft | Verwendung |
|---|---|---|
| `bangers-regular.woff` | Bangers (Open Font License 1.1, `OFL-Bangers.txt`), zugeschnitten | Lautwörter und Titel |
| `aon-text-regular.woff`, `aon-text-bold.woff` | Andika von SIL International (Open Font License 1.1, `OFL-Andika.txt`), zugeschnitten | Rechnung, Antworten, Karten, alle Texte |

- Originale unverändert in `source/` (Quelle: github.com/google/fonts, Ordner `ofl/bangers` und `ofl/andika`, geladen am 17.11.2026). Für die Godot-Portierung die Originale verwenden.
- Zuschnitt mit fontTools auf: Grundlatein, Latin-1 (Umlaute, ß, ·, ×, ÷), Gedankenstriche, deutsche Anführungszeichen, Auslassungspunkte, Minuszeichen U+2212, Aufzählungspunkt.
- Andika hat den reservierten Schriftnamen „Andika“. Eine zugeschnittene Fassung ist laut Lizenz eine veränderte Fassung und darf den Namen nicht tragen; sie heißt deshalb intern „AoN Text“.
