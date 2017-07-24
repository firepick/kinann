(function(exports) {
    class StepperDrive {
        constructor(options = {}) {
            this.type = "StepperDrive";
            this.isHomeable = true;
            this.name = null;
            Object.assign(this, options);
            this.minPos = this.minPos == null ? 0 : this.minPos; // minimum position
            this.maxPos = this.maxPos == null ? 100 : this.maxPos; // maximum position
            this.mstepPulses = this.mstepPulses || 1;
            this.steps = this.steps || 200;
            this.microsteps = this.microsteps || 16;
            this.gearIn = this.gearIn || 1;
            this.gearOut = this.gearOut || 1;

            // BeltDrive
            this.pitch = this.pitch || 2;
            this.teeth = this.teeth || 16;

            // ScrewDrive
            this.lead = this.lead || 0.8; // M5 screw pitch

            Object.defineProperty(this, "gearRatio", {
                get: () => this.gearOut / this.gearIn,
            });
            return this;
        }
        toJSON() {
            return this;
        }
        checkDrivePos(drivePos) {
            if (isNaN(drivePos)) {
                throw new Error("Expected number for " + this.name + " drivePos: " + JSON.stringify(drivePos));
            }
            if (drivePos < this.minPos) {
                throw new Error(this.name + " drivePos " + drivePos + " is lower than minPos:" + this.minPos);
            }
            if (this.maxPos < drivePos) {
                throw new Error(this.name + " drivePos " + drivePos + " is greater than maxPos:" + this.maxPos);
            }
            return (
                typeof drivePos === 'number' &&
                !isNaN(drivePos) &&
                this.minPos <= drivePos &&
                drivePos <= this.maxPos ?
                drivePos : NaN
            )
        }

        toMotorPos(drivePos) {
            return isNaN(this.checkDrivePos(drivePos)) ? NaN : drivePos / this.unitTravel;
        }
        toDrivePos(motorPos) {
            return this.checkDrivePos(motorPos == null ? NaN : this.unitTravel * motorPos);
        }
        static fromJSON(json) {
            var json = typeof json === "object" ? json : JSON.parse(json);
            if (json.type === "BeltDrive") {
                return new StepperDrive.BeltDrive(json);
            }
            if (json.type === "ScrewDrive") {
                return new StepperDrive.ScrewDrive(json);
            }
            if (json.type === "GearDrive") {
                return new StepperDrive.GearDrive(json);
            }
            return new StepperDrive(json);
        }
        static get BeltDrive() {
            return $BeltDrive;
        }
        static get ScrewDrive() {
            return $ScrewDrive;
        }
        static get GearDrive() {
            return $GearDrive;
        }
    } //// CLASS StepperDrive

    var $BeltDrive = class BeltDrive extends StepperDrive {
        constructor(options = {}) {
            super(options);
            this.type = "BeltDrive";
            Object.defineProperty(this, "unitTravel", {
                get: () => (this.mstepPulses * this.teeth * this.pitch) / (this.steps * this.microsteps * this.gearRatio),
            });
        }
    } //// BeltDrive

    var $ScrewDrive = class ScrewDrive extends StepperDrive {
        constructor(options = {}) {
            super(options);
            this.type = "ScrewDrive";
            Object.defineProperty(this, "unitTravel", {
                get: () => 1 / (this.steps * (this.microsteps / this.mstepPulses) * this.lead * this.gearRatio),
            });
        }
    } // CLASS ScrewDrive

    var $GearDrive = class GearDrive extends StepperDrive {
        constructor(options = {}) {
            super(options);
            this.type = "GearDrive";
            this.maxPos = 360;
            Object.defineProperty(this, "unitTravel", {
                get: () => 360 / (this.steps * (this.microsteps / this.mstepPulses) * this.gearRatio),
            });
        }
    } // CLASS GearDrive

    module.exports = exports.StepperDrive = StepperDrive;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("StepperDrive", function() {
    var should = require("should");
    var StepperDrive = exports.StepperDrive;
    var BeltDrive = StepperDrive.BeltDrive;
    var ScrewDrive = StepperDrive.ScrewDrive;
    var GearDrive = StepperDrive.GearDrive;

    it("BeltDrive() constructs a stepper motor belt drive", function() {
        var drive = new BeltDrive();
        drive.should.properties({
            minPos: 0, // travel position
            maxPos: 100, // travel position
            mstepPulses: 1, // pulses per microstep
            pitch: 2, // mm belt pitch (GT2 default)
            teeth: 16, // motor pulley teeth
            microsteps: 16, // motor microsteps
            steps: 200, // motor steps per revolution
            lead: 0.8, // latent ScrewDrive property
        });
        drive.toMotorPos(100).should.equal(100*1*16*200/(2*16));
        drive.toDrivePos(100*1*16*200/(2*16)).should.equal(100);
    });
    it("ScrewDrive() constructs a stepper motor screw drive", function() {
        var drive = new ScrewDrive();
        drive.should.properties({
            minPos: 0, // travel position
            maxPos: 100, // travel position
            mstepPulses: 1, // pulses per microstep
            pitch: 2, // latent BeltDrive property
            teeth: 16, // latent BeltDrive property
            microsteps: 16, // motor microsteps
            steps: 200, // motor steps per revolution
            lead: 0.8, // M5 screw
        });
        drive.toMotorPos(100).should.equal(100*1*16*200*0.8);
        drive.toDrivePos(100*1*16*200*0.8).should.equal(100);
    });
    it("GearDrive() constructs a stepper motor belt drive", function() {
        var drive = new GearDrive();
        drive.should.properties({
            minPos: 0, // travel position
            maxPos: 360, // travel position
            mstepPulses: 1, // pulses per microstep
            pitch: 2, // latent BeltDrive property
            teeth: 16, // latent BeltDrive property
            microsteps: 16, // motor microsteps
            steps: 200, // motor steps per revolution
            lead: 0.8, // latent ScrewDrive property
        });
        drive.toMotorPos(100).should.equal(100*1*16*200/360);
        drive.toDrivePos(100*1*16*200/360).should.equal(100);
    });
    it("BeltDrive.toDrivePos(motorPos) axis position of motor position", function() {
        var belt = new BeltDrive();
        should.throws(() => belt.toDrivePos(null));
        should.throws(() => belt.toDrivePos(undefined));
        should.throws(() => belt.toDrivePos(NaN));
        should.throws(() => belt.toDrivePos(-1));

        belt.toDrivePos(1).should.equal(0.01);
        belt.toDrivePos(200).should.equal(2);
        belt = new BeltDrive({
            pitch: 4
        });
        belt.toDrivePos(1).should.equal(0.02);
        belt.toDrivePos(200).should.equal(4);
        belt = new BeltDrive({
            teeth: 8
        });
        belt.toDrivePos(1).should.equal(0.005);
        belt.toDrivePos(200).should.equal(1);
        belt = new BeltDrive({
            microsteps: 8
        });
        belt.toDrivePos(1).should.equal(0.02);
        belt.toDrivePos(200).should.equal(4);
        belt = new BeltDrive({
            steps: 400
        });
        belt.toDrivePos(1).should.equal(0.005);
        belt.toDrivePos(200).should.equal(1);
        belt = new BeltDrive({
            mstepPulses: 2
        });
        belt.toDrivePos(1).should.equal(0.02);
        belt.toDrivePos(200).should.equal(4);

        belt.minPos = -1;
        belt.toDrivePos(-1).should.equal(-0.02);
    });
    it("BeltDrive.toMotorPos(appPos) motor position of axis position", function() {
        return true;
        var belt = new BeltDrive();
        belt.toDrivePos(null).should.NaN();
        belt.toDrivePos(undefined).should.NaN();
        belt.toDrivePos(NaN).should.NaN();
        [0.5, 1, 2, 100].map((drivePos) =>
            belt.toDrivePos(belt.toMotorPos(drivePos)).should.equal(drivePos));
        belt.pitch = 4;
        [0.5, 1, 2, 100].map((drivePos) =>
            belt.toDrivePos(belt.toMotorPos(drivePos)).should.equal(drivePos));
        belt.teeth = 8;
        [0.5, 1, 2, 100].map((drivePos) =>
            belt.toDrivePos(belt.toMotorPos(drivePos)).should.equal(drivePos));
        belt.microsteps = 8;
        [0.5, 1, 2, 100].map((drivePos) =>
            belt.toDrivePos(belt.toMotorPos(drivePos)).should.equal(drivePos));
        belt.steps = 400;
        [0.5, 1, 2, 100].map((drivePos) =>
            belt.toDrivePos(belt.toMotorPos(drivePos)).should.equal(drivePos));
        belt.mstepPulses = 2;
        [0.5, 1, 2, 100].map((drivePos) =>
            belt.toDrivePos(belt.toMotorPos(drivePos)).should.equal(drivePos));
        belt.toMotorPos(101).should.NaN();
        belt.maxPos = 101;
        belt.toDrivePos(belt.toMotorPos(101)).should.equal(101);
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
        var gear = new GearDrive({
            gearIn: 0.9,
            color: "red"
        });
        var gear2 = StepperDrive.fromJSON(gear.toJSON());
        gear2.should.properties({
            gearIn: 0.9,
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
        drive.toDrivePos(1).should.equal(0.1);
        drive.toDrivePos(10).should.equal(1);
        drive.toMotorPos(drive.toDrivePos(4)).should.equal(4);
    });
})
