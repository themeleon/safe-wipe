'use strict';

var fs = require('fs');
var path = require('path');
var readline = require('readline');

var Q = require('q');
var extend = require('extend');
var rimraf = Q.denodeify(require('rimraf'));

/**
 * If the first argument is an object, it's treated as the configuration
 * object to create a new "instance", and a new function will be
 * returned (see {@link maybeWipeNew}).
 *
 * @param  {String} dir Directory to wipe.
 * @param  {Object} config Optional config.
 * @return {Q.Promise}
 */
module.exports = function maybeWipe(dir, config) {
  if (typeof dir === 'object') {
    return maybeWipeNew(dir);
  }

  return maybeWipeRaw(dir, defaults(config));
};

/**
 * Create a wipe function with given config.
 *
 * @param  {Object} config
 * @return {Function}
 */
function maybeWipeNew(config) {
  config = defaults(config);

  return function (dir) {
    maybeWipeRaw(dir, config);
  };
}

/**
 * Apply default values to given config object.
 *
 * @param  {Object} config
 * @return {Object}
 */
function defaults(config) {
  config = extend({
    input: process.stdin,
    output: process.stdout,
    ignore: ['.DS_Store', 'Thumbs.db'],
    parent: null,
    interactive: true,
  }, config || {});

  config.messages = extend({
    contained: 'Source folder seems to be contained by destination folder.\nLet\'s not wipe everything out.',
    confirm: '[?] Destination folder will be wiped out. Are you sure you want to proceed: [y/N]',
    abort: 'Destination folder not empty, aborting',
  }, config.messages || {});

  return config;
}

/**
 * @param  {String} dir
 * @param  {Object} config
 * @return {Q.Promise}
 */
function maybeWipeRaw(dir, config) {
  var promises = [];

  if (config.parent) {
    // Do not wipe if `dir` is a parent of supposed `config.parent`
    promises.push(checkParent(dir, config));
  }

  if (!config.interactive) {
    promises.push(checkEmpty(dir));
  }

  promises.push(rimraf(dir));

  // Execute promises sequentially
  return promises.reduce(function (a, b) {
    return a.then(function () {
      return b;
    });
  });
}

/**
  * Check parent relation between `dir` and `config.parent`.
  *
  * @param  {String} dir
  * @param  {Object} config
  * @return {Q.Promise}
  */
function checkParent(dir, config) {
  var deferred = Q.defer();

  if (!isParent(dir, config.parent)) {
    deferred.resolve();
  } else {
    deferred.reject(new Error(config.messages.contained));
  }

  return deferred.promise;
}

/**
 * Check if the directory is considered as empty, otherwise prompt the
 * user for confirmation if allowed.
 *
 * @param  {String} dir
 * @param  {Object} config
 * @return {Q.Promise}
*/
function checkEmpty(dir, config) {
  /*eslint-disable consistent-return */
  return isEmpty(dir, config).then(function (empty) {

    if (empty) {
      return;
    }

    return prompt(config.messages.question, config).then(function (answer) {
      var proceed = /^y(es)?/i.test(answer);

      if (!proceed) {
        throw new Error(config.messages.abort);
      }
    });
  });
  /*eslint-enable consistent-return */
}

/**
 * Prompt user with a question and listen to reply.
 *
 * @param  {String} question
 * @param  {Object} config
 * @return {Q.Promise}
 * @see    {@link http://nodejs.org/api/readline.html}
 */
function prompt(question, config) {
  var deferred = Q.defer();

  var rl = readline.createInterface({
    input: config.input,
    output: config.output,
  });

  rl.question(question, function (answer) {
    rl.close();
    deferred.resolve(answer);
  });

  return deferred.promise;
}

/**
 * Check whether `parent` is a parent of `dir` or identical.
 *
 * @param  {String} dir
 * @param  {String} parent
 * @return {Boolean}
 */
function isParent(dir, parent) {
  return path.resolve(dir).indexOf(path.resolve(parent)) === 0;
}

/**
 * Check whether passed directory is empty or does not exist.
 *
 * @param  {String} dir
 * @param  {Object} config
 * @return {Q.Promise}
 */
function isEmpty(dir, config) {
  return Q.nfcall(fs.readdir, dir).then(function (files) {
    files = files.filter(function (file) {
      return config.ignore.indexOf(file) === -1;
    });

    return files.length === 0;
  }).catch(function (e) {
    if (e.code === 'ENOENT') {
      return true;
    }

    throw e;
  });
}
