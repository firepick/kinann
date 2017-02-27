var mathjs = require("mathjs");
var StepperDrive = require("./StepperDrive");
var Factory = require("./Factory");
var Variable = require("./Variable");
var Example = require("./Example");

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
    it("Train an ANN to ignore axisDir", function() {
        return;
        this.timeout(60 * 1000);
        var frame = new DriveFrame([belt300, belt200, screw]);
        var digits = 6;
        var vars = frame.variables(); // 3 axis positions
        var varsDir = frame.variables({axisDir:true}); // 3 axis positions + 3 axis directions
        var factory = new Factory(varsDir);
        var msStart = new Date();
        var trainExamples;
        var ann = factory.createNetwork({
            //nRandom: 50,
            preTrain: false,
            onExamples: (ex) => (trainExamples = ex),
        });
        console.log("train ms:"+(new Date() - msStart), "trainExamples:"+trainExamples.length);

        var nExamples = 30;
        var idealExamples = factory.createExamples({
            outline: false,
            nRandom: nExamples,
            transform: (data) => data.map((d,i) => (i < frame.axisPos.length ? d : 0)),
        });
        //console.log("idealExamples:", idealExamples.map((ex) => mathjs.round(ex.input, digits)) );
        var backlashExamples = Array(nExamples).fill().map(() => {
            var axisPos = vars.map((v) => v.sample());
            frame.axisPos = axisPos;
            return new Example(frame.state, frame.state.map((x,i) =>  {
                if (factory.vars[i].distribution === "discrete") {
                    return 0;
                } 
                return (frame.axisDir[i % frame.axisPos.length] < 0) ? x+1 : x;
            }));
        });
        var examples = backlashExamples;
        var input = examples[0].input;
        console.log("training");

        var msStart = new Date();
        var trainResult = ann.train(examples, {
            batch: 2,
        });
        console.log("done ms:", new Date() - msStart, trainResult);

        console.log("after training:");
        console.log( 
            ann.keys.reduce((acc,k) => ann.weights[k] < acc ? ann.weights[k] : acc,0),
            ann.keys.reduce((acc,k) => ann.weights[k] > acc ? ann.weights[k] : acc,0)
        );
        console.log(
            mathjs.round(input, digits),
            mathjs.round(ann.activate(input), digits)
        );
        for (var i=vars.length; i<varsDir.length; i++) {
            input[i] = -input[i];
            console.log(mathjs.round(input, digits),mathjs.round(ann.activate(input), digits));
        }
        trainResult.epochs.should.below(300);
    })
})
