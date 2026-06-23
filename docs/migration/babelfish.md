# Babelfish als Migrationsbrücke

Babelfish ist kein Greenfield-Default. Jede Nutzung braucht:

- T-SQL-Kompatibilitätsanalyse
- Inventar von Stored Procedures, Jobs und Integrationen
- Portability Score
- Zielarchitektur für natives PostgreSQL
- Sunset-Datum
- Reconciliation- und Rollback-Tests

Die Migration muss zwei Dinge beweisen:

1. Die Legacy-Anwendung kann während der Übergangsphase laufen.
2. Die Daten können später exportiert und nativ in PostgreSQL betrieben werden.
