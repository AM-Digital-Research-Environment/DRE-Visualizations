<?php
namespace DreVisualizations;

return [
    'translator' => [
        'translation_file_patterns' => [[
            'type' => 'gettext', 'base_dir' => dirname(__DIR__) . '/language', 'pattern' => '%s.mo', 'text_domain' => null,
        ]],
    ],
    'block_layouts' => [
        'aliases' => [
            'collectionOverview' => 'dreCollectionOverview',
            'collectionDashboard' => 'dreCollectionDashboard',
            'discursiveCommunities' => 'dreDiscursiveCommunities',
            'spatialExploration' => 'dreSpatialExploration',
            'publications' => 'drePublications',
            'youtube' => 'dreYoutube',
            'podcasts' => 'drePodcasts',
            'projectExplorer' => 'dreProjectExplorer',
            'compareEntity' => 'dreCompareEntity',
            'compareGenres' => 'dreCompareGenres',
            'networkExplorer' => 'dreNetworkExplorer',
            'whatsNew' => 'dreWhatsNew',
            'photoBrowse' => 'drePhotoBrowse',
            'featuredCollections' => 'dreFeaturedCollections',
            'semanticMap' => 'dreSemanticMap',
        ],
        'invokables' => [
            'dreCollectionOverview' => Site\BlockLayout\CollectionOverview::class,
            'dreCollectionDashboard' => Site\BlockLayout\CollectionDashboard::class,
            'dreDiscursiveCommunities' => Site\BlockLayout\DiscursiveCommunities::class,
            'dreSpatialExploration' => Site\BlockLayout\SpatialExploration::class,
            'drePublications' => Site\BlockLayout\Publications::class,
            'dreYoutube' => Site\BlockLayout\YouTube::class,
            'drePodcasts' => Site\BlockLayout\Podcasts::class,
            'dreProjectExplorer' => Site\BlockLayout\ProjectExplorer::class,
            'dreCompareEntity' => Site\BlockLayout\CompareEntity::class,
            'dreCompareGenres' => Site\BlockLayout\CompareGenres::class,
            'dreNetworkExplorer' => Site\BlockLayout\NetworkExplorer::class,
            'dreWhatsNew' => Site\BlockLayout\WhatsNew::class,
            'drePhotoBrowse' => Site\BlockLayout\PhotoBrowse::class,
            'dreFeaturedCollections' => Site\BlockLayout\FeaturedCollections::class,
            'dreSemanticMap' => Site\BlockLayout\SemanticMap::class,
        ],
    ],
    'resource_page_block_layouts' => [
        'aliases' => [
            'knowledgeGraph' => 'dreKnowledgeGraph',
            'itemSetDashboard' => 'dreItemSetDashboard',
            'linkedItemsDashboard' => 'dreLinkedItemsDashboard',
            'siblingItemsSparkline' => 'dreSiblingItemsSparkline',
            'similarItems' => 'dreSimilarItems',
        ],
        'invokables' => [
            'dreKnowledgeGraph' => Site\ResourcePageBlockLayout\KnowledgeGraph::class,
            'dreItemSetDashboard' => Site\ResourcePageBlockLayout\ItemSetDashboard::class,
            'dreLinkedItemsDashboard' => Site\ResourcePageBlockLayout\LinkedItemsDashboard::class,
            'dreSiblingItemsSparkline' => Site\ResourcePageBlockLayout\SiblingItemsSparkline::class,
            'dreSimilarItems' => Site\ResourcePageBlockLayout\SimilarItems::class,
        ],
    ],
    'view_manager' => [
        'template_path_stack' => [
            dirname(__DIR__) . '/view',
        ],
    ],
    'view_helpers' => [
        'aliases' => ['dreDashboardAssets' => 'dashboardAssets'],
        'invokables' => [
            'dashboardAssets' => View\Helper\DashboardAssets::class,
        ],
        'factories' => [
            'dreFileUrl' => View\Helper\FileUrlFactory::class,
        ],
    ],
    'service_manager' => [
        'factories' => [
            Service\CanonicalSite::class => Service\CanonicalSiteFactory::class,
        ],
    ],
    'controllers' => [
        'factories' => [
            Controller\Admin\MaintenanceController::class => Controller\Admin\MaintenanceControllerFactory::class,
        ],
        'invokables' => [
            Controller\Site\EmbedController::class => Controller\Site\EmbedController::class,
            Controller\Site\DataController::class => Controller\Site\DataController::class,
            Controller\Site\BasemapController::class => Controller\Site\BasemapController::class,
        ],
    ],
    'form_elements' => [
        'invokables' => [
            Form\MaintenanceForm::class => Form\MaintenanceForm::class,
        ],
    ],
    'router' => [
        'routes' => [
            'admin' => [
                'child_routes' => [
                    'dre-visualizations' => [
                        'type' => \Laminas\Router\Http\Literal::class,
                        'options' => [
                            'route' => '/dre-visualizations',
                            'defaults' => [
                                '__NAMESPACE__' => 'DreVisualizations\Controller\Admin',
                                'controller' => Controller\Admin\MaintenanceController::class,
                                'action' => 'index',
                            ],
                        ],
                        'may_terminate' => true,
                        'child_routes' => [
                            'maintenance' => [
                                'type' => \Laminas\Router\Http\Literal::class,
                                'options' => [
                                    'route' => '/maintenance',
                                    'defaults' => [
                                        'controller' => Controller\Admin\MaintenanceController::class,
                                        'action' => 'index',
                                    ],
                                ],
                            ],
                            'maintenance-regenerate' => [
                                'type' => \Laminas\Router\Http\Literal::class,
                                'options' => [
                                    'route' => '/maintenance/regenerate',
                                    'defaults' => [
                                        'controller' => Controller\Admin\MaintenanceController::class,
                                        'action' => 'regenerate',
                                    ],
                                ],
                            ],
                            'maintenance-withdraw' => [
                                'type' => \Laminas\Router\Http\Literal::class,
                                'options' => [
                                    'route' => '/maintenance/withdraw',
                                    'defaults' => [
                                        'controller' => Controller\Admin\MaintenanceController::class,
                                        'action' => 'withdraw',
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
            // Public embed endpoint (children of Omeka's `site` route, so the
            // current site + public theme are resolved from :site-slug). Renders
            // any viz block — or a single chart from a dashboard block — on a
            // bare, theme-following page for iframe embedding on other sites.
            'site' => [
                'child_routes' => [
                    'dre-data' => [
                        'type' => \Laminas\Router\Http\Segment::class,
                        'options' => [
                            'route' => '/dre-data/:path',
                            'constraints' => ['path' => '[a-zA-Z0-9._/%-]+'],
                            'defaults' => [
                                '__NAMESPACE__' => 'DreVisualizations\\Controller\\Site',
                                'controller' => Controller\Site\DataController::class,
                                'action' => 'index',
                            ],
                        ],
                    ],
                    // The self-hosted basemap as a style URL (Site\BasemapStyle),
                    // named by window.RV_MAP_CONFIG when no basemap is configured.
                    'dre-basemap' => [
                        'type' => \Laminas\Router\Http\Segment::class,
                        'options' => [
                            'route' => '/dre-basemap/:mode',
                            'constraints' => ['mode' => 'light|dark'],
                            'defaults' => [
                                // Override the core `site` route's namespace, as
                                // dre-data and dre-embed do.
                                '__NAMESPACE__' => 'DreVisualizations\Controller\Site',
                                'controller' => Controller\Site\BasemapController::class,
                                'action' => 'index',
                            ],
                        ],
                    ],
                    'dre-embed' => [
                        'type' => \Laminas\Router\Http\Literal::class,
                        'options' => [
                            'route' => '/dre-embed',
                            'defaults' => [
                                // The core `site` route defaults __NAMESPACE__ to
                                // Omeka\Controller\Site; child routes inherit it and
                                // ModuleRouteListener would prepend it to our
                                // controller, mangling the FQCN to a non-existent
                                // class (→ controller-not-found 404). Override it
                                // here, mirroring this module's admin route.
                                '__NAMESPACE__' => 'DreVisualizations\Controller\Site',
                                'controller' => Controller\Site\EmbedController::class,
                                'action' => 'index',
                            ],
                        ],
                        'may_terminate' => true,
                        'child_routes' => [
                            'block' => [
                                'type' => \Laminas\Router\Http\Segment::class,
                                'options' => [
                                    'route' => '/:block',
                                    'constraints' => [
                                        'block' => '[a-z0-9-]+',
                                    ],
                                    'defaults' => [
                                        'action' => 'block',
                                    ],
                                ],
                                'may_terminate' => true,
                                'child_routes' => [
                                    // Single chart from a dashboard block, e.g.
                                    // /dre-embed/publications/coAuthorNetwork.
                                    'viz' => [
                                        'type' => \Laminas\Router\Http\Segment::class,
                                        'options' => [
                                            'route' => '/:viz',
                                            'constraints' => [
                                                'viz' => '[a-zA-Z0-9._-]+',
                                            ],
                                            'defaults' => [
                                                'action' => 'block',
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ],
    'navigation' => [
        'AdminModule' => [
            [
                'label' => 'DRE Visualizations', // @translate
                'route' => 'admin/dre-visualizations/maintenance',
                'resource' => Controller\Admin\MaintenanceController::class,
                'class' => 'o-icon-chart',
                'pages' => [
                    [
                        'route' => 'admin/dre-visualizations/maintenance-regenerate',
                        'visible' => false,
                    ],
                ],
            ],
        ],
    ],
];
