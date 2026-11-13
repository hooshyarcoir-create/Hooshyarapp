<?php
/* Copy to config.php on the PHP host (never commit real credentials).
 * PHP extensions required: pdo_mysql OR pdo_sqlsrv, plus OpenSSL.
 * Generate api_token with: php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
 */
return [
  'driver' => getenv('HOOSHYAR_DB_DRIVER') ?: 'mysql', // mysql | sqlsrv
  'host' => getenv('HOOSHYAR_DB_HOST') ?: '127.0.0.1',
  'port' => getenv('HOOSHYAR_DB_PORT') ?: null,       // MySQL default 3306; SQL Server default instance port if omitted
  'database' => getenv('HOOSHYAR_DB_NAME') ?: 'hooshyar_pos',
  'username' => getenv('HOOSHYAR_DB_USER') ?: '',
  'password' => getenv('HOOSHYAR_DB_PASSWORD') ?: '',
  'api_token' => getenv('HOOSHYAR_API_TOKEN') ?: '',   // minimum 32 characters
];
