<?php
declare(strict_types=1);
header('Content-Type: application/json');
session_start();

require __DIR__ . '/db.php';
function out($a){ echo json_encode($a); exit; }

$isPdo   = isset($pdo)  && $pdo  instanceof PDO;
$isMySQL = isset($conn) && $conn instanceof mysqli;
if (!$isPdo && !$isMySQL) out(['ok'=>false,'error'=>'No database connection.']);

function has_col(string $table, string $col): bool {
  static $map = [];
  $k = $table.':'.$col;
  if (isset($map[$k])) return $map[$k];
  global $pdo, $conn, $isPdo, $isMySQL;
  $cols = [];
  $sql = "SHOW COLUMNS FROM `$table`";
  if ($isPdo) { foreach ($pdo->query($sql) as $r) $cols[strtolower($r['Field'])]=true; }
  else { if ($res = $conn->query($sql)) while ($r=$res->fetch_assoc()) $cols[strtolower($r['Field'])]=true; }
  return $map[$k] = isset($cols[strtolower($col)]);
}
function post_arr(): array {
  $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
  if (strpos($ct,'application/json')!==false) return json_decode(file_get_contents('php://input'),true) ?: [];
  return $_POST;
}

try {
  $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
  
  // Normalize POST/JSON body
$body = $_POST;
$ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
if (strpos($ct, 'application/json') !== false) {
    $json = json_decode(file_get_contents('php://input'), true);
    if (is_array($json)) $body = $json;
}

/**
 * Map `password` -> `password_hash` (bcrypt) to match DB schema.
 * Also remove raw `password` so INSERT never tries to use a non-existent column.
 */
if (isset($body['password']) && $body['password'] !== '') {
    $body['password_hash'] = password_hash($body['password'], PASSWORD_BCRYPT);
    unset($body['password']);
}

// From here on, use $body instead of $_POST
// (or if your code uses $_POST later, reassign it)
$_POST = $body;


  /* ----------- LIST (active only) ----------- */
  if ($m === 'GET') {
    $cols = ['id','full_name','email','role','status','created_at'];
    if (has_col('users','specialization')) $cols[]='specialization';
    $colSql = implode(',', $cols);
    $sql = "SELECT $colSql FROM users WHERE status <> 'archived' ORDER BY id DESC LIMIT 200";
    if ($isPdo) {
      $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    } else {
      $rows=[]; if ($res=$conn->query($sql)) while($r=$res->fetch_assoc()) $rows[]=$r;
    }
    out(['ok'=>true,'data'=>$rows]);
  }

  /* ----------- MUTATIONS ----------- */
  if ($m === 'POST') {
    $b = post_arr();
    $action = strtolower(trim($b['action'] ?? ''));

    /* ADD */
   /* ADD */
if ($action === 'add') {
    // Use normalized $body first (it may already contain password_hash),
    // fall back to raw $b (what post_arr() returned).
    $name  = trim($body['full_name']       ?? $b['full_name']       ?? '');
    $email = trim($body['email']           ?? $b['email']           ?? '');
    $role  = strtolower(trim($body['role'] ?? $b['role']            ?? 'client'));
    $spec  = trim($body['specialization']  ?? $b['specialization']  ?? '');

    // Prefer an already-normalized hash; otherwise hash the raw password.
    $hash = trim($body['password_hash'] ?? '');
    if ($hash === '') {
        $raw = trim($b['password'] ?? '');
        if ($raw !== '') $hash = password_hash($raw, PASSWORD_BCRYPT);
    }

    if ($name === '' || $email === '' || $hash === '') {
        out(['ok'=>false,'error'=>'Missing required fields']);
    }

    $status     = 'active';
    $created_at = date('Y-m-d H:i:s');

    $sql = "INSERT INTO users (full_name, email, role, specialization, status, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)";

    if ($isPdo) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$name, $email, $role, $spec, $status, $hash, $created_at]);
    } else {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('sssssss', $name, $email, $role, $spec, $status, $hash, $created_at);
        $stmt->execute();
    }

    out(['ok'=>true,'message'=>'User created']);
}



    /* UPDATE */
    if ($action === 'update') {
      $id=(int)($b['id']??0);
      $name=trim($b['full_name']??'');
      $email=trim($b['email']??'');
      $role=strtolower(trim($b['role']??'client'));
      $status=strtolower(trim($b['status']??'active'));
      $spec=trim($b['specialization']??'');
      if($id<=0||$name===''||$email==='') out(['ok'=>false,'error'=>'Missing fields']);
      if(!in_array($role,['admin','employee','client'],true)) $role='client';
      if(!in_array($status,['active','disabled','archived'],true)) $status='active';
      $hasSpec = has_col('users','specialization');

      if ($isPdo) {
        if ($hasSpec) {
          $stmt=$pdo->prepare('UPDATE users SET full_name=?,email=?,role=?,status=?,specialization=? WHERE id=?');
          $stmt->execute([$name,$email,$role,$status,$spec,$id]);
        } else {
          $stmt=$pdo->prepare('UPDATE users SET full_name=?,email=?,role=?,status=? WHERE id=?');
          $stmt->execute([$name,$email,$role,$status,$id]);
        }
      } else {
        if ($hasSpec) {
          $stmt=$conn->prepare('UPDATE users SET full_name=?,email=?,role=?,status=?,specialization=? WHERE id=?');
          if(!$stmt) out(['ok'=>false,'error'=>$conn->error]);
          $stmt->bind_param('sssssi',$name,$email,$role,$status,$spec,$id);
        } else {
          $stmt=$conn->prepare('UPDATE users SET full_name=?,email=?,role=?,status=? WHERE id=?');
          if(!$stmt) out(['ok'=>false,'error'=>$conn->error]);
          $stmt->bind_param('ssssi',$name,$email,$role,$status,$id);
        }
        if(!$stmt->execute()) out(['ok'=>false,'error'=>$stmt->error]);
      }
      out(['ok'=>true,'message'=>'User updated']);
    }

    /* ARCHIVE = move to archived_users then delete from users */
    if ($action === 'archive') {
      $id = (int)($b['id'] ?? 0);
      if ($id <= 0) out(['ok'=>false,'error'=>'Missing id']);

      // Build a column list present in BOTH tables
      $userCols = [];
      foreach (['id','full_name','email','role','password_hash','status','specialization','created_at'] as $c) {
        if (has_col('users',$c) && has_col('archived_users',$c)) $userCols[]="`$c`";
      }
      $colList = implode(',', $userCols);
      if ($colList==='') out(['ok'=>false,'error'=>'No common columns to archive']);

      if ($isPdo) {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("INSERT INTO archived_users ($colList) SELECT $colList FROM users WHERE id=?");
        $stmt->execute([$id]);
        $pdo->prepare('UPDATE archived_users SET status="archived", archived_at=NOW() WHERE id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$id]);
        $pdo->commit();
      } else {
        $conn->begin_transaction();
        $stmt = $conn->prepare("INSERT INTO archived_users ($colList) SELECT $colList FROM users WHERE id=?");
        if(!$stmt){ $conn->rollback(); out(['ok'=>false,'error'=>$conn->error]); }
        $stmt->bind_param('i',$id);
        if(!$stmt->execute()){ $conn->rollback(); out(['ok'=>false,'error'=>$stmt->error]); }
        $stmt = $conn->prepare('UPDATE archived_users SET status="archived", archived_at=NOW() WHERE id=?');
        $stmt->bind_param('i',$id); if(!$stmt->execute()){ $conn->rollback(); out(['ok'=>false,'error'=>$stmt->error]); }
        $stmt = $conn->prepare('DELETE FROM users WHERE id=?');
        $stmt->bind_param('i',$id); if(!$stmt->execute()){ $conn->rollback(); out(['ok'=>false,'error'=>$stmt->error]); }
        $conn->commit();
      }
      out(['ok'=>true,'message'=>'User archived']);
    }

    out(['ok'=>false,'error'=>'Unsupported POST action']);
  }

  out(['ok'=>false,'error'=>'Unsupported method']);
} catch (Throwable $e) {
  out(['ok'=>false,'error'=>$e->getMessage()]);
}
