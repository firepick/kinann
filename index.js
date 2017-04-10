(function(exports) {
    ////////////////// constructor
    function Kinann() {
        var that = this;
        return that;
    }

    ///////////////// class ////////////////////
    Kinann.Layer = require("./src/Layer");
    Kinann.MapLayer = require("./src/MapLayer");
    Kinann.Network = require("./src/Network");
    Kinann.Sequential = require("./src/Sequential");
    Kinann.Example = require("./src/Example");
    Kinann.Factory = require("./src/Factory");
    Kinann.Variable = require("./src/Variable");
    Kinann.DriveFrame = require("./src/DriveFrame");
    Kinann.StepperDrive = require("./src/StepperDrive");
    Kinann.Equations = require("./src/Equations");
    Kinann.models = {
        RotaryDelta: require("./src/models/RotaryDelta"),
    };
    Kinann.path = {
        AStarGraph: require("./src/path/AStarGraph"),
        PathFactory: require("./src/path/PathFactory"),
    };

    module.exports = exports.Kinann = Kinann;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Kinann", function() {
    var Kinann = exports.Kinann; // require("./Kinann");

})
