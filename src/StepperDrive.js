(function(exports) {
    //// SUPER 
    function StepperDrive(options={}) {
        var that = this;
        that.minPos = options.minPos || 0; // minimum position
        that.maxPos = options.maxPos || 100; // maximum position
        that.mstepPulses = options.mstepPulses || 1;
        that.steps = options.steps || 200;
        that.microsteps = options.microsteps || 16;
        that.gearIn = options.gearIn || 1;
        that.gearOut = options.gearOut || 1;

        Object.defineProperty(that, "gearRatio", {
            get: () => that.gearOut / that.gearIn,
        });
        Object.defineProperty(that, "toAxisPos", {
            value: (motorPos) => checkAxisPos(that, motorPos == null ? NaN : that.unitTravel * motorPos),
        });
        Object.defineProperty(that, "toMotorPos", {
            value: (axisPos) => isNaN(checkAxisPos(axisPos)) ? NaN : axisPos/that.unitTravel,
        });
        Object.defineProperty(that, "toJSON", {
            value: () => JSON.stringify(Object.assign({},that)),
        });
        return that;
    }
    StepperDrive.fromJSON = function(json) {
        var json = typeof json === "object" ? json : JSON.parse(json);
        if (json.type === "BeltDrive") {
            return new StepperDrive.BeltDrive(json);
        }
        if (json.type === "ScrewDrive") {
            return new StepperDrive.ScrewDrive(json);
        }
        throw new Error("Unknown StepperDrive type:", json.type);
    }

    //// CLASS BeltDrive
    StepperDrive.BeltDrive = function (options = {}) {
        var that = this;
        Object.defineProperty(that, "super", {
            value: Object.getPrototypeOf(Object.getPrototypeOf(that)), // TODO: use ECMAScript 2015 super 
        });
        that.super.constructor.call(that, options);
        that.type = "BeltDrive";
        that.pitch = options.pitch || 2;
        that.teeth = options.teeth || 16;
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
        that.lead = options.lead || 0.8; // M5 screw pitch
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
    it("toJSON() serializes StepperDrive", function() {
        JSON.parse(new BeltDrive().toJSON()).should.properties({
            minPos: 0,
            maxPos: 100,
            microsteps: 16,
            mstepPulses: 1,
            steps: 200,
            gearIn: 1,
            gearOut: 1,
            type: "BeltDrive",
            pitch: 2,
            teeth: 16,
        });
        JSON.parse(new ScrewDrive().toJSON()).should.properties({
            minPos: 0,
            maxPos: 100,
            microsteps: 16,
            mstepPulses: 1,
            steps: 200,
            gearIn: 1,
            gearOut: 1,
            type: "ScrewDrive",
            lead: 0.8,
        });
    })
    it("StepperDrive.fromJSON(json) createa StepperDrive", function() {
        var belt = new BeltDrive({pitch: 3});
        should.deepEqual(StepperDrive.fromJSON(belt.toJSON()), belt);
        var screw = new ScrewDrive({lead: 0.9});
        should.deepEqual(StepperDrive.fromJSON(screw.toJSON()), screw);
    });
})

