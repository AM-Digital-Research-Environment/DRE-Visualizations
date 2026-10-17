<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
use DreVisualizations\Listener\VisibilityState;

// Stand-ins with the getters VisibilityState reads from Omeka's entities.
final class FakeRef { public function __construct(private ?int $id) {} public function getId(): ?int { return $this->id; } }
final class FakeValue
{
    public function __construct(private int $property, private ?string $value, private bool $public = true,
        private ?int $target = null, private string $type = 'literal') {}
    public function getProperty(): FakeRef { return new FakeRef($this->property); }
    public function getType(): string { return $this->type; }
    public function getLang(): ?string { return null; }
    public function getValue(): ?string { return $this->value; }
    public function getUri(): ?string { return null; }
    public function getValueResource(): ?FakeRef { return $this->target === null ? null : new FakeRef($this->target); }
    public function isPublic(): bool { return $this->public; }
}
final class FakeMedia { public function __construct(private ?int $id, private bool $public) {} public function getId(): ?int { return $this->id; } public function isPublic(): bool { return $this->public; } }
final class FakeItem
{
    public function __construct(private ?int $id, private bool $public, private array $values, private array $media = []) {}
    public function getId(): ?int { return $this->id; }
    public function isPublic(): bool { return $this->public; }
    public function getValues(): array { return $this->values; }
    public function getMedia(): array { return $this->media; }
}

$check = static function (bool $pass, string $message): void {
    if (!$pass) throw new RuntimeException($message);
    echo "ok: $message\n";
};
$item = static fn (bool $public = true, array $values = [], array $media = []): FakeItem => new FakeItem(1, $public, $values, $media);
$state = static fn (FakeItem ...$items): array => VisibilityState::fromEntities($items);
$title = new FakeValue(1, 'Title');
$abstract = new FakeValue(2, 'Abstract');
$before = $state($item(true, [$title, $abstract], [new FakeMedia(10, true), new FakeMedia(11, false)]));

$check(!VisibilityState::privatised($before, $before), 'An unchanged resource hides nothing');
$check(!VisibilityState::privatised($before, $state($item(true, [$title, new FakeValue(2, 'Better abstract')], [new FakeMedia(10, true)]))),
    'Editing a value and deleting a medium hide nothing');
$check(!VisibilityState::privatised($before, $state($item(true, [$title]))), 'Deleting a public value is not privatising');
$check(!VisibilityState::privatised($before, $state($item(true, [$title, $abstract, new FakeValue(3, 'Internal note', false)], [new FakeMedia(10, true), new FakeMedia(11, false)]))),
    'Adding a private value is not privatising');
$check(VisibilityState::privatised($before, $state($item(false, [$title, $abstract]))), 'Making the resource private is privatising');
$check(VisibilityState::privatised($before, $state($item(true, [$title, new FakeValue(2, 'Abstract', false)], [new FakeMedia(10, true), new FakeMedia(11, false)]))),
    'Making a value private is privatising');
$check(VisibilityState::privatised($before, $state($item(true, [$title, new FakeValue(2, 'Rewritten', false)], [new FakeMedia(10, true), new FakeMedia(11, false)]))),
    'Rewriting a value and hiding it at once is privatising');
$check(VisibilityState::privatised($before, $state($item(true, [$title, $abstract], [new FakeMedia(10, false), new FakeMedia(11, false)]))),
    'Making a public medium private is privatising');
$check(!VisibilityState::privatised($state($item(false, [$title])), $state($item(false, [new FakeValue(1, 'Title', false)]))),
    'Nothing on an already private resource counts');
$check(!VisibilityState::privatised([], $before), 'A resource with no earlier state (a creation) hides nothing');

$linked = $state(new FakeItem(1, true, [new FakeValue(4, null, true, 99, 'resource')]));
$check(VisibilityState::privatised($linked, $state(new FakeItem(1, true, [new FakeValue(4, null, false, 99, 'resource')]))),
    'Making a link to another resource private is privatising');
$check(VisibilityState::fromEntities([new FakeItem(null, true, [])]) === [] && VisibilityState::fromEntities('not an entity') === [],
    'Unsaved and foreign content is skipped');
// A batch update: only the records that lost something are named.
$batchBefore = VisibilityState::fromEntities([new FakeItem(1, true, [$title]), new FakeItem(2, true, [$abstract]), new FakeItem(3, false, [])]);
$batchAfter = VisibilityState::fromEntities([new FakeItem(1, false, [$title]), new FakeItem(2, true, [new FakeValue(2, 'Abstract', false)]), new FakeItem(3, false, [])]);
$check(VisibilityState::privatisedIds($batchBefore, $batchAfter) === [1, 2], 'The resources a write hid are named, and only those');
$check(VisibilityState::privatisedIds($before, $before) === [], 'A write that hides nothing names nobody');
echo "Visibility state passed.\n";
