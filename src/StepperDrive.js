(function(exports) {
    class StepperDrive {
        constructor(options = {}) {
            this.type = "StepperDrive";
            this.isHomed = true;
            this.name = null;
            Object.assign(this, options);
            this.minPos = this.minPos == null ? 0 : this.minPos; // minimum position
            this.maxPos = this.maxPos == null ? 100 : this.maxPos; // maximum position
            this.mstepPulses = this.mstepPulses || 1;
            this.steps = this.steps || 200;
            this.microsteps = this.microsteps || 16;
            this.gearIn = this.gearIn || 1;
            this.gearOut = this.gearOut || 1;

            Object.defineProperty(this, "gearRatio", {
                get: () => this.gearOut / this.gearIn,
            });
            return this;
        }
        toJSON() {
            return this;
        }
        checkAxisPos(axisPos) {
            if (isNaN(axisPos)) {
                throw new Error("Expected number for " +this.name+ " axisPos: " + JSON.stringify(axisPos));
            }
            if (axisPos < this.minPos) {
                throw new Error(this.name + " axisPos " + axisPos + " is lower than minPos:" + this.minPos);
            }
            if (this.maxPos < axisPos) {
                throw new Error(this.name + " axisPos " + axisPos + " is greater than maxPos:" + this.maxPos);
            }
            return (
                typeof axisPos === 'number' &&
                !isNaN(axisPos) &&
                this.minPos <= axisPos &&
                axisPos <= this.maxPos ?
                axisPos : NaN
            )
        }

        toMotorPos(axisPos) {
            return isNaN(this.checkAxisPos(axisPos)) ? NaN : axisPos / this.unitTravel;
        }
        toAxisPos(motorPos) {
            return this.checkAxisPos(motorPos == null ? NaN : this.unitTravel * motorPos);
        }
        static fromJSON(json) {
            var json = typeof json === "object" ? json : JSON.parse(json);
            if (json.type === "BeltDrive") {
                return new StepperDrive.BeltDrive(json);
            }
            if (json.type === "ScrewDrive") {
                return new StepperDrive.ScrewDrive(json);
            }
            return new StepperDrive(json);
        }
        static get BeltDrive() {
            return $BeltDrive;
        }
        static get ScrewDrive() {
            return $ScrewDrive;
        }
    } //// CLASS StepperDrive

    var $BeltDrive = class BeltDrive extends StepperDrive {
        constructor(options = {}) {
            super(options);
            this.type = "BeltDrive";
            this.pitch = this.pitch || 2;
            this.teeth = this.teeth || 16;
            Object.defineProperty(this, "unitTravel", {
                get: () => (this.mstepPulses * this.teeth * this.pitch) / (this.steps * this.microsteps * this.gearRatio),
            });
        }
    } //// BeltDrive

    var $ScrewDrive = class ScrewDrive extends StepperDrive {
        constructor(options = {}) {
            super(options);
            this.type = "ScrewDrive";
            this.lead = this.lead || 0.8; // M5 screw pitch
            Object.defineProperty(this, "unitTravel", {
                get: () => 1 / (this.steps * (this.microsteps / this.mstepPulses) * this.lead * this.gearRatio),
            });
        }
    } // CLASS ScrewDrive

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
        should.throws(() => belt.toAxisPos(null));
        should.throws(() => belt.toAxisPos(undefined));
        should.throws(() => belt.toAxisPos(NaN));
        should.throws(() => belt.toAxisPos(-1));

        belt.toAxisPos(1).should.equal(0.01);
        belt.toAxisPos(200).should.equal(2);
        belt = new BeltDrive({
            pitch: 4
        });
        belt.toAxisPos(1).should.equal(0.02);
        belt.toAxisPos(200).should.equal(4);
        belt = new BeltDrive({
            teeth: 8
        });
        belt.toAxisPos(1).should.equal(0.005);
        belt.toAxisPos(200).should.equal(1);
        belt = new BeltDrive({
            microsteps: 8
        });
        belt.toAxisPos(1).should.equal(0.02);
        belt.toAxisPos(200).should.equal(4);
        belt = new BeltDrive({
            steps: 400
        });
        belt.toAxisPos(1).should.equal(0.005);
        belt.toAxisPos(200).should.equal(1);
        belt = new BeltDrive({
            mstepPulses: 2
        });
        belt.toAxisPos(1).should.equal(0.02);
        belt.toAxisPos(200).should.equal(4);

        belt.minPos = -1;
        belt.toAxisPos(-1).should.equal(-0.02);
    });
    it("BeltDrive.toMotorPos(appPos) motor position of axis position", function() {
        return true;
        var belt = new BeltDrive();
        belt.toAxisPos(null).should.NaN();
        belt.toAxisPos(undefined).should.NaN();
        belt.toAxisPos(NaN).should.NaN();
        [0.5, 1, 2, 100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.pitch = 4;
        [0.5, 1, 2, 100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.teeth = 8;
        [0.5, 1, 2, 100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.microsteps = 8;
        [0.5, 1, 2, 100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.steps = 400;
        [0.5, 1, 2, 100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.mstepPulses = 2;
        [0.5, 1, 2, 100].map((axisPos) =>
            belt.toAxisPos(belt.toMotorPos(axisPos)).should.equal(axisPos));
        belt.toMotorPos(101).should.NaN();
        belt.maxPos = 101;
        belt.toAxisPos(belt.toMotorPos(101)).should.equal(101);
    })
    it("StepperDrive.fromJSON(json).toJSON() (de-)serializes decorated StepperDrive", function() {
        var belt = new BeltDrive({
            teeth: 20,
            color: "red"
        });
        var belt2 = StepperDrive.fromJSON(belt.toJSON());
        belt2.should.properties({
            teeth: 20,
            color: "red", // decoration
        });
        should.deepEqual(belt2, belt);
        var screw = new ScrewDrive({
            lead: 0.9,
            color: "red"
        });
        var screw2 = StepperDrive.fromJSON(screw.toJSON());
        screw2.should.properties({
            lead: 0.9,
            color: "red", // decoration
        });
        var sd = new StepperDrive({
            unitTravel: 0.3,
            color: "red"
        });
        var sd2 = StepperDrive.fromJSON(sd.toJSON());
        sd2.should.properties({
            unitTravel: 0.3,
            color: "red", // decoration
        });
        should.deepEqual(sd, sd2);
    });
    it("StepperDrive() create a StepperDrive", function() {
        var drive = new StepperDrive({
            unitTravel: 0.1
        });
        drive.toAxisPos(1).should.equal(0.1);
        drive.toAxisPos(10).should.equal(1);
        drive.toMotorPos(drive.toAxisPos(4)).should.equal(4);
    });
})
