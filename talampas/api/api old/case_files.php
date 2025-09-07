<?php
header('Content-Type: application/json');
require_once "db.php";

$method = $_SERVER['REQUEST_METHOD'];

// ---------- LIST FILES FOR A CASE ----------
if ($method === 'GET') {
    $case_id = $_GET['case_id'] ?? null;
    if (!$case_id) {
        http_response_code(400);
        echo json_encode(["error" => "case_id is required"]);
        exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM case_files WHERE case_id = ?");
    $stmt->execute([$case_id]);
    echo json_encode(["files" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    exit;
}

// ---------- UPLOAD FILE ----------
if ($method === 'POST') {
    if (!isset($_POST['case_id']) || !isset($_FILES['file'])) {
        http_response_code(400);
        echo json_encode(["error" => "case_id and file are required"]);
        exit;
    }

    $case_id = $_POST['case_id'];
    $uploaded_by = $_POST['uploaded_by'] ?? 1; // replace with session user id later

    $file = $_FILES['file'];
    $targetDir = __DIR__ . "/../uploads/";

    if (!is_dir($targetDir)) {
        mkdir($targetDir, 0777, true);
    }

    $fileName = time() . "_" . basename($file["name"]);
    $targetPath = $targetDir . $fileName;

    if (move_uploaded_file($file["tmp_name"], $targetPath)) {
        $stmt = $pdo->prepare("INSERT INTO case_files 
            (case_id, file_name, file_path, mime_type, uploaded_by) 
            VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([
            $case_id,
            $file["name"],
            "uploads/" . $fileName,
            $file["type"],
            $uploaded_by
        ]);

        echo json_encode(["success" => true, "file" => $fileName]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "File upload failed"]);
    }
    exit;
}

// ---------- DELETE FILE ----------
if ($method === 'DELETE') {
    parse_str(file_get_contents("php://input"), $data);
    $id = $data['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(["error" => "id required"]);
        exit;
    }

    // find file path
    $stmt = $pdo->prepare("SELECT file_path FROM case_files WHERE id=?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        $filePath = __DIR__ . "/../" . $row['file_path'];
        if (file_exists($filePath)) {
            unlink($filePath);
        }
        $pdo->prepare("DELETE FROM case_files WHERE id=?")->execute([$id]);
        echo json_encode(["success" => true]);
    } else {
        http_response_code(404);
        echo json_encode(["error" => "File not found"]);
    }
    exit;
}

http_response_code(405);
echo json_encode(["error" => "Method not allowed"]);
