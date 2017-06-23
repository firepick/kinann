// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("MockSerialDriver", function() {
    const should = require('should');
    const MockSerialDriver = exports.MockSerialDriver || require('../index').serial.MockSerialDriver;

    it('home(motorPos) home designated axes', function(done) {
        var async = function*() {
            var sd = new MockSerialDriver();
            var result = yield sd.home([1, 2, 3]).then(r => async.next(r));
            should.deepEqual(result, [1, 2, 3]);
            should.deepEqual(sd.commands, [{
                home: [1, 2, 3],
            }]);
            done();
        }();
        async.next();
    });
    it('moveTo(motorPos) moves to designated position', function(done) {
        var async = function*() {
            var sd = new MockSerialDriver();
            var result = yield sd.moveTo([1, 2, 3]).then(r => async.next(r));
            should.deepEqual(result, [1, 2, 3]);
            should.deepEqual(sd.commands, [{
                moveTo: [1, 2, 3],
            }]);
            done();
        }();
        async.next();
    });
})