# Hooshyar POS shared-state API

This PHP API is the shared synchronization endpoint for the Windows Electron and Android apps. The client UI is packaged on-device; this server is only the common API/database service. The POS remains usable from its local store if the API or internet is unavailable. Clients upload whole versioned snapshots with a durable operation ID; the API records acknowledgments transactionally, so retrying after a lost response is idempotent. It uses optimistic revision checks and returns a conflict instead of silently overwriting a newer server version.

## Database support

- MySQL/MariaDB through PDO (`pdo_mysql`).
- SQL Server 2014+ through Microsoft PDO_SQLSRV (`pdo_sqlsrv`). The PHP host must have the matching Microsoft ODBC driver installed.
- The API creates a single `hooshyar_sync_state` row/table on first request. This is a versioned JSON snapshot store, not yet a normalized reporting schema.

## PHP CLI in the repository sandbox

Run `php -v`, `php -l backend/php/api.php`, or `./tools/php -v`. The repository helper downloads/runs the PHP 8.5.12 WebAssembly CLI via npm; it supplies a real PHP CLI/linter here without installing a system package. It is not a native PHP-FPM/Apache deployment and does not replace testing against a live DB. On a normal host with PHP installed, use the system `php` command instead.

## Run PHP API locally

To verify PHP and the API route, run `php -S 0.0.0.0:8088 -t backend/php` from the repository root, then request `http://localhost:8088/api.php?op=status`. Without a server `config.php`, the expected response is HTTP 503 with a setup message. This server alone does not enable synchronization until a supported database and token are configured.

## Run the shared API and MySQL in Docker

The repository includes PHP 8.3 + Apache + MySQL 8.4. The PHP container exposes the API only; Windows and Android continue running the UI locally:

1. From the repository root, copy `.env.example` to `.env` and replace the example passwords/tokens with unique random values. For example, generate values using `openssl rand -hex 32`.
2. Run `docker compose up --build -d`.
3. On each Android/Electron app, set API URL to `http://<server-LAN-address>:8080/api.php` for local testing (use a real HTTPS domain in production), and enter the same `HOOSHYAR_API_TOKEN`. Do not enter `localhost` on a phone; it means the phone itself.
4. Select the same backend and **offline + sync** mode on devices that share data; press **Test connection**, then **Sync now**. For a fully separate Android installation, choose **standalone offline** instead. The API token and endpoint stay local on each device.
5. Verify the MySQL volume persists after restarting containers. Stop with `docker compose down`; `docker compose down -v` permanently deletes the local test database.

The compose stack is for local development only; do not expose its plain HTTP port to the public internet. Deploy behind HTTPS for real use.

## Install manually / production

1. Serve this directory through PHP 7.4+ and HTTPS. Set `api.php` as the endpoint in the app.
2. Copy `config.example.php` to `config.php` on the server (the real file is git-ignored), or provide the documented `HOOSHYAR_*` environment variables.
3. Set `HOOSHYAR_DB_DRIVER` to `mysql` or `sqlsrv`; fill host, database, user and password only on the PHP server.
4. Generate a random API token of at least 32 characters and set `HOOSHYAR_API_TOKEN`.
5. Create an empty database and grant the configured account permission to create/update the state table.
6. In each client, open **Settings → Versions & connection**, choose the same DB driver, enter the HTTPS URL ending in `/api.php`, enter the server-issued token, select **online and offline**, save, test, then synchronize.

Database passwords must never be entered in a browser, Android app, or Windows client. Client tokens are stored locally on that device and excluded from backups and synced snapshots. API URL, platform, backend choice, and offline/auto-sync mode are also device-local and are not replicated to other clients; configure each device independently. For a public deployment, restrict network access to the API and rotate/revoke tokens if a device is lost. Do not expose this initial shared-token API to an untrusted public network; per-user server authentication and a normalized transactional API are follow-up production hardening.

## Conflict behavior

When two devices edit from the same base revision, the first upload advances the server revision. The other device receives a conflict; it must explicitly keep the server snapshot or overwrite the server with its local snapshot. Both choices require confirmation in the UI. This first version does not merge individual records; export a backup before resolving a large conflict.
