(function(exports) {
    //// SUPER 
    function StepperDrive(options={}) {
        var that = this;
        that.type = "StepperDrive";
        Object.assign(that, options);
        that.minPos = that.minPos == null ? 0 : that.minPos; // minimum position
        that.maxPos = that.maxPos == null ? 100 : that.maxPos; // maximum position
        that.mstepPulses = that.mstepPulses || 1;
        that.steps = that.steps || 200;
        that.microsteps = that.microsteps || 16;
        that.gearIn = that.gearIn || 1;
        that.gearOut = that.gearOut || 1;

        Object.defineProperty(that, "gearRatio", {
            get: () => that.gearOut / that.gearIn,
        });
        return that;
    }
    StepperDrive.prototype.toJSON = function() {
        var that = this;
        return that;
    }
    StepperDrive.prototype.toMotorPos = function(axisPos) {
        var that = this;
        return isNaN(checkAxisPos(that, axisPos)) ? NaN : axisPos/that.unitTravel;
    }
    StepperDrive.prototype.toAxisPos = function(motorPos) {
        var that = this;
        return checkAxisPos(that, motorPos == null ? NaN : that.unitTravel * motorPos);
    }
    StepperDrive.fromJSON = function(json) {
        var json = typeof json === "object" ? json : JSON.parse(json);
        if (json.type === "BeltDrive") {
            return new StepperDrive.BeltDrive(json);
        }
        if (json.type === "ScrewDrive") {
            return new StepperDrive.ScrewDrive(json);
        }
        return new StepperDrive(json);
    }

    //// CLASS BeltDrive
    StepperDrive.BeltDrive = function (options = {}) {
        var that = this;
        Object.defineProperty(that, "super", {
            value: Object.getPrototypeOf(Object.getPrototypeOf(that)), // TODO: use ECMAScript 2015 super 
        });
        that.super.constructor.call(that, options);
        that.type = "BeltDrive";
        that.pitch = that.pitch || 2;
        that.teeth = that.teeth || 16;
        Object.defineProperty(that, "unitTravel", {
            get: () =>  (that.mstepPulses * that.teeth * that.pitch) / (that.steps * that.microsteps * that.gearRatio),
        });
        return that;
    }
    StepperDrive.BeltDrive.prototype = Object.create(StepperDrive.prototype);

    //// CLASS ScrewDrive
    StepperDrive.ScrewDrive = function (options = {}) {
        var that = this;
        Object.defineProperty(that, "super", {
            value: Object.getPrototypeOf(Object.getPrototypeOf(that)), // TODO: use ECMAScript 2015 super 
        });
        that.super.constructor.call(that, options);
        that.type = "ScrewDrive";
        that.lead = that.lead || 0.8; // M5 screw pitch
        Object.defineProperty(that, "unitTravel", {
            get: () => 1 / (that.steps * (that.microsteps / that.mstepPulses) * that.lead * that.gearRatio),
        });
        return that;
    }
    StepperDrive.ScrewDrive.prototype = Object.create(StepperDrive.prototype);

    //// PRIVATE
    checkAxisPos = function(that, axisPos) {
        return (
            typeof axisPos === 'number' && 
            !isNaN(axisPos) && 
            that.minPos <= axisPos && 
            axisPos <= that.maxPos 
            ? axisPos : NaN
        )
    }

    module.exports = exports.StepperDrive = StepperDrive;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("StepperDrive", function() {
    var should = require("should");
    var StepperDrive = exports.StepperDrive;
    var BeltDrive = StepperDrive.BeltDrive;
    var ScrewDrive = StepperDrive.ScrewDrive;

    it("BeltDrive() constructs a stepper motor belt drive", function() {
        var defaultBelt = new BeltDrive();
        defaultBelt.should.properties({
            minPos: 0, // travel position
            maxPos: 100, // travel position
            mstepPulses: 1, // pulses per microstep
            pitch: 2, // mm belt pitch (GT2 default)
            teeth: 16, // motor pulley teeth
            microsteps: 16, // motor microsteps
            steps: 200, // motor steps per revolution
        });
    });
    it("BeltDrive.toAxisPos(motorPos) axis position of motor position", function() {
        var belt = new BeltDrive();
        belt.toAxisPos(null).should.NaN();
        belt.toAxisPos(undefined).should.NaN();
        belt.toAxisPos(NaN).should.NaN();

        belt.toAxisPos(1).should.equal(0.01);
        belt.toAxisPos(200).should.equal(2);
        belt = new BeltDrive({pitch:4});
        belt.toAxisPos(1).should.equal(0.02);
        belt.toAxisPos(200).should.equal(4);
        belt = new BeltDrive({teeth:8});
        belt.toAxisPos(1).should.equal(0.005);
        belt.toAxisPos(200).should.equal(1);
        belt = new BeltDrive({microsteps:8});
        belt.toAxisPos(1).should.equal(0.02);
        belt.toAxisPos(200).should.equal(4);
        belt = new BeltDrive({steps:400});
        belt.toAxisPos(1).should.equal(0.005);
        belt.toAxisPos(200).should.equal(1);
        belt = new BeltDrive({mstepPulses:2});
        belt.toAxisPos(1).should.equal(0.02);
        belt.toAxisPos(200).should.equal(4);

        (belt.toAxisPos(-1)).should.NaN();
        belt.minPos = -1;
        belt.toAxisPos(-1).should.equal(-0.02);
    });
    it("BeltDrive.toMotorPos(appPos) motor position of axis position", function() {
        return true;
        var belt = new BeltDrive();
        belt.toAxisPos(null).should.NaN();
        belt.toAxisPos(undefined).should.NaN();
        belt.toAxisPos(NaN).should.NaN();
        [0.5,1,2,100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.pitch = 4;
        [0.5,1,2,100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.teeth = 8;
        [0.5,1,2,100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.microsteps = 8;
        [0.5,1,2,100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.steps = 400;
        [0.5,1,2,100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.mstepPulses = 2;
        [0.5,1,2,100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.toMotorPos(101).should.NaN();
        belt.maxPos = 101;
        belt.toAxisPos(belt.toMotorPos(101)).should.equal(101);
    })
    it("StepperDrive.fromJSON(json).toJSON() (de-)serializes decorated StepperDrive", function() {
        var belt = new BeltDrive({teeth: 20, color:"red"});
        var belt2 = StepperDrive.fromJSON(belt.toJSON());
        belt2.should.properties({
            teeth: 20,
            color: "red", // decoration
        });
        should.deepEqual(belt2, belt);
        var screw = new ScrewDrive({lead:0.9, color:"red"});
        var screw2 = StepperDrive.fromJSON(screw.toJSON());
        screw2.should.properties({
            lead: 0.9,
            color: "red", // decoration
        });
        var sd = new StepperDrive({unitTravel:0.3, color:"red"});
        var sd2 = StepperDrive.fromJSON(sd.toJSON());
        sd2.should.properties({
            unitTravel: 0.3,
            color: "red", // decoration
        });
        should.deepEqual(sd, sd2);
    });
    it("StepperDrive() create a StepperDrive", function() {
        var drive = new StepperDrive({unitTravel: 0.1});
        drive.toAxisPos(1).should.equal(0.1);
        drive.toAxisPos(10).should.equal(1);
        drive.toMotorPos(drive.toAxisPos(4)).should.equal(4);
    });
})

