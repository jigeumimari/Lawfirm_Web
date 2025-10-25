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
  static $map=[]; $k=$table.':'.$col;
  if(isset($map[$k])) return $map[$k];
  global $pdo,$conn,$isPdo,$isMySQL;
  $cols=[];
  $sql="SHOW COLUMNS FROM `$table`";
  if($isPdo){ foreach($pdo->query($sql) as $r) $cols[strtolower($r['Field'])]=true; }
  else { if($res=$conn->query($sql)) while($r=$res->fetch_assoc()) $cols[strtolower($r['Field'])]=true; }
  return $map[$k]=isset($cols[strtolower($col)]);
}
function post_arr(): array {
  $ct=strtolower($_SERVER['CONTENT_TYPE'] ?? '');
  if (strpos($ct,'application/json')!==false) return json_decode(file_get_contents('php://input'),true) ?: [];
  return $_POST;
}

try{
  $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';

  if ($m==='GET') {
    $cols = ['id','full_name','email','role','archived_at'];
    if (has_col('archived_users','specialization')) $cols[]='specialization';
    $sql = 'SELECT '.implode(',',$cols).' FROM archived_users ORDER BY archived_at DESC, id DESC LIMIT 200';
    if ($isPdo) $rows=$pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    else { $rows=[]; if($res=$conn->query($sql)) while($r=$res->fetch_assoc()) $rows[]=$r; }
    out(['ok'=>true,'data'=>$rows]);
  }

  if ($m==='POST') {
    $b = post_arr();
    $action = strtolower(trim($b['action'] ?? ''));

    if ($action==='restore') {
      $id=(int)($b['id']??0);
      if($id<=0) out(['ok'=>false,'error'=>'Missing id']);

      // shared cols
      $cols=[];
      foreach(['id','full_name','email','role','password','status','specialization','created_at'] as $c){
        if(has_col('archived_users',$c) && has_col('users',$c)) $cols[]="`$c`";
      }
      $colList=implode(',',$cols);
      if($colList==='') out(['ok'=>false,'error'=>'No common columns to restore']);

      if ($isPdo) {
        $pdo->beginTransaction();
        // set status active on the fly
        $pdo->prepare("INSERT INTO users ($colList) SELECT $colList FROM archived_users WHERE id=?")->execute([$id]);
        $pdo->prepare('UPDATE users SET status="active" WHERE id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM archived_users WHERE id=?')->execute([$id]);
        $pdo->commit();
      } else {
        $conn->begin_transaction();
        $stmt=$conn->prepare("INSERT INTO users ($colList) SELECT $colList FROM archived_users WHERE id=?");
        if(!$stmt){ $conn->rollback(); out(['ok'=>false,'error'=>$conn->error]); }
        $stmt->bind_param('i',$id); if(!$stmt->execute()){ $conn->rollback(); out(['ok'=>false,'error'=>$stmt->error]); }
        $stmt=$conn->prepare('UPDATE users SET status="active" WHERE id=?'); $stmt->bind_param('i',$id); if(!$stmt->execute()){ $conn->rollback(); out(['ok'=>false,'error'=>$stmt->error]); }
        $stmt=$conn->prepare('DELETE FROM archived_users WHERE id=?'); $stmt->bind_param('i',$id); if(!$stmt->execute()){ $conn->rollback(); out(['ok'=>false,'error'=>$stmt->error]); }
        $conn->commit();
      }
      out(['ok'=>true,'message'=>'User restored']);
    }

    if ($action==='purge') {
      $id=(int)($b['id']??0);
      if($id<=0) out(['ok'=>false,'error'=>'Missing id']);
      if ($isPdo) $pdo->prepare('DELETE FROM archived_users WHERE id=?')->execute([$id]);
      else { $stmt=$conn->prepare('DELETE FROM archived_users WHERE id=?'); $stmt->bind_param('i',$id); $stmt->execute(); }
      out(['ok'=>true,'message'=>'User permanently deleted']);
    }

    out(['ok'=>false,'error'=>'Unsupported POST action']);
  }

  out(['ok'=>false,'error'=>'Unsupported method']);
}catch(Throwable $e){ out(['ok'=>false,'error'=>$e->getMessage()]); }
