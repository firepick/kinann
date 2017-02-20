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
    Kinann.Example = require("./src/ann/Example");
    Kinann.Factory = require("./src/kin/Factory");

    module.exports = exports.Kinann = Kinann;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Kinann", function() {
    var Kinann = exports.Kinann; // require("./Kinann");

})
