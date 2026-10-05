<?php
require rtrim($argv[1] ?? (string) getenv('OMEKA_ROOT'), '/\\') . '/vendor/autoload.php';
require dirname(__DIR__) . '/bootstrap.php';
use Doctrine\DBAL\DriverManager;
use DreVisualizations\Precompute\DataLoader;
use DreVisualizations\Precompute\Aggregators;
use DreVisualizations\Precompute\SnapshotPublisher;
use DreVisualizations\Precompute\JsonArtifactWriter;
$conn = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
$conn->getWrappedConnection()->sqliteCreateFunction('CONCAT', static fn (...$s) => implode('', $s));
foreach ([
'CREATE TABLE resource (id INTEGER PRIMARY KEY, title TEXT, resource_template_id INTEGER, resource_class_id INTEGER, created TEXT, is_public INTEGER, resource_type TEXT)',
'CREATE TABLE site (id INTEGER, is_public INTEGER)',
'CREATE TABLE item_site (item_id INTEGER, site_id INTEGER)',
'CREATE TABLE resource_class (id INTEGER, vocabulary_id INTEGER, local_name TEXT, label TEXT)',
'CREATE TABLE vocabulary (id INTEGER, prefix TEXT)',
'CREATE TABLE property (id INTEGER, vocabulary_id INTEGER, local_name TEXT, label TEXT)',
'CREATE TABLE value (id INTEGER, resource_id INTEGER, property_id INTEGER, value_resource_id INTEGER, value TEXT, uri TEXT, is_public INTEGER)',
'CREATE TABLE item_item_set (item_id INTEGER, item_set_id INTEGER)',
'CREATE TABLE resource_template (id INTEGER, label TEXT, title_property_id INTEGER)',
'CREATE TABLE media (id INTEGER, item_id INTEGER, storage_id TEXT, extension TEXT, has_thumbnails INTEGER, has_original INTEGER, position INTEGER)',
'CREATE TABLE item (id INTEGER, primary_media_id INTEGER)',
] as $sql) $conn->executeStatement($sql);
$conn->insert('site', ['id'=>1, 'is_public'=>1]);
foreach ([1=>'Work', 2=>'Public subject', 3=>'Public place'] as $id=>$title) {
 $conn->insert('resource', ['id'=>$id, 'title'=>$title, 'resource_type'=>'Omeka\\Entity\\Item', 'is_public'=>1]);
 $conn->insert('item_site', ['item_id'=>$id, 'site_id'=>1]);
}
foreach ([1=>'dcterms',2=>'bibo',3=>'geo'] as $id=>$prefix) $conn->insert('vocabulary',compact('id','prefix'));
foreach ([[1,1,'subject'],[2,2,'authorList'],[3,3,'lat'],[4,3,'long'],[5,2,'content']] as [$id,$vid,$local]) $conn->insert('property',['id'=>$id,'vocabulary_id'=>$vid,'local_name'=>$local,'label'=>$local]);
foreach ([[1,1,1,2,null],[2,1,2,null,'PRIVATE AUTHOR'],[3,3,3,null,'12.3'],[4,3,4,null,'45.6'],[5,1,5,null,'PRIVATE TRANSCRIPT']] as [$id,$rid,$pid,$target,$literal]) $conn->insert('value',['id'=>$id,'resource_id'=>$rid,'property_id'=>$pid,'value_resource_id'=>$target,'value'=>$literal,'is_public'=>0]);
foreach ([10=>0,11=>1] as $id=>$visibility) {
 $conn->insert('resource',['id'=>$id,'title'=>'Media','resource_type'=>'Omeka\\Entity\\Media','is_public'=>$visibility]);
 $conn->insert('media',['id'=>$id,'item_id'=>1,'storage_id'=>$visibility?'public-image':'PRIVATE-IMAGE','extension'=>'jpg','has_thumbnails'=>1,'has_original'=>1,'position'=>$id-9]);
}
$conn->insert('item',['id'=>1,'primary_media_id'=>11]);
$conn->insert('item',['id'=>2]);
$conn->insert('item',['id'=>3]);
$conn->insert('resource',['id'=>77,'title'=>'Private set','resource_type'=>'Omeka\\Entity\\ItemSet','is_public'=>0]);
$conn->insert('item_item_set',['item_id'=>1,'item_set_id'=>77]);

