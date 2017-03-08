var mathjs = require("mathjs");
var StepperDrive = require("./StepperDrive");
var Factory = require("./Factory");
var Variable = require("./Variable");
var Example = require("./Example");
var Network = require("./Network");

(function(exports) {
    //// CLASS
    function DriveFrame(drives, options={}) {
        var that = this;
        that.type = "DriveFrame";
        that.drives = drives;
        that.backlash = options.backlash == null || options.backlash;
        that.deadbandScale = options.deadbandScale || 3; // provides continuous yet quick transition across deadband
        that.deadbandHome = options.deadbandHome || 0.5; // default is homing to minPos with backoff exceeding positive deadband

        Object.defineProperty(that, "deadband", {
            enumerable: true,
            get: () => that.state.slice(that.drives.length, 2*that.drives.length).map((p) => p),
            set: (deadband) => {throw new Error("attempt to set read-only property: deadband")},
        });
        Object.defineProperty(that, "axisPos", {
            enumerable: true,
            get: () => that.state.slice(0, that.drives.length),
            set: (axisPos) => {
                if (!(axisPos instanceof Array) || axisPos.length !== that.drives.length) {
                    throw new Error("Expected array of length:"+that.drives.length + " axisPos:"+JSON.stringify(axisPos));
                }
                return axisPos.map((p,i) => {
                    var di = that.drives[i];
                    var pos = mathjs.min(mathjs.max(di.minPos,p), di.maxPos);
                    var deadbandOld = that.$state[i+that.drives.length];
                    if (that.state[i] === pos) {
                        var deadbandNew = deadbandOld;
                    } else if (pos === di.minPos) {
                        var deadbandNew = that.deadbandHome; // homing to minPos
                    } else {
                        var posDelta = pos - that.state[i];
                        var deadbandNew = mathjs.tanh(that.deadbandScale*posDelta);
                        deadbandNew = mathjs.min(0.5,mathjs.max(deadbandOld+deadbandNew,-0.5));
                    }
                    that.$state[i+that.drives.length] = deadbandNew;
                    that.$state[i] = pos;
                    return pos;
                });
            },
        });
        Object.defineProperty(that, "state", {
            enumerable: true,
            get: () => that.$state.map((s) => s),
            set: (state) => ((that.$state = state.map((s) => s)), state),
        });
        Object.defineProperty(that, "calibratedState", {
            enumerable: true,
            get: () => that.calibratedStateOf(),
            set: (state) => { throw new Error("calibratedState is read-only"); },
        });
        Object.defineProperty(that, "outputTransform", {
            value: options.outputTransform || 
                ((frame) => frame.state.slice(0, frame.drives.length)),
        });
        Object.defineProperty(that, "output", {
            get: () => that.outputTransform(that),
        });

        // initialize
        that.state = options.state || (
            that.drives.map((d) => d.minPos)
            .concat(that.drives.map((d) => that.deadbandHome))
        );

        return that;
    }
    DriveFrame.fromJSON = function(json) {
        json = typeof json === "string" ? JSON.parse(json) : json;
        var drives = json.drives.map((d) => StepperDrive.fromJSON(d));
        var frame = new DriveFrame(drives, json);
        json.annCalibrated && (frame.annCalibrated = Network.fromJSON(json.annCalibrated));
        return frame;
    }

    //// INSTANCE
    DriveFrame.prototype.toJSON = function() {
        var that = this;
        var obj = {
            type: "DriveFrame",
            state: that.state,
            axisPos: that.axisPos,
            backlash: that.backlash,
            deadbandScale: that.deadbandScale,
            drives: that.drives.map((d) => d.toJSON()),
            annCalibrated: that.annCalibrated,
        }
        return obj;
    }
    DriveFrame.prototype.home = function() {
        var that = this;
        that.axisPos = that.drives.map((d) => d.minPos);
        return that;
    }
    DriveFrame.prototype.moveTo = function(axisPos) {
        var that = this;
        that.axisPos = axisPos;
        return that;
    }
    DriveFrame.prototype.calibrationExamples = function(nExamples=30, options={}) {
        var that = this;
        var vars = that.variables().slice(0, that.drives.length);
        var measuredPos = options.measuredPos || ((pos) => pos);
        var targetState = options.targetState || 
            ((state) => Object.assign([],state,measuredPos(that.axisPos)));
        var separation = options.separation || 1; // stay out of deadband
        return Array(nExamples).fill().map((na,iEx) => {
            if (iEx === 0) {
                that.axisPos = that.drives.map((d) => d.minPos);
            } else {
                do {
                    var axisPos = vars.map((v) => v.sample());
                    var distance = mathjs.min(mathjs.abs(mathjs.subtract(axisPos,that.axisPos)));
                } while(distance < separation);
                that.axisPos = axisPos;
            }
            return new Example(that.state, targetState(that.state) 
            );
        });
    }
    DriveFrame.prototype.compile = function(options={}) {
        var that = this;
        var factory = new Factory(that.variables(options));
        return that.annMeasured = factory.createNetwork({
            preTrain: options.preTrain == null 
                ? false // pre-training decreeases accuracy with backlash
                : options.preTrain, 
        });
    }
    DriveFrame.prototype.calibrate = function(examples, options={}) {
        var that = this;
        var factory = new Factory(that.variables(options));
        that.annMeasured = that.annMeasured || that.compile(options);
        var trainResult = that.annMeasured.train(examples, options);
        options.onTrain && options.onTrain(trainResult);
        return that.annCalibrated = factory.inverseNetwork(that.annMeasured, options);
    }
    DriveFrame.prototype.calibratedStateOf = function(state) {
        var that = this;
        if (!that.annCalibrated) {
            throw new Error("DriveFrame is not calibrated");
        }
        state = state || that.state;
        return that.annCalibrated.activate(state);
    }
    DriveFrame.prototype.toAxisPos = function(motorPos) {
        var that = this;
        return motorPos.map((m,i) => that.drives[i].toAxisPos(m));
    }
    DriveFrame.prototype.toMotorPos = function(axisPos) {
        var that = this;
        return axisPos.map((a,i) => that.drives[i].toMotorPos(a));
    }
    DriveFrame.prototype.variables = function() {
        var that = this;
        var vars = that.drives.map( (d) => new Variable([d.minPos, d.maxPos]) )
        if (that.backlash) {
            var deadbandVars = that.drives.map( (d) => new Variable([-0.5,0.5]) )
            vars = vars.concat(deadbandVars);
        }
        return vars;
    }
    DriveFrame.prototype.createFactory = function(options={}) {
        var that = this;
        var nOut = that.drives.length;
        var opts = Object.assign({nOut:nOut}, options);
        var vars = that.variables();
        return new Factory(vars, opts);
    }

    module.exports = exports.DriveFrame = DriveFrame;
})(typeof exports === "object" ? exports : (exports = {}));
