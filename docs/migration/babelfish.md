# Babelfish als Migrationsbruecke

Babelfish ist kein Greenfield-Default. Jede Nutzung braucht:

- T-SQL-Kompatibilitaetsanalyse
- Inventar von Stored Procedures, Jobs und Integrationen
- Portability Score
- Zielarchitektur fuer natives PostgreSQL
- Sunset-Datum
- Reconciliation- und Rollback-Tests

Die Migration muss zwei Dinge beweisen:

1. Die Legacy-Anwendung kann waehrend der Uebergangsphase laufen.
2. Die Daten koennen spaeter exportiert und nativ in PostgreSQL betrieben werden.
