<?php
/* PHP front controller for the existing offline-capable POS client.
 * For deploy packages, the static shell is index.html next to this file.
 * In the source tree, it is /webapp/index.html.
 */
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
$indexCandidates = [
  __DIR__ . '/index.html',
  dirname(__DIR__) . '/private/index.html',
  dirname(__DIR__, 3) . '/webapp/index.html',
];
$indexFile = null;
foreach ($indexCandidates as $candidate) {
  if (is_file($candidate) && is_readable($candidate)) { $indexFile = $candidate; break; }
}
if ($indexFile === null) {
  http_response_code(500);
  echo 'Hooshyar POS frontend is not installed. Run tools/build-php-host.sh.';
  exit;
}
readfile($indexFile);
