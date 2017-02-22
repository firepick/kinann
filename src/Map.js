

var mathjs = require("mathjs");

(function(exports) {
    ////////////////// constructor
    function Map(options={}) {
        var that = this;
        that.minPos = options.minPos || 0; // minimum position
        that.maxPos = options.maxPos || 100; // maximum position
        return that;
    }

    module.exports = exports.Map = Map;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Map", function() {
    var should = require("should");
})
