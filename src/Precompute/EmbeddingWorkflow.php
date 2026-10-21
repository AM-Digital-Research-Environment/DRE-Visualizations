<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use DreVisualizations\Module;
use Psr\Container\ContainerInterface;

/**
 * The embeddings workflow on GitHub Actions (.github/workflows/embeddings.yml),
 * seen from the module's configuration page: its latest run, and a button
 * that starts one.
 *
 * Reading the runs needs no token (the repository is public). Starting one
 * does: a fine-grained token limited to this repository with Actions read and
 * write, saved in the module settings. Every call reports a reason a person
 * can act on instead of throwing, so the page always renders.
 */
final class EmbeddingWorkflow
{
    public const FILE = 'embeddings.yml';
    public const BRANCH = 'main';
    /** Where a person follows the runs, or starts one by hand. */
    public const PAGE = 'https://github.com/' . EmbeddingInputs::REPOSITORY . '/actions/workflows/' . self::FILE;
    private const API = 'https://api.github.com/repos/' . EmbeddingInputs::REPOSITORY . '/actions/workflows/' . self::FILE;

    /** @var callable(string,string,array<string,string>,?string):?array{0:int,1:string} */
    private $send;

    /**
     * @param callable(string,string,array<string,string>,?string):?array{0:int,1:string} $send
     *        (method, URL, headers, body) to [status, body], or null when GitHub was not reached
     */
    public function __construct(callable $send, private readonly string $token = '')
    {
        $this->send = $send;
    }

    /** Over Omeka's HTTP client, with the token saved in the module configuration. */
    public static function fromServices(ContainerInterface $services): self
    {
        return new self(
            self::httpSender($services->get('Omeka\HttpClient')),
            (string) $services->get('Omeka\Settings')->get(Module::SETTING_GITHUB_TOKEN, '')
        );
    }

    /** A classic (ghp_…) or fine-grained (github_pat_…) token's shape; not proof GitHub accepts it. */
    public static function isPlausibleToken(string $token): bool
    {
        return preg_match('/^[A-Za-z0-9_]{20,255}$/', $token) === 1;
    }

    public function hasToken(): bool
    {
        return $this->token !== '';
    }

    /**
     * The newest run, or why it could not be read. Sent with the token when
     * there is one, so an expired token shows up here before anyone clicks.
     *
     * @return array{run:?array{status:string,conclusion:?string,event:string,createdAt:string,url:string},error:?string}
     */
    public function latestRun(): array
    {
        $response = ($this->send)('GET', self::API . '/runs?per_page=1', $this->headers(), null);
        if ($response === null || $response[0] < 200 || $response[0] >= 300) {
            return ['run' => null, 'error' => $this->reason($response)];
        }
        $runs = json_decode($response[1], true)['workflow_runs'] ?? null;
        if (!is_array($runs)) return ['run' => null, 'error' => 'GitHub answered with something other than a list of runs.'];
        $run = $runs[0] ?? null;
        if (!is_array($run)) return ['run' => null, 'error' => null];
        $url = (string) ($run['html_url'] ?? '');
        return ['run' => [
            'status' => (string) ($run['status'] ?? ''),
            'conclusion' => is_string($run['conclusion'] ?? null) ? $run['conclusion'] : null,
            'event' => (string) ($run['event'] ?? ''),
            'createdAt' => (string) ($run['created_at'] ?? ''),
            'url' => str_starts_with($url, 'https://github.com/' . EmbeddingInputs::REPOSITORY . '/actions/runs/') ? $url : self::PAGE,
        ], 'error' => null];
    }

    /**
     * Start a build of what changed since the last one. Null once GitHub has
     * queued it, otherwise the reason it did not.
     */
    public function dispatch(): ?string
    {
        if (!$this->hasToken()) return 'No GitHub token is saved. Paste one in the GitHub token field.';
        $body = json_encode(['ref' => self::BRANCH, 'inputs' => ['scope' => 'missing', 'publish_vectors' => 'true']], JSON_THROW_ON_ERROR);
        $headers = $this->headers() + ['Content-Type' => 'application/json'];
        $response = ($this->send)('POST', self::API . '/dispatches', $headers, $body);
        return $response !== null && $response[0] >= 200 && $response[0] < 300 ? null : $this->reason($response);
    }

    /** @return array<string,string> */
    private function headers(): array
    {
        $headers = [
            'Accept' => 'application/vnd.github+json',
            'X-GitHub-Api-Version' => '2022-11-28',
            'User-Agent' => 'DRE-Visualizations (Omeka S module)',
        ];
        if ($this->token !== '') $headers['Authorization'] = 'Bearer ' . $this->token;
        return $headers;
    }

    /** @param array{0:int,1:string}|null $response */
    private function reason(?array $response): string
    {
        if ($response === null) return 'This server could not reach api.github.com.';
        [$status, $body] = $response;
        $message = json_decode($body, true)['message'] ?? '';
        $message = is_string($message) ? $message : '';
        return match (true) {
            $status === 401 => 'GitHub rejected the token: it has expired or was revoked. Save a new one.',
            ($status === 403 || $status === 429) && stripos($message, 'rate limit') !== false
                => 'GitHub’s hourly request limit for this server is used up. Try again in an hour.',
            // A fine-grained token the organisation has not approved yet reads public data but gets a 403 here.
            $status === 403 => 'GitHub did not let the token start a build. If the organisation has not approved the token yet, ask an owner to approve it. Otherwise, give it “Actions: Read and write” on the DRE-Visualizations repository.',
            $status === 404 && $this->token !== '' => 'The token cannot see the DRE-Visualizations repository. Create it for that repository.',
            default => trim(sprintf('GitHub answered %d. %s', $status, mb_substr($message, 0, 200))),
        };
    }

    /**
     * A sender over Omeka's configured HTTP client (proxy and TLS settings
     * included). Short timeout: the configuration page waits for it.
     *
     * @return \Closure(string,string,array<string,string>,?string):?array{0:int,1:string}
     */
    public static function httpSender(\Laminas\Http\Client $client): \Closure
    {
        return static function (string $method, string $url, array $headers, ?string $body) use ($client): ?array {
            try {
                // A fresh Request, as in EmbeddingInputs::httpFetcher().
                $request = clone $client;
                $request->setRequest(new \Laminas\Http\Request());
                $request->clearCookies();
                $request->clearAuth();
                $request->setOptions(['timeout' => 15, 'maxredirects' => 0]);
                $request->setUri($url);
                $request->setMethod($method);
                $request->setHeaders($headers);
                if ($body !== null) $request->setRawBody($body);
                $response = $request->send();
                return [$response->getStatusCode(), $response->getBody()];
            } catch (\Throwable) {
                return null;
            }
        };
    }
}
