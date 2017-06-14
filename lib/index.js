'use strict';

const assert = require('assert');
const path = require('path');

const semver = require('semver');
const packageJson = require('package-json');
const fileEval = require('file-eval');

module.exports = versionTree;
versionTree.onFs = onFs;

class Cache {
    constructor(keyFn) {
        this.key = keyFn;
        this.storage = Object.create(null);
    }
    add(pkg) {
        this.storage[this.key(pkg)] = pkg;
    }
    get(pkg) {
        return this.storage[this.key(pkg)];
    }
}

const cache = new Cache(o => `${o.name}#${o.range}`);
const fetchCache = new Cache(o => o.name);

function fetchPackageJson(name, range) {
    assert(typeof name === 'string', '`name` param should be a string');
    range || (range = 'latest');

    return Promise.resolve(
        fetchCache.get({name}) ||
        packageJson(name)
            .catch(() => packageJson(name)) // And 2 retries
            .catch(() => packageJson(name))
            .then(data => { // Caching
                data._versions = Object.keys(data.versions);
                fetchCache.add(data);
                return data;
            }))
        .then(data => {
            const lookFor = data['dist-tags'][range] || range;
            const latestPossible = semver.maxSatisfying(data._versions, lookFor);
            assert(latestPossible, `Version not found: ${name}#${range}.`);

            return data.versions[latestPossible];
        });
}

/**
 * Fetchs version tree.
 *
 * @param {String} name - Name of the original package
 * @param {?String} range - Version or range in semver format
 * @param {Object} opts - Additional options like production
 * @returns {Promise<{name: String, range: String, version: String, deps: Array}>}
 */
function versionTree(name, range, opts) {
    if (typeof range === 'object') {
        opts = range;
        range = null;
    }
    opts || (opts = {});

    if (range && !semver.validRange(range)) {
        return Promise.resolve({name, version: range});
    }

    return new Promise((resolve, reject) => {
        fetchPackageJson(name, range)
            .then(pkg => {
                if (cache.get(pkg)) {
                    return cache.get(pkg);
                }

                const res = {
                    name: pkg.name,
//                    range: range,
                    version: pkg.version
                };
                cache.add(res);

                const pkgs = [];
                pkg.dependencies && Object.keys(pkg.dependencies).forEach(name => {
                    pkgs.push(versionTree(name, pkg.dependencies[name], {production: true}));
                });
                opts.production || pkg.devDependencies && Object.keys(pkg.devDependencies).forEach(name => {
                    pkgs.push(versionTree(name, pkg.devDependencies[name], {production: true}));
                });

                if (!pkgs.length) {
                    return res;
                }

                return Promise.all(pkgs)
                    .then(_pkgs => (res.deps = _pkgs, res));
            })
            .catch(e => { throw new Error(`${name}#${range} → ` + e) })
            .then(resolve, reject);
    });
}

function onFs(dirname, opts) {
    const packageJsonPath = path.join(dirname, 'package.json');
    const res = {};

    return fileEval(packageJsonPath)
        .then(content => {
            res.name = content.name;
            res.version = content.version;
            res.deps = [];

            return Promise.all(Object.keys(content.dependencies || {}).map(name => {
                return versionTree(name, content.dependencies[name], {production: true})
                    .then(vTree => res.deps.push(vTree));
            }));
        })
        .then(() => res);
}

// function _ptreeTraverse(node) {
//     const res = {};

//     res.name = node.package.name;
//     res.version = node.package.version;

//     node.children.length && (res.deps = node.children.map(dep => _ptreeTraverse(dep)));

//     return res;
// }
