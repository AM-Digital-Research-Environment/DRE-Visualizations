<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/**
 * Which linked properties credit an agent (a person or an organisation) on
 * an item. One rule for every builder that counts contributors, roles, credit
 * networks or entity co-occurrence.
 *
 * MARC relator properties are mostly agent roles (author, interviewer,
 * sponsor…), but a few name a place. `marcrel:pup` links a publication to the
 * Location it was published in; matched by the bare `marcrel:` prefix, London
 * and Bayreuth became "contributors", a "Publication place" role and Person
 * nodes in the entity network once the publications sync linked them.
 */
final class Roles
{
    /** MARC relator codes that name a place, not an agent. Only pup is in use. */
    public const PLACE_ROLES = [
        'marcrel:pup', // publication place
        'marcrel:prp', // production place
        'marcrel:mfp', // manufacture place
        'marcrel:dbp', // distribution place
        'marcrel:evp', // event place
        'marcrel:uvp', // university place
    ];

    /** A marcrel:* role held by an agent (every relator code but a place). */
    public static function isAgentRole(string $term): bool
    {
        return str_starts_with($term, 'marcrel:') && !in_array($term, self::PLACE_ROLES, true);
    }

    /** A marcrel:* code that names a place. */
    public static function isPlaceRole(string $term): bool
    {
        return in_array($term, self::PLACE_ROLES, true);
    }

    /**
     * Any property that credits an agent with an item: creator, contributor,
     * the publication author and editor lists, and the agent marcrel:* roles.
     * Membership (foaf:member) is not a credit.
     */
    public static function isCredit(string $term): bool
    {
        return $term === 'dcterms:creator'
            || $term === 'dcterms:contributor'
            || $term === 'bibo:authorList'
            || $term === 'bibo:editorList'
            || self::isAgentRole($term);
    }

    /**
     * The role name a credit shows under in a roles chart. The bibo lists carry
     * the vocabulary labels "list of authors" / "list of editors"; a publication's
     * author holds the same role as a research item's marcrel:aut "author".
     */
    public static function roleLabel(string $term, string $label): string
    {
        return match ($term) {
            'bibo:authorList' => 'author',
            'bibo:editorList' => 'editor',
            default => $label,
        };
    }
}
