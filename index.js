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
    Kinann.Calibration = require("./src/Calibration");
    Kinann.AnnCalibration = require("./src/AnnCalibration");
    Kinann.MockSerial = require("./src/MockSerial");
    Kinann.models = {
        RotaryDelta: require("./src/models/RotaryDelta"),
    };

    module.exports = exports.Kinann = Kinann;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Kinann", function() {
    var Kinann = exports.Kinann; // require("./Kinann");

})
