# npm-version-tree

Module to fetch the most possible available versions tree for a NPM module.

## How to use

### Fetching versions from NPM by a name

```js
const versionTree = require('npm-version-tree');

versionTree(require('./package.json').name, '*', {production: true})
  .then(tree => {
    console.log('latest version: ', tree.version);
    console.log('deps: ', tree.deps);
  });
```

### Fetching versions by a file tree by a path to package directory

```js
const versionTree = require('npm-version-tree');

versionTree.onFs('.', {production: true})
  .then(tree => {
    console.log('current version: ', tree.version);
    console.log('deps: ', tree.deps);
  });
```

### API

```js
/**
 * Fetchs version tree.
 *
 * @param {String} name - Name of the original package
 * @param {?String} range - Version or range in semver format
 * @param {Object} opts - Additional options like production
 * @returns {Promise<{name: String, range: String, version: String, deps: Array}>}
 */
```
