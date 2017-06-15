(function(exports) {
    const mathjs = require("mathjs");
    const MockSerial = require("./serial/MockSerial");
    const StepperDrive = require("./StepperDrive");
    const Variable = require("./Variable");
    const Network = require("./Network");
    const winston = require("winston");

    class DriveFrame {
        constructor(drives, options = {}) {
            this.type = "DriveFrame";
            this.drives = drives;
            this.serialDriver = options.serialDriver || new MockSerial(options);
            var driveNames = ["X", "Y", "Z", "A", "B", "C"];
            this.drives.forEach((drive, i) => {
                if (drive.name == null) {
                    drive.name = i < driveNames.length ? driveNames[i] : ("Drive" + (i + 1));
                }
            });
            this.backlash = options.backlash == null || options.backlash;
            this.deadbandScale = options.deadbandScale || 3; // provides continuous yet quick transition across deadband
            this.deadbandHome = options.deadbandHome || 0.5; // default is homing to minPos with backoff exceeding positive deadband

            Object.defineProperty(this, "deadband", {
                enumerable: true,
                get: () => this.state.slice(this.drives.length, 2 * this.drives.length).map((p) => p),
                set: (deadband) => {
                    throw new Error("attempt to set read-only property: deadband")
                },
            });
            Object.defineProperty(this, "axisPos", {
                enumerable: true,
                get: () => this.state.slice(0, this.drives.length),
                set: (axisPos) => {
                    if (!(axisPos instanceof Array) || axisPos.length !== this.drives.length) {
                        throw new Error("Expected array of length:" + this.drives.length + " axisPos:" + JSON.stringify(axisPos));
                    }
                    axisPos = this.clipAxisPos(axisPos);
                    var newpos = axisPos.map((pos, i) => {
                        var di = this.drives[i];
                        var deadbandOld = this.$state[i + this.drives.length];
                        if (this.state[i] === pos) {
                            var deadbandNew = deadbandOld;
                        } else if (pos === di.minPos) {
                            var deadbandNew = this.deadbandHome; // homing to minPos
                        } else {
                            var posDelta = pos - this.state[i];
                            var deadbandNew = mathjs.tanh(this.deadbandScale * posDelta);
                            deadbandNew = mathjs.min(0.5, mathjs.max(deadbandOld + deadbandNew, -0.5));
                        }
                        this.$state[i + this.drives.length] = deadbandNew;
                        this.$state[i] = pos;
                        return pos;
                    });
                    return newpos;
                },
            });
            Object.defineProperty(this, "state", {
                enumerable: true,
                get: () => this.$state.map((s) => s),
                set: (state) => ((this.$state = state.map((s) => s)), state),
            });
            Object.defineProperty(this, "outputTransform", {
                value: options.outputTransform ||
                    ((frame) => frame.state.slice(0, frame.drives.length)),
            });
            Object.defineProperty(this, "output", {
                get: () => this.outputTransform(this),
            });
            options.state && (this.state = options.state) || this.clearPos();
        }

        static fromJSON(json) {
            json = typeof json === "string" ? JSON.parse(json) : json;
            var frame = null;
            if (json.type === "DriveFrame") {
                const Factory = require("./Factory");
                json = typeof json === "string" ? JSON.parse(json) : json;
                var drives = json.drives.map((d) => StepperDrive.fromJSON(d));
                frame = new DriveFrame(drives, json);
                json.calibration && (frame.calibration = Factory.fromJSON(json.calibration));
            }
            return frame;
        }

        toJSON() {
            var obj = {
                type: "DriveFrame",
                state: this.state,
                axisPos: this.axisPos,
                backlash: this.backlash,
                deadbandScale: this.deadbandScale,
                drives: this.drives.map((d) => d.toJSON()),
                calibration: this.calibration,
            }
            return obj;
        }

        clipAxisPos(axisPos) {
            return axisPos.map((p, i) => {
                var di = this.drives[i];
                return p == null ? null : Math.min(Math.max(di.minPos, p), di.maxPos);
            });
        }

        clearPos() {
            this.state = (
                this.drives.map((d) => null)
                .concat(this.drives.map((d) => this.deadbandHome))
            );
        }

        home(options={}) {
            if (options.axis != null) {
                var drive = this.drives[options.axis];
                if (drive == null) {
                    throw new Error("home() invalid axis:" + options.axis);
                }
                var newAxisPos = this.axisPos.map((p, i) => i === options.axis ? this.drives[i].minPos : p);
            } else {
                var newAxisPos = this.drives.map((d) => d.minPos);
            }
            return new Promise((resolve, reject) => {
                var motorPos = this.toMotorPos(newAxisPos);
                this.serialDriver.home(motorPos).then(result => {
                    this.axisPos = newAxisPos;
                    resolve(this);
                }).catch(err => reject(err))
            });
        }

        moveTo(position) {
            if (position instanceof Array) {
                position = {
                    axis: position,
                }
            }
            if (position.axis) {
                var newPos = position.axis;
            } else if (position.motor) {
                var newPos = this.toAxisPos(position.motor);
            } else {
                throw new Error("moveTo() unknown position:" + JSON.stringify(position));
            }
            var oldPos = this.axisPos;
            var newAxisPos = newPos.map((p, i) => p == null ? oldPos[i] : p);
            newAxisPos = this.clipAxisPos(newAxisPos);
            return new Promise((resolve, reject) => {
                var motorPos = this.toMotorPos(newAxisPos);
                this.serialDriver.moveTo(motorPos).then(result => {
                    this.axisPos = newAxisPos;
                    resolve(this);
                }).catch( err => reject(err) );
            });
        }

        toAxisPos(motorPos) {
            return motorPos.map((m, i) => m == null ? null : this.drives[i].toAxisPos(m));
        }

        toMotorPos(axisPos) {
            return axisPos.map((a, i) => a == null ? null : this.drives[i].toMotorPos(a));
        }

        basisVariables() {
            var vars = this.drives.map((d) => new Variable([d.minPos, d.maxPos]))
            if (this.backlash) {
                var deadbandVars = this.drives.map((d) => new Variable([-0.5, 0.5]))
                vars = vars.concat(deadbandVars);
            }
            return vars;
        }

    } // class DriveFrame

    module.exports = exports.DriveFrame = DriveFrame;
})(typeof exports === "object" ? exports : (exports = {}));
