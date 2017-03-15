var mathjs = require("mathjs");

(function(exports) {

    ////////////////// constructor
    function Example(input, target) {
        var that = this;
        that.input = input; // training activation input
        that.target = target; // training activation output target
        return that;
    }

    Example.shuffle = function(a) {
        for (var i = a.length; i--;) {
            var j = mathjs.floor(mathjs.random() * (i + 1));
            var tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a;
    }

    module.exports = exports.Example = Example;
})(typeof exports === "object" ? exports : (exports = {}));
