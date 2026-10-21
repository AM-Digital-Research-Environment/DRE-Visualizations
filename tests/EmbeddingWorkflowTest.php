<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Precompute\EmbeddingInputs;
use DreVisualizations\Precompute\EmbeddingWorkflow;

$failures = 0;
function workflowCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

const WORKFLOW_API = 'https://api.github.com/repos/' . EmbeddingInputs::REPOSITORY . '/actions/workflows/' . EmbeddingWorkflow::FILE;
const WORKFLOW_RUN = 'https://github.com/' . EmbeddingInputs::REPOSITORY . '/actions/runs/38913386106';

/** A fake GitHub: records every request and answers from $answers (method + URL => [status, body] or null). */
function workflowFake(array &$sent, array $answers): Closure
{
    return static function (string $method, string $url, array $headers, ?string $body) use (&$sent, $answers): ?array {
        $sent[] = compact('method', 'url', 'headers', 'body');
        return $answers[$method . ' ' . $url] ?? [404, '{"message":"Not Found"}'];
    };
}

$runs = json_encode(['workflow_runs' => [[
    'status' => 'completed', 'conclusion' => 'success', 'event' => 'workflow_dispatch',
    'created_at' => '2026-10-16T14:08:38Z', 'html_url' => WORKFLOW_RUN,
]]]);

// No token: the runs are public, the button has nothing to send.
$sent = [];
$anonymous = new EmbeddingWorkflow(workflowFake($sent, ['GET ' . WORKFLOW_API . '/runs?per_page=1' => [200, $runs]]));
$latest = $anonymous->latestRun();
workflowCheck($latest['error'] === null && $latest['run']['conclusion'] === 'success', 'the latest run is read without a token');
workflowCheck($latest['run']['url'] === WORKFLOW_RUN, 'the run links to its page');
workflowCheck(!isset($sent[0]['headers']['Authorization']), 'no Authorization header without a token');
workflowCheck($anonymous->dispatch() !== null && count($sent) === 1, 'dispatch refuses without a token and sends nothing');

// A token: the build is requested for main, scope missing.
$sent = [];
$token = 'github_pat_' . str_repeat('A1', 20);
$workflow = new EmbeddingWorkflow(workflowFake($sent, [
    'GET ' . WORKFLOW_API . '/runs?per_page=1' => [200, $runs],
    'POST ' . WORKFLOW_API . '/dispatches' => [204, ''],
]), $token);
workflowCheck($workflow->dispatch() === null, 'a 204 means the build was queued');
workflowCheck($sent[0]['headers']['Authorization'] === 'Bearer ' . $token, 'the token is sent as a bearer token');
$payload = json_decode((string) $sent[0]['body'], true);
workflowCheck($payload === ['ref' => 'main', 'inputs' => ['scope' => 'missing', 'publish_vectors' => 'true']], 'the build covers what changed, on main');
workflowCheck($workflow->latestRun()['error'] === null, 'the latest run is read with the token');

// Reasons a person can act on.
$reason = static function (?array $answer, string $tokenValue = 'github_pat_' . 'x'): ?string {
    $send = static fn (): ?array => $answer;
    return (new EmbeddingWorkflow($send, $tokenValue))->dispatch();
};
workflowCheck(str_contains((string) $reason(null), 'could not reach'), 'an unreachable GitHub is named');
workflowCheck(str_contains((string) $reason([401, '{"message":"Bad credentials"}']), 'expired or was revoked'), 'a 401 asks for a new token');
$forbidden = (string) $reason([403, '{"message":"Resource not accessible by personal access token"}']);
workflowCheck(str_contains($forbidden, 'Actions: Read and write'), 'a 403 names the missing permission');
workflowCheck(str_contains($forbidden, 'approve'), 'a 403 names a token the organisation has not approved');
workflowCheck(str_contains((string) $reason([403, '{"message":"API rate limit exceeded for 1.2.3.4"}']), 'hourly request limit'), 'a rate limit is told apart from a permission');
workflowCheck(str_contains((string) $reason([404, '{"message":"Not Found"}']), 'cannot see the DRE-Visualizations repository'), 'a 404 with a token means the wrong repository');
workflowCheck(str_contains((string) $reason([422, '{"message":"Unexpected inputs provided"}']), 'Unexpected inputs provided'), 'other answers keep GitHub’s message');

$sent = [];
$broken = new EmbeddingWorkflow(workflowFake($sent, ['GET ' . WORKFLOW_API . '/runs?per_page=1' => [401, '{"message":"Bad credentials"}']]), $token);
workflowCheck(str_contains((string) $broken->latestRun()['error'], 'expired'), 'a rejected token shows on the page before anyone clicks');

$sent = [];
$foreign = new EmbeddingWorkflow(workflowFake($sent, ['GET ' . WORKFLOW_API . '/runs?per_page=1' => [200, json_encode(['workflow_runs' => [['status' => 'queued', 'html_url' => 'https://example.org/x']]])]]));
workflowCheck($foreign->latestRun()['run']['url'] === EmbeddingWorkflow::PAGE, 'a run URL outside the repository is replaced');
$sent = [];
$none = new EmbeddingWorkflow(workflowFake($sent, ['GET ' . WORKFLOW_API . '/runs?per_page=1' => [200, '{"workflow_runs":[]}']]));
workflowCheck($none->latestRun() === ['run' => null, 'error' => null], 'no runs yet is not an error');

workflowCheck(EmbeddingWorkflow::isPlausibleToken($token), 'a fine-grained token is accepted');
workflowCheck(EmbeddingWorkflow::isPlausibleToken('ghp_' . str_repeat('a', 36)), 'a classic token is accepted');
workflowCheck(!EmbeddingWorkflow::isPlausibleToken('github_pat_ short'), 'a token with a space is rejected');
workflowCheck(!EmbeddingWorkflow::isPlausibleToken('abc'), 'a fragment is rejected');

exit($failures === 0 ? 0 : 1);
