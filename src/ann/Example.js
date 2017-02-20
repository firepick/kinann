var mathjs = require("mathjs");
var Kinann = require("../../index");

(function(exports) {

    ////////////////// constructor
    function Example(input, target) {
        var that = this;
        that.input = input; // training activation input
        that.target = target; // training activation output target
        return that;
    }

    module.exports = exports.Example = Example;
})(typeof exports === "object" ? exports : (exports = {}));
