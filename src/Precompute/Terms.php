<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

/**
 * The vocabulary terms the precompute reads, named once.
 *
 * config/amira-profile.json pins what differs between installations (template,
 * item-set and item ids); these terms are the AMIRA data model itself, the
 * same on every installation, so they are constants rather than profile
 * entries. DataLoader keys every link and literal by its term
 * ("prefix:localName"), and the generators and aggregators read them back
 * through these names.
 */
final class Terms
{
    // Resource classes (DataLoader's `class_term`).
    public const CLASS_ORGANIZATION = 'foaf:Organization';
    public const CLASS_RESEARCH_GROUP = 'frapo:ResearchGroup';
    public const CLASS_JOURNAL = 'bibo:Journal';
    public const CLASS_SERIES = 'bibo:Series';

    // Properties.
    public const IS_PART_OF = 'dcterms:isPartOf';
    public const SPATIAL = 'dcterms:spatial';
    public const PROVENANCE = 'dcterms:provenance';
    public const SUBJECT = 'dcterms:subject';
    public const TYPE = 'dcterms:type';
    public const LANGUAGE = 'dcterms:language';
    public const CREATOR = 'dcterms:creator';
    public const CONTRIBUTOR = 'dcterms:contributor';
    public const PUBLISHER = 'dcterms:publisher';
    public const AUTHOR_LIST = 'bibo:authorList';
    public const EDITOR_LIST = 'bibo:editorList';
    public const CONTENT = 'bibo:content';
    public const IS_FUNDED_BY = 'frapo:isFundedBy';
    public const MEMBER = 'foaf:member';
    public const DRE_ID = 'dre:id';
    public const DRE_SERIES = 'dre:series';

    /** Whether $id is an organisation (foaf:Organization) in a DataLoader item map. */
    public static function isOrganisation(array $items, int|string $id): bool
    {
        return ($items[$id]['class_term'] ?? '') === self::CLASS_ORGANIZATION;
    }

    /**
     * Whether a link is an affiliation: dcterms:isPartOf pointing at an
     * organisation, the way a person (or a group) names the institution it
     * belongs to. A dcterms:isPartOf to a project or a place is not one.
     */
    public static function isAffiliation(string $term, array $items, int|string $target): bool
    {
        return $term === self::IS_PART_OF && self::isOrganisation($items, $target);
    }
}
