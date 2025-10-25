<?php //CASE FILES

declare(strict_types=1);
header('Content-Type: application/json');

require __DIR__ . '/db.php';   
require __DIR__ . '/auth.php'; 

require_login();
$user = current_user();
$method = $_SERVER['REQUEST_METHOD'];

function ok($data){ echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function bad($code, $msg){ http_response_code($code); echo json_encode(['error'=>$msg]); exit; }
function is_staff($u){ return in_array($u['role'] ?? '', ['admin','employee'], true); }

try {
    if ($method === 'GET') {
        $case_id = isset($_GET['case_id']) ? (int)$_GET['case_id'] : 0;
        if (!$case_id) bad(400, 'case_id is required');
        if ($user['role'] === 'client') {
            $chk = $pdo->prepare("SELECT client_id FROM cases WHERE id=?");
            $chk->execute([$case_id]);
            $row = $chk->fetch(PDO::FETCH_ASSOC);
            if (!$row) bad(404, 'Case not found');
            if ((int)$row['client_id'] !== (int)$user['id']) bad(403, 'Forbidden');
        }
        $stmt = $pdo->prepare("SELECT * FROM case_files WHERE case_id=? ORDER BY created_at DESC");
        $stmt->execute([$case_id]);
        ok($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    if ($method === 'POST') {
        $case_id = (int)($_POST['case_id'] ?? 0);
        $file_name = $_POST['file_name'] ?? '';
        $file_path = $_POST['file_path'] ?? '';
        if (!$case_id || $file_name === '' || $file_path === '') bad(422, 'case_id, file_name, file_path required');

        if ($user['role'] === 'client') {
            $chk = $pdo->prepare("SELECT client_id FROM cases WHERE id=?");
            $chk->execute([$case_id]);
            $row = $chk->fetch(PDO::FETCH_ASSOC);
            if (!$row) bad(404, 'Case not found');
            if ((int)$row['client_id'] !== (int)$user['id']) bad(403, 'Forbidden');
        }

        $stmt = $pdo->prepare("INSERT INTO case_files (case_id, file_name, file_path, uploaded_by, created_at)
                               VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$case_id, $file_name, $file_path, $user['id']]);
        ok(['ok'=>true, 'id'=>$pdo->lastInsertId()]);
    }

    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) bad(400, 'id is required');
        if ($user['role'] === 'client') {
            $chk = $pdo->prepare("SELECT cf.id, c.client_id, cf.file_path FROM case_files cf JOIN cases c ON c.id = cf.case_id WHERE cf.id = ?");
            $chk->execute([$id]);
            $row = $chk->fetch(PDO::FETCH_ASSOC);
            if (!$row) bad(404, 'Not found');
            if ((int)$row['client_id'] !== (int)$user['id']) bad(403, 'Forbidden');
        } else {
            $chk = $pdo->prepare("SELECT file_path FROM case_files WHERE id = ?");
            $chk->execute([$id]);
            $row = $chk->fetch(PDO::FETCH_ASSOC);
            if (!$row) bad(404, 'Not found');
        }
        
        $fp = $row['file_path'] ?? null;
        if ($fp && file_exists($fp)) { @unlink($fp); }
        $pdo->prepare("DELETE FROM case_files WHERE id=?")->execute([$id]);
        ok(['ok'=>true]);
    }

    bad(405, 'Method not allowed');
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error'=>$e->getMessage()]);
    exit;
}