function verify(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); echo "ok: $message\n"; }
$s = (new DataLoader($conn, 1))->load();
verify(count($s->items) === 3, 'Only scoped public items load');
verify(empty($s->links) && empty($s->literals) && empty($s->geo), 'Private relationships, literals, transcript and coordinates are excluded');
verify($s->items[1]['title'] === 'Item 1', 'Cached private title cannot leak');
verify($s->primaryMedia[1]['storage'] === 'public-image', 'Explicit public primary media selected');
verify(!isset($s->itemSets[77]), 'Private item set membership excluded');
$conn->executeStatement('UPDATE resource SET is_public=1 WHERE id=10');
verify((new DataLoader($conn, 1))->load()->primaryMedia[1]['storage'] === 'public-image', 'Explicit primary wins over media position');
$conn->executeStatement('UPDATE resource SET is_public=0 WHERE id=11');
verify(!isset((new DataLoader($conn, 1))->load()->primaryMedia[1]), 'Private explicit primary does not fall back to a different image');
$conn->executeStatement('UPDATE resource SET is_public=1 WHERE id=11');
// Duplicate links, cross-site targets, private linked resources and visible literal title.
$conn->insert('property', ['id'=>6, 'vocabulary_id'=>1, 'local_name'=>'title', 'label'=>'Title']);
$conn->insert('value', ['id'=>20, 'resource_id'=>1, 'property_id'=>6, 'value'=>'Visible title', 'is_public'=>1]);
foreach ([21,22] as $id) $conn->insert('value', ['id'=>$id, 'resource_id'=>1, 'property_id'=>1, 'value_resource_id'=>2, 'is_public'=>1]);
$s = (new DataLoader($conn, 1))->load();
verify(count($s->links[1]) === 1 && $s->reverseLinks[2]['dcterms:subject'] === [1], 'Relationship indexes deduplicate exact statements');
verify($s->items[1]['title'] === 'Visible title', 'First visible title is selected');
$counts=(new Aggregators())->aggregateItems([1,1], $s->items, [1=>[['dcterms:subject','Subject',2],['dcterms:subject','Subject',2]]], [], []);
verify($counts['totalItems']===1 && $counts['subjects'][0]['value']===1,'Counts are distinct items, not statements');
$conn->executeStatement('DELETE FROM item_site WHERE item_id=2');
verify(empty((new DataLoader($conn, 1))->load()->links), 'Cross-site target excluded');
$conn->insert('item_site', ['item_id'=>2,'site_id'=>1]);
// Full generator fixture includes a subcollection appearing beyond the parent cap.
$conn->insert('resource', ['id'=>6295, 'is_public'=>1, 'resource_type'=>'Omeka\\Entity\\ItemSet']);
$conn->insert('property', ['id'=>7, 'vocabulary_id'=>1, 'local_name'=>'identifier', 'label'=>'Identifier']);
for ($i=100; $i<=700; $i++) {
 $conn->insert('resource', ['id'=>$i, 'is_public'=>1, 'resource_type'=>'Omeka\\Entity\\Item', 'resource_template_id'=>10, 'created'=>'2026-01-01']);
 $conn->insert('item', ['id'=>$i]);
 $conn->insert('item_site', ['item_id'=>$i,'site_id'=>1]);
 $conn->insert('item_item_set', ['item_id'=>$i,'item_set_id'=>6295]);
 $conn->insert('resource', ['id'=>10000+$i,'is_public'=>1,'resource_type'=>'Omeka\\Entity\\Media']);
 $conn->insert('media',['id'=>10000+$i,'item_id'=>$i,'storage_id'=>'photo'.$i,'extension'=>'jpg','has_thumbnails'=>1,'has_original'=>1,'position'=>1]);
 $conn->insert('value',['id'=>10000+$i,'resource_id'=>$i,'property_id'=>7,'value'=>($i===700?'ORIXAFGM':'APMESTRENO').$i,'is_public'=>1]);
}
$root=sys_get_temp_dir().'/dre-integration-'.bin2hex(random_bytes(6));
$module=dirname(__DIR__,2);
$profile=\DreVisualizations\Precompute\AmiraProfile::fromFile($module.'/config/amira-profile.json');
try {
 $publisher=new SnapshotPublisher($root,1,'test');
 $manifest=$publisher->publish(function($dir) use($conn,$profile,$module) {
  return (new \DreVisualizations\Precompute\Runner($conn,1,$profile,$dir.'/item-dashboards',$dir.'/communities',$module.'/asset/data/geo/countries.geojson',$dir.'/knowledge-graphs',$dir.'/photo-galleries',$dir.'/featured-collections',$dir.'/item-set-dashboards',$module.'/data/wordclouds'))->run();
 });
 $store=new \DreVisualizations\Precompute\SnapshotStore($root);
 $gallery=\DreVisualizations\Precompute\PublishedSnapshot::readJson($root,'photo-galleries/6295.json');
 verify($gallery['total']===601 && count($gallery['photos'])===600,'Parent gallery reports true total while capping records');
 $entry=array_values(array_filter($profile->featuredCollections(),fn($e)=>($e['identifierPrefix']??null)==='ORIXAFGM'))[0];
 $gallery=\DreVisualizations\Precompute\PublishedSnapshot::readJson($root,'photo-galleries/collection-'.$entry['slug'].'.json');
 verify($gallery['total']===1 && $gallery['photos'][0]['id']===700,'Subcollection filtered before cap');
 $clean=true;
 foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS)) as $file) {
  if($file->isFile() && str_contains((string)file_get_contents($file->getPathname()),'PRIVATE')) $clean=false;
 }
 verify($clean,'No private marker in any generated artifact');
 $store->withdraw();
 verify(\DreVisualizations\Precompute\PublishedSnapshot::readJson($root,'photo-galleries/6295.json')===null,'Withdrawal disables server-side artifact reads');
 $conn->executeStatement('UPDATE site SET is_public=0 WHERE id=1');
 try {(new DataLoader($conn,1))->load(); throw new RuntimeException('private site accepted');}
 catch(RuntimeException $e) {verify(str_contains($e->getMessage(),'private or empty'),'Private canonical site fails closed');}
} finally {
 if(is_dir($root)) {
  foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $file) $file->isDir()?rmdir($file->getPathname()):unlink($file->getPathname());
  rmdir($root);
 }
}
echo "Database integration passed.\n";
