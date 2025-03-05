var fs = require('fs')
var path = require('path')
var readline = require('readline')
var util = require('util')

var extend = require('extend')
var rimraf = util.promisify(require('rimraf'))
var readdir = util.promisify(fs.readdir)

/**
 * If the first argument is an object, it's treated as the configuration
 * object to create a new "instance", and a new function will be
 * returned (see {@link safeWipeNew}).
 *
 * @param {String} dir Directory to wipe.
 * @param {Object} config Optional config.
 * @return {Promise}
 */
module.exports = function safeWipe (dir, config) {
  if (typeof dir === 'object') {
    return safeWipeNew(dir)
  }

  return safeWipeRaw(dir, defaults(config))
}

/**
 * Create a wipe function with given config.
 *
 * @param {Object} config
 * @return {Function}
 */
function safeWipeNew (config) {
  config = defaults(config)

  return function (dir) {
    safeWipeRaw(dir, config)
  }
}

/**
 * Apply default values to given config object.
 *
 * @param {Object} config
 * @return {Object}
 */
function defaults (config) {
  config = extend({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    ignore: ['.DS_Store', 'Thumbs.db'],
    parent: null,
    interactive: true,
    force: false,
    silent: false
  }, config || {})

  config.messages = extend({
    contained: "Source folder seems to be contained by destination folder.\nLet's not wipe everything out.",
    confirm: '[?] Destination folder will be wiped out. Are you sure you want to proceed? [y/N] ',
    abort: 'Destination folder not empty, aborting'
  }, config.messages || {})

  return config
}

/**
 * @param {String} dir
 * @param {Object} config
 * @return {Promise}
 */
function safeWipeRaw (dir, config) {
  var p = Promise.resolve()

  if (config.parent) {
    // Do not wipe if `dir` is a parent of supposed `config.parent`
    p = p.then(function () { return checkParent(dir, config) })
  }

  p = p.then(function () { return checkEmpty(dir, config) })
  p = p.then(function () { return rimraf(dir) })

  if (!config.silent) {
    p = p.catch(function (e) {
      config.stderr.write(e.message + '\n')
      throw e
    })
  }

  return p
}

/**
 * Check parent relation between `dir` and `config.parent`.
 *
 * @param {String} dir
 * @param {Object} config
 * @return {Promise}
 */
function checkParent (dir, config) {
  return new Promise((resolve, reject) => {
    if (isParent(config.parent, dir)) {
      reject(createError(config.messages.contained, 'CONTAINED'))
    } else {
      resolve()
    }
  })
}

/**
 * Check if the directory is considered as empty, otherwise prompt the
 * user for confirmation if allowed.
 *
 * @param {String} dir
 * @param {Object} config
 * @return {Promise}
*/
function checkEmpty (dir, config) {
  /*eslint-disable consistent-return */
  return isEmpty(dir, config).then(function (empty) {
    if (empty) {
      return
    }

    if (config.force) {
      return
    }

    if (!config.interactive) {
      throw createError(config.messages.abort, 'ABORT')
    }

    return prompt(config.messages.confirm, config).then(function (answer) {
      var proceed = /^y(es)?/i.test(answer)

      if (!proceed) {
        throw createError(config.messages.abort, 'ABORT')
      }
    })
  })
/*eslint-enable consistent-return */
}

/**
 * Prompt user with a question and listen to reply.
 *
 * @param {String} question
 * @param {Object} config
 * @return {Promise}
 * @see {@link http://nodejs.org/api/readline.html}
 */
function prompt (question, config) {
  return new Promise((resolve) => {
    var rl = readline.createInterface({
      input: config.stdin,
      output: config.stdout
    })

    rl.question(question, function (answer) {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * Check whether `parent` is a parent of `dir` or identical.
 *
 * @param {String} dir
 * @param {String} parent
 * @return {Boolean}
 */
function isParent (dir, parent) {
  return path.resolve(dir).indexOf(path.resolve(parent)) === 0
}

/**
 * Check whether passed directory is empty or does not exist.
 *
 * @param {String} dir
 * @param {Object} config
 * @return {Promise}
 */
function isEmpty (dir, config) {
  return readdir(dir).then(function (files) {
    files = files.filter(function (file) {
      return config.ignore.indexOf(file) === -1
    })

    return files.length === 0
  }).catch(function (e) {
    if (e.code === 'ENOENT') {
      return true
    }

    throw e
  })
}

/**
 * @param {String} message
 * @param {String} code
 * @return {Error}
 */
function createError (message, code) {
  var e = new Error(message)
  e.code = code
  return e
}
