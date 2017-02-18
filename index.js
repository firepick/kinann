(function(exports) {
    ////////////////// constructor
    function Kinann() {
        var that = this;
        return that;
    }

    ///////////////// class ////////////////////
    Kinann.Optimizer = require("./src/ann/Optimizer");
    Kinann.Layer = require("./src/ann/Layer");
    Kinann.MapLayer = require("./src/ann/MapLayer");
    Kinann.Network = require("./src/ann/Network");
    Kinann.Sequential = require("./src/ann/Sequential");

    module.exports = exports.Kinann = Kinann;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Kinann", function() {
    var Kinann = exports.Kinann; // require("./Kinann");

})
