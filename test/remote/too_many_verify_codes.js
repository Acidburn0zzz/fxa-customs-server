/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var test = require('tap').test
var TestServer = require('../test_server')
var Promise = require('bluebird')
var restify = Promise.promisifyAll(require('restify'))
var mcHelper = require('../memcache-helper')

var TEST_IP = '192.0.2.1'
var VERIFY_CODE = 'recoveryEmailVerifyCode'

var config = {
  listen: {
    port: 7000
  }
}

// Override limit values for testing
process.env.MAX_VERIFY_CODES = 2
process.env.RATE_LIMIT_INTERVAL_SECONDS = 1
process.env.IP_RATE_LIMIT_INTERVAL_SECONDS = 1
process.env.IP_RATE_LIMIT_BAN_DURATION_SECONDS = 1

var testServer = new TestServer(config)

var client = restify.createJsonClient({
  url: 'http://127.0.0.1:' + config.listen.port
})

Promise.promisifyAll(client, { multiArgs: true })

test(
  'startup',
  function (t) {
    testServer.start(function (err) {
      t.type(testServer.server, 'object', 'test server was started')
      t.notOk(err, 'no errors were returned')
      t.end()
    })
  }
)

test(
  'clear everything',
  function (t) {
    mcHelper.clearEverything(
      function (err) {
        t.notOk(err, 'no errors were returned')
        t.end()
      }
    )
  }
)

test(
  '/check `recoveryEmailVerifyCode` by email',
  function (t) {

    // Send requests until throttled
    return client.postAsync('/check', { ip: TEST_IP, email: 'test1@example.com', action: VERIFY_CODE })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, false, 'not rate limited')
        return client.postAsync('/check', { ip: TEST_IP, email: 'test1@example.com', action: VERIFY_CODE })
      })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, false, 'not rate limited')
        return client.postAsync('/check', { ip: TEST_IP, email: 'test1@example.com', action: VERIFY_CODE })
      })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, true, 'rate limited')
        t.equal(obj.retryAfter, 1, 'rate limit retry amount')

        // Delay ~1s for rate limit to go away
        return Promise.delay(1010)
      })

      // Reissue requests to verify that throttling is disabled
      .then(function(){
        return client.postAsync('/check', { ip: TEST_IP, email: 'test1@example.com', action: VERIFY_CODE })
      })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, false, 'not rate limited')
        t.end()
      })
      .catch(function(err){
        t.fail(err)
        t.end()
      })
  }
)

test(
  'clear everything',
  function (t) {
    mcHelper.clearEverything(
      function (err) {
        t.notOk(err, 'no errors were returned')
        t.end()
      }
    )
  }
)

test(
  '/check `recoveryEmailVerifyCode` by ip',
  function (t) {

    // Send requests until throttled
    return client.postAsync('/check', { ip: TEST_IP, email: 'test2@example.com', action: VERIFY_CODE })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, false, 'not rate limited')
        return client.postAsync('/check', { ip: TEST_IP, email: 'test3@example.com', action: VERIFY_CODE })
      })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, false, 'not rate limited')
        // Repeat email, not rate-limited yet.
        return client.postAsync('/check', { ip: TEST_IP, email: 'test2@example.com', action: VERIFY_CODE })
      })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, false, 'not rate limited')
        return client.postAsync('/check', { ip: TEST_IP, email: 'test4@example.com', action: VERIFY_CODE })
      })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, true, 'rate limited')
        t.equal(obj.retryAfter, 1, 'rate limit retry amount')

        // Delay ~1s for rate limit to go away
        return Promise.delay(1010)
      })

      // Reissue requests to verify that throttling is disabled
      .then(function(){
        return client.postAsync('/check', { ip: TEST_IP, email: 'test4@example.com', action: VERIFY_CODE })
      })
      .spread(function(req, res, obj){
        t.equal(res.statusCode, 200, 'returns a 200')
        t.equal(obj.block, false, 'not rate limited')
        t.end()
      })
      .catch(function(err){
        t.fail(err)
        t.end()
      })
  }
)

test(
  'teardown',
  function (t) {
    testServer.stop()
    t.equal(testServer.server.killed, true, 'test server has been killed')
    t.end()
  }
)
