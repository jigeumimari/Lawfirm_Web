<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: text/plain");

// === Load dependencies ===
require_once __DIR__ . "/api/db.php";
$ai = require __DIR__ . "/api/ai_config.php";

// === User query ===
if (!isset($_POST["query"]) || trim($_POST["query"]) === "") {
  echo $ai["personality"]["fallback"];
  exit;
}

$userQuery = trim($_POST["query"]);

// === Step 1: Pull structured data from your DB ===
$caseCount = 0;
$topCases = [];
$topCities = [];

$res = $conn->query("SELECT COUNT(*) AS total FROM cases");
if ($res && $row = $res->fetch_assoc()) $caseCount = $row["total"];

$res = $conn->query("
  SELECT case_type, COUNT(*) AS total
  FROM cases
  WHERE MONTH(date_filed) = MONTH(CURDATE())
  GROUP BY case_type
  ORDER BY total DESC
  LIMIT 3
");

while ($row = $res->fetch_assoc()) {
  $topCases[] = $row["case_type"] . " (" . $row["total"] . ")";
}

$res = $conn->query("
  SELECT city, COUNT(*) AS total
  FROM clients
  GROUP BY city
  ORDER BY total DESC
  LIMIT 3
");
while ($row = $res->fetch_assoc()) {
  $topCities[] = $row["city"] . " (" . $row["total"] . ")";
}

$conn->close();

// === Step 2: Build a data summary for context ===
$dataSummary = "Current firm data summary:\n".
  "- Total cases: $caseCount\n".
  "- Top case types this month: " . implode(", ", $topCases) . "\n".
  "- Top client cities: " . implode(", ", $topCities);

// === Step 3: Send to ChatGPT ===
$apiKey = "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";  // API key
$endpoint = "https://api.openai.com/v1/chat/completions";

$messages = [
  [
    "role" => "system",
    "content" => "You are {$ai['role']}. Respond in a {$ai['tone']} tone. ".
                 $ai['intro'] .
                 " Always use the given data summary for reference."
  ],
  ["role" => "assistant", "content" => "Here is the firm's current data:\n$dataSummary"],
  ["role" => "user", "content" => $userQuery]
];

$payload = json_encode([
  "model" => "gpt-4o-mini",   // or "gpt-4o" if you prefer
  "messages" => $messages,
  "temperature" => 0.7
]);

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json",
    "Authorization: Bearer $apiKey"
  ],
  CURLOPT_POSTFIELDS => $payload
]);

$response = curl_exec($ch);
if (curl_errno($ch)) {
  echo "Analytics Unavailable: " . curl_error($ch);
  curl_close($ch);
  exit;
}
curl_close($ch);

$data = json_decode($response, true);
if (isset($data["choices"][0]["message"]["content"])) {
  echo trim($data["choices"][0]["message"]["content"]);
} else {
  echo "The AI didn’t return a response. Try again later.";
}
?>
