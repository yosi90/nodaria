-- Retira el antiguo tablón de ideas y errores y la cola de Notificapp (migración a la cuenta de
-- Yosiftware). El tablón se exportó en el corte y la plataforma lo importó en sus errores y
-- propuestas el 2026-10-15 (propuesta 3 de Nodaria); el plugin nodaria-api ya está desinstalado.
-- Copia previa: nodaria-backups/db/Nodaria-antes-de-0007-*.bak.
DROP TABLE IF EXISTS dbo.request_votes;
GO

DROP TABLE IF EXISTS dbo.request_updates;
GO

DROP TABLE IF EXISTS dbo.requests;
GO

DROP TABLE IF EXISTS dbo.notificapp_outbox;
