<?php
/* Hooshyar POS snapshot API.
 * Deploy behind HTTPS. Credentials stay in config.php/environment, never in the app.
 * Supported adapters: MySQL/PDO and SQL Server 2014+/pdo_sqlsrv.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Cache-Control: no-store');
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($requestMethod === 'OPTIONS') { http_response_code(204); exit; }
function reply(int $status, array $data): void { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function bearer(): string {
  $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!$header && function_exists('getallheaders')) { $headers = getallheaders(); $header = $headers['Authorization'] ?? $headers['authorization'] ?? ''; }
  return preg_match('/^Bearer\s+(.+)$/i', $header, $m) ? trim($m[1]) : '';
}
function body(): array { $raw = file_get_contents('php://input'); $value = json_decode($raw ?: '{}', true); if (!is_array($value)) reply(400, ['ok'=>false,'error'=>'JSON نامعتبر است']); return $value; }
$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) reply(503, ['ok'=>false,'error'=>'فایل config.php روی سرور ساخته نشده است.']);
$config = require $configFile;
$expectedToken = (string)($config['api_token'] ?? '');
if (strlen($expectedToken) < 32 || !hash_equals($expectedToken, bearer())) reply(401, ['ok'=>false,'error'=>'توکن API نامعتبر است.']);
$driver = strtolower((string)($config['driver'] ?? 'mysql'));
try {
  if ($driver === 'mysql') {
    $dsn = 'mysql:host='.$config['host'].';port='.($config['port'] ?? 3306).';dbname='.$config['database'].';charset=utf8mb4';
    $pdo = new PDO($dsn, (string)$config['username'], (string)$config['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
    $pdo->exec('CREATE TABLE IF NOT EXISTS hooshyar_sync_state (id TINYINT NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, payload LONGTEXT NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec("INSERT IGNORE INTO hooshyar_sync_state (id,revision,payload,updated_at) VALUES (1,0,NULL,0)");
    $pdo->exec('CREATE TABLE IF NOT EXISTS hooshyar_sync_ops (operation_id VARCHAR(100) NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  } elseif ($driver === 'sqlsrv') {
    $server = (string)$config['host'].(isset($config['port']) ? ','.(int)$config['port'] : '');
    $dsn = 'sqlsrv:Server='.$server.';Database='.(string)$config['database'];
    $pdo = new PDO($dsn, (string)$config['username'], (string)$config['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec("IF OBJECT_ID(N'dbo.hooshyar_sync_state', N'U') IS NULL CREATE TABLE dbo.hooshyar_sync_state (id TINYINT NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, payload NVARCHAR(MAX) NULL, updated_at BIGINT NOT NULL)");
    $pdo->exec("IF NOT EXISTS (SELECT 1 FROM dbo.hooshyar_sync_state WHERE id=1) INSERT INTO dbo.hooshyar_sync_state (id,revision,payload,updated_at) VALUES (1,0,NULL,0)");
    $pdo->exec("IF OBJECT_ID(N'dbo.hooshyar_sync_ops', N'U') IS NULL CREATE TABLE dbo.hooshyar_sync_ops (operation_id VARCHAR(100) NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, created_at BIGINT NOT NULL)");
  } else reply(500, ['ok'=>false,'error'=>'درایور دیتابیس باید mysql یا sqlsrv باشد.']);
  $op = (string)($_GET['op'] ?? 'status');
  if ($op === 'status' && $requestMethod === 'GET') {
    $row = $pdo->query($driver==='sqlsrv' ? 'SELECT revision,payload,updated_at FROM dbo.hooshyar_sync_state WHERE id=1' : 'SELECT revision,payload,updated_at FROM hooshyar_sync_state WHERE id=1')->fetch();
    reply(200, ['ok'=>true,'driver'=>$driver,'version'=>(int)$row['revision'],'initialized'=>$row['payload'] !== null,'updatedAt'=>(int)$row['updated_at']]);
  }
  if ($op === 'pull' && $requestMethod === 'POST') {
    $row = $pdo->query($driver==='sqlsrv' ? 'SELECT revision,payload,updated_at FROM dbo.hooshyar_sync_state WHERE id=1' : 'SELECT revision,payload,updated_at FROM hooshyar_sync_state WHERE id=1')->fetch();
    $state = $row['payload'] === null ? null : json_decode((string)$row['payload'], true);
    if ($row['payload'] !== null && !is_array($state)) reply(500, ['ok'=>false,'error'=>'دادهٔ ذخیره‌شدهٔ سرور JSON معتبر نیست.']);
    reply(200, ['ok'=>true,'driver'=>$driver,'version'=>(int)$row['revision'],'state'=>$state,'updatedAt'=>(int)$row['updated_at']]);
  }
  if ($op === 'push' && $requestMethod === 'POST') {
    $input = body(); $state = $input['state'] ?? null; $expected = filter_var($input['expectedVersion'] ?? null, FILTER_VALIDATE_INT); $operationId = (string)($input['operationId'] ?? '');
    if (!is_array($state) || !is_array($state['meta'] ?? null) || !is_array($state['users'] ?? null) || $expected === false || $expected === null || !preg_match('/^[A-Za-z0-9._:-]{8,100}$/', $operationId)) reply(400, ['ok'=>false,'error'=>'دادهٔ POS، شناسهٔ عملیات یا نسخهٔ پایه معتبر نیست.']);
    $payload = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false || strlen($payload) > 32*1024*1024) reply(413, ['ok'=>false,'error'=>'حجم نسخهٔ POS بیش از حد مجاز است.']);
    $pdo->beginTransaction();
    try {
      $select = $driver==='sqlsrv' ? 'SELECT revision,payload,updated_at FROM dbo.hooshyar_sync_state WITH (UPDLOCK,HOLDLOCK) WHERE id=1' : 'SELECT revision,payload,updated_at FROM hooshyar_sync_state WHERE id=1 FOR UPDATE';
      $row = $pdo->query($select)->fetch(); $revision = (int)$row['revision'];
      $opTable = $driver==='sqlsrv' ? 'dbo.hooshyar_sync_ops' : 'hooshyar_sync_ops';
      $opStmt = $pdo->prepare('SELECT revision FROM '.$opTable.' WHERE operation_id=?'); $opStmt->execute([$operationId]); $prior = $opStmt->fetch();
      if ($prior) { $pdo->commit(); reply(200, ['ok'=>true,'driver'=>$driver,'version'=>(int)$prior['revision'],'idempotent'=>true]); }
      if ($revision !== (int)$expected) {
        $pdo->rollBack();
        reply(409, ['ok'=>false,'conflict'=>true,'version'=>$revision,'state'=>$row['payload']===null?null:json_decode((string)$row['payload'],true),'error'=>'نسخهٔ سرور تغییر کرده است؛ انتخاب دستی لازم است.']);
      }
      $next = $revision + 1; $now = (int)round(microtime(true)*1000);
      $stmt = $pdo->prepare($driver==='sqlsrv' ? 'UPDATE dbo.hooshyar_sync_state SET revision=?,payload=?,updated_at=? WHERE id=1' : 'UPDATE hooshyar_sync_state SET revision=?,payload=?,updated_at=? WHERE id=1');
      $stmt->execute([$next,$payload,$now]);
      $opInsert = $pdo->prepare('INSERT INTO '.$opTable.' (operation_id,revision,created_at) VALUES (?,?,?)'); $opInsert->execute([$operationId,$next,$now]);
      $pdo->commit();
      reply(200, ['ok'=>true,'driver'=>$driver,'version'=>$next,'updatedAt'=>$now]);
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
  }
  reply(404, ['ok'=>false,'error'=>'عملیات API شناخته نشد.']);
} catch (Throwable $e) { error_log('Hooshyar POS API: '.$e->getMessage()); reply(500, ['ok'=>false,'error'=>'خطای دیتابیس/API؛ گزارش جزئیات در لاگ سرور ثبت شد.']); }
