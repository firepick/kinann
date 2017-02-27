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

        Object.defineProperty(that, "axisDir", {
            enumerable: true,
            get: () => that.state.slice(that.drives.length).map((p) => p),
            set: (axisDir) => {throw new Error("attempt to set read-only property: axisDir")},
        });
        Object.defineProperty(that, "axisPos", {
            enumerable: true,
            get: () => that.state.slice(0, that.drives.length),
            set: (axisPos) => {
                if (!(axisPos instanceof Array) || axisPos.length !== that.drives.length) {
                    throw new Error("Expected axisPos array of length:"+that.drives.length);
                }
                return axisPos.map((p,i) => {
                    var di = that.drives[i];
                    var pos = mathjs.min(mathjs.max(di.minPos,p), di.maxPos);
                    if (that.state[i] === pos) {
                        var dir = that.axisDir[i];
                    } else if (pos === di.minPos) {
                        var dir = 1; // homing to minPos
                    } else {
                        var dir = (pos < that.state[i]) ? -1 : 1;
                    }
                    that.$state[i+that.drives.length] = dir;
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
            .concat(that.drives.map((d) => 1)));

        return that;
    }
    DriveFrame.fromJSON = function(json) {
        json = typeof json === "string" ? JSON.parse(json) : json;
        var drives = json.drives.map((d) => StepperDrive.fromJSON(d));
        var frame = new DriveFrame(drives, json);
        return frame;
    }

    //// INSTANCE
    DriveFrame.prototype.calibrationExamples = function(nExamples=30, options={}) {
        var that = this;
        var vars = that.variables();
        var targetState = options.targetState || ((state) => state);
        return Array(nExamples).fill().map((na,iEx) => {
            if (iEx === 0) {
                that.axisPos = that.drives.map((d) => d.minPos);
            } else {
                that.axisPos = vars.map((v) => v.sample());
            }
            return new Example(that.state, targetState(that.state));
        });
    }
    DriveFrame.prototype.toAxisPos = function(motorPos) {
        var that = this;
        return motorPos.map((m,i) => that.drives[i].toAxisPos(m));
    }
    DriveFrame.prototype.toMotorPos = function(axisPos) {
        var that = this;
        return axisPos.map((a,i) => that.drives[i].toMotorPos(a));
    }
    DriveFrame.prototype.toJSON = function() {
        var that = this;
        var obj = Object.assign({}, that);
        var obj = {
            type: "DriveFrame",
            state: that.state,
            axisPos: that.axisPos,
            axisDir: that.axisDir,
            drives: that.drives.map((d) => d.toJSON()),
        }
        return obj;
    }
    DriveFrame.prototype.variables = function(options={}) {
        var that = this;
        var dirVar = new Variable([-1,1], Variable.DISCRETE);
        var vars = that.drives.map( (d) => new Variable([d.minPos, d.maxPos]) )
        if (options.axisDir) {
            vars = vars.concat(that.drives.map( (d) => dirVar ));
        }
        return vars;
    }
    DriveFrame.prototype.createFactory = function(options={}) {
        var that = this;
        var nOut = that.drives.length;
        var opts = Object.assign({nOut:nOut}, options);
        var vars = that.variables(opts);
        return new Factory(vars, opts);
    }

    module.exports = exports.DriveFrame = DriveFrame;
})(typeof exports === "object" ? exports : (exports = {}));

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("DriveFrame", function() {
    var should = require("should");
    var DriveFrame = exports.DriveFrame;
    var StepperDrive = require("./StepperDrive");
    var BeltDrive = StepperDrive.BeltDrive;
    var ScrewDrive = StepperDrive.ScrewDrive;

    var belt300 = new BeltDrive({
        minPos: -1,
        maxPos: 300,
        teeth: 20,
    });
    var belt200 = new BeltDrive({
        minPos: -2,
        maxPos: 200,
    });
    var screw = new ScrewDrive({
        minPos: -3,
        lead: 1,
    });

    it("DriveFrame(drives) creates a positionable drive collection", function() {
        var drives = [belt300, belt200, screw];
        var frame = new DriveFrame(drives);
        frame.drives.length.should.equal(drives.length);
        should.deepEqual(frame.axisPos, [-1,-2,-3]);
    });
    it("toAxisPos(motorPos) transforms position vector", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.toAxisPos([1,2,3]), [
            0.0125,
            0.02,
            0.0009375,
        ]);
        should.deepEqual(frame.toAxisPos([10,20,30]), [
            0.125,
            0.2,
            0.009375,
        ]);
        should.deepEqual(frame.toMotorPos([0.125,0.2,0.0009375]), [
            10,20,3,
        ]);
    })
    it("axisPos is position property", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.axisPos, [-1,-2,-3]);
        frame.axisPos = [1,2,3];
        should.deepEqual(frame.axisPos, [1,2,3]);
        frame.axisPos = [0,2,3];
        should.deepEqual(frame.axisPos, [0,2,3]);
        frame.axisPos = [1,0,2];
        should.deepEqual(frame.axisPos, [1,0,2]);

        // only valid positions are allowed
        frame.axisPos = [1000,-1000,1000];
        should.deepEqual(frame.axisPos, [300,-2,100]);
        frame.axisPos = [-1000,1000,-1000];
        should.deepEqual(frame.axisPos, [-1,200,-3]);

        // setting any axis position to its minimum changes the corresponding axis direction to 1 (homing)
        frame.axisPos = [belt300.minPos,belt200.minPos,screw.minPos];
        should.deepEqual(frame.axisDir, [1,1,1]);
    })
    it("state is kinematic state, which includes motion direction", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.state, [-1,-2,-3,1,1,1]);
        frame.axisPos = [1,2,3];
        var state123 = frame.state;
        frame.axisPos = [0,2,3];
        var state023 = frame.state;
        should.deepEqual(state023, [0,2,3,-1,1,1]);
        frame.axisPos = [1,0,2];
        var state102 = frame.state;
        should.deepEqual(state123, [1,2,3,1,1,1]);
        should.deepEqual(state023, [0,2,3,-1,1,1]);
        should.deepEqual(state102, [1,0,2,1,-1,-1]);
        should.deepEqual(frame.state, state102);

        // restore prior state
        frame.state = state123;
        should.deepEqual(frame.state, state123);
        frame.axisPos = [0,2,3];
        should.deepEqual(frame.state, state023);
    })
    it("DriveFrame.fromJSON(json).toJSON() are used to (de-)serializes DriveFrame", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        frame.axisPos = [10,2,30];
        frame.axisPos = [1,2,3];
        var json = JSON.stringify(frame);
        var frame2 = DriveFrame.fromJSON(json);
        frame2.should.instanceOf(DriveFrame);
        should.deepEqual(frame2.state, frame.state);
        should.deepEqual(frame2.state, frame.state);
        frame2.axisPos = [1000,1000,1000];
        should.deepEqual(frame2.state, [300,200,100,1,1,1]);
    })
    it("variables(options?) returns neural network input variables", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);

        // default variables are motion axes
        should.deepEqual(frame.variables(), [
            new Variable([-1,300]),
            new Variable([-2,200]),
            new Variable([-3,100]),
        ]);

        // axisDir variables help with backlash compensation
        should.deepEqual(frame.variables({axisDir:true}), [
            new Variable([-1,300]),
            new Variable([-2,200]),
            new Variable([-3,100]),
            new Variable([-1,1], Variable.DISCRETE),
            new Variable([-1,1], Variable.DISCRETE),
            new Variable([-1,1], Variable.DISCRETE),
        ]);
    })
    it("output property provides customizable application output", function() {
        var drives = [belt300, belt200, screw];
        var c3 = new DriveFrame(drives);

        // Default output is simply axisPos
        c3.axisPos = [10,11,12];
        should.deepEqual(c3.output, [10,11,12]);
        c3.axisPos = [0,11,12];
        should.deepEqual(c3.output, [0,11,12]); // no backlash

        // change outputTransform to emulate 3-axis Cartesian with backlash
        var backlash = (driveFrame) => 
            driveFrame.axisDir.map((d,i) => driveFrame.axisPos[i] + (d < 0 ? 1 : 0)); 
        var c3Backlash = new DriveFrame(drives, {
            outputTransform: backlash,
        });
        c3Backlash.axisPos = [10,11,12];
        should.deepEqual(c3Backlash.output, [10,11,12]);
        c3Backlash.axisPos = [0,11,12];
        should.deepEqual(c3Backlash.output, [1,11,12]); // backlash position
        should.deepEqual(c3Backlash.axisPos, [0,11,12]); // control position 
        c3Backlash.axisPos = [5,11,12];
        should.deepEqual(c3Backlash.output, [5,11,12]); // backlash position
        should.deepEqual(c3Backlash.axisPos, [5,11,12]); // control position 
    })
    it("calibrationExamples(nExamples) builds calibration random walk examples", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);

        // more examples yield higher accuracy
        var examples = frame.calibrationExamples();
        examples.length.should.equal(30); 
        var examples = frame.calibrationExamples(10);
        examples.length.should.equal(10); 

        // examples always start with home
        should.deepEqual(examples[0].input, [-1,-2,-3,1,1,1]); // home
        should.deepEqual(examples[0].target, [-1,-2,-3,1,1,1]);
        var last = examples.length - 1;
        should.deepEqual(examples[last].input, frame.state); 
        frame.axisPos.map((p,i) => p.should.above(frame.drives[i].minPos)); // not home

        // build custom examples with targetState option
        var examples = frame.calibrationExamples(5, {
            targetState: ((state) => state.map((v,i) => v+i)),
        });
        should.deepEqual(examples[0].input, [-1,-2,-3,1,1,1]); // home
        examples.forEach((ex) => 
            ex.input.forEach((vin,j) => vin.should.equal(ex.target[j]-j))
        );
    })
    it("Train an ANN to emulate 3-axis Cartesian robot with backlash", function() {
        this.timeout(60 * 1000);
        var drives = [belt300, belt200, screw];
        var frame = new DriveFrame(drives);

        var varsDir = frame.variables({axisDir:true}); // 3 axis positions + 3 axis directions
        var annPretrain = new Factory(varsDir).createNetwork();
        var preTrainJson = JSON.stringify(annPretrain);

        var msStart = new Date();
        var ann = Network.fromJSON(preTrainJson);
        var backlashOpts = {
            targetState: (state) => state.map((v,i) => (
                3 <= i ? v : (state[i+drives.length] < 0 ? v+1 : v)
            ))
        };
        var trainEx = frame.calibrationExamples(80, backlashOpts);
        var trainResult = ann.train(trainEx );
        //console.log("training ms:", new Date() - msStart, trainResult);
        trainResult.epochs.should.below(100);

        var testEx = frame.calibrationExamples(50, backlashOpts);
        testEx.forEach((ex) => 
            ann.activate(ex.input).map((v,i) =>
                v.should.approximately(ex.target[i],0.005)
            )
        );
    })
})
