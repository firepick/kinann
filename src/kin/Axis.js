
var mathjs = require("mathjs");

(function(exports) {
    ////////////////// constructor
    function Axis(options={}) {
        var that = this;
        that.minPos = options.minPos || 0; // minimum position
        that.maxPos = options.maxPos || 100; // maximum position
        return that;
    }

    module.exports = exports.Axis = Axis;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Axis", function() {
    var should = require("should");
    it("Non-enumarable properties", function() {
        var o1 = {
            a: "a1",
        };
        Object.defineProperty(o1, "b", {writable: true});
        should.deepEqual(Object.keys(o1), ['a']);
        o1.a = "aa1";
        o1.b = "bb1";
        should.deepEqual(Object.keys(o1), ['a']);
        should.deepEqual(Object.getOwnPropertyNames(o1), ['a', 'b']);
        should.deepEqual(o1, {
            a: "aa1",
        });
        o1.b.should.equal("bb1");
        Object.assign(o1, {
            a: "aaa1",
            b: "bbb1",
        });
        should.deepEqual(o1, {
            a: "aaa1",
        });
        o1.b.should.equal("bbb1");
    })
})
