# apps/server

`NexusApp.ts` is the only composition root. Other modules receive their dependencies through
constructors. Route groups are controller classes, and tables are accessed through repository classes.
The plugin installer (`ZipSource`, `GitSource`, `ManifestValidator`) lives in `src/plugins/install/`.
