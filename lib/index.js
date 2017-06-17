'use strict';

const assert = require('assert');

const debug = require('debug')('npm-version-tree');
const semver = require('semver');
const packageJson = require('package-json');
const fileEval = require('file-eval');

module.exports = versionTree;
versionTree.onFs = onFs;

const wait = (timeout) => new Promise((resolve) => void setTimeout(resolve, timeout));

class Cache {
    constructor(keyFn) {
        this.key = keyFn;
        this.storage = Object.create(null);
    }
    add(pkg) {
        const key = this.key(pkg);
        debug(`Store ${key} to cache: ${pkg.version}.`);
        this.storage[key] = pkg;
    }
    get(pkg) {
        const key = this.key(pkg);
        const res = this.storage[key];
        debug(`Retrieve ${key} from cache: ${res ? res.version : 'miss'}.`);
        return res;
    }
}

const cache = new Cache(o => `${o.name}#${o.version}`);
const fetchCache = new Cache(o => o.name);

function fetchPackageJson(name, range) {
    assert(typeof name === 'string', '`name` param should be a string');
    range || (range = 'latest');

    debug(`Fetching ${name}#${range}...`);
    return Promise.resolve(
        fetchCache.get({name}) ||
        packageJson(name)
            .catch(() => wait(3000).then(() => packageJson(name))) // And 2 retries
            .catch(() => wait(10000).then(() => packageJson(name)))
            .then(data => { // Caching
                data._versions = Object.keys(data.versions);
                fetchCache.add(data);
                return data;
            }))
        .then(data => {
            const lookFor = data['dist-tags'][range] || range;
            const latestPossible = semver.maxSatisfying(data._versions, lookFor);
            assert(latestPossible, `Version not found: ${name}#${range}.`);

            const res = data.versions[latestPossible];
            assert(res, `Version not found: ${name}#${range}. Use one of: ${data._versions.join(', ')}.`);

            debug(`Result for ${name}#${range}: ${res.version}.`);
            return res;
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

    const depth = opts.depth;

    return new Promise((resolve, reject) => {
        fetchPackageJson(name, range)
            .then(pkg => {
                // Get from cache to prevent recursions
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
                depth && pkg.dependencies && Object.keys(pkg.dependencies).forEach(name => {
                    pkgs.push(versionTree(name, pkg.dependencies[name], {production: true, depth: depth - 1}));
                });
                opts.production || depth && pkg.devDependencies && Object.keys(pkg.devDependencies).forEach(name => {
                    pkgs.push(versionTree(name, pkg.devDependencies[name], {production: true, depth: depth - 1}));
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

function onFs(packageJsonPath, opts) {
    opts || (opts = {});

    const res = {};
    const depth = opts.hasOwnProperty('depth') ? opts.depth : Infinity;

    return fileEval(packageJsonPath)
        .then(content => {
            res.name = content.name;
            res.version = content.version;
            res.deps = [];

            return depth && Promise.all(Object.keys(content.dependencies || {}).map(name => {
                return versionTree(name, content.dependencies[name], {production: true, depth: depth - 1})
                    .then(vTree => res.deps.push(vTree));
            }).concat(opts.production ? [] : Object.keys(content.devDependencies || {}).map(name => {
                return versionTree(name, content.devDependencies[name], {production: true, depth: depth - 1})
                    .then(vTree => res.deps.push(vTree));
            })));
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
