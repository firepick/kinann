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

        Object.defineProperty(that, "$axisDir", {
            value: drives.map((d) => 1),
            writable: true,
        });
        Object.defineProperty(that, "axisDir", {
            get: () => that.$axisDir,
            enumerable: true,
        });
        Object.defineProperty(that, "$axisPos", {
            value: drives.map((d) => d.minPos),
            writable: true,
        });
        Object.defineProperty(that, "axisPos", {
            enumerable: true,
            get: () => that.$axisPos,
            set: (axisPos) => {
                if (!(axisPos instanceof Array) || axisPos.length !== that.drives.length) {
                    throw new Error("Expected axisPos array of length:"+that.drives.length);
                }
                axisPos = axisPos.map((p,i) => p < that.drives[i].minPos 
                    ? that.drives[i].minPos
                    : (that.drives[i].maxPos < p ? that.drives[i].maxPos : p));
                that.$axisDir = that.$axisPos.map((pos,i) => {
                    if (pos === axisPos[i]) {
                        return that.$axisDir[i];
                    }
                    return (axisPos[i] < pos) ? -1 : 1;
                });
                return that.$axisPos = axisPos.map((p) => p);
            },
        });
        Object.defineProperty(that, "state", {
            get: () => that.axisPos.concat(that.$axisDir),
        });

        options.axisPos && (that.axisPos = options.axisPos);
        options.axisDir && (that.$axisDir = options.axisDir);

        return that;
    }
    DriveFrame.fromJSON = function(json) {
        json = typeof json === "string" ? JSON.parse(json) : json;
        var drives = json.drives.map((d) => StepperDrive.fromJSON(d));
        return new DriveFrame(drives, json);
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
        return that;
        var obj = Object.assign({}, that);
        var obj = {
            type: "DriveFrame",
            axisPos: that.axisPos,
            axisDir: that.$axisDir,
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
    })
    it("state is non-enumerable kinematic state, which includes motion direction", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.state, [-1,-2,-3,1,1,1]);
        frame.axisPos = [1,2,3];
        should.deepEqual(frame.state, [1,2,3,1,1,1]);
        frame.axisPos = [0,2,3];
        should.deepEqual(frame.state, [0,2,3,-1,1,1]);
        frame.axisPos = [1,0,2];
        should.deepEqual(frame.state, [1,0,2,1,-1,-1]);
    })
    it("DriveFrame.fromJSON(json).toJSON() are used to (de-)serializes DriveFrame", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        frame.axisPos = [10,2,30];
        frame.axisPos = [1,2,3];
        var json = JSON.stringify(frame);
        var frame2 = DriveFrame.fromJSON(json);
        frame2.should.instanceOf(DriveFrame);
        should.deepEqual(frame2, frame);
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
        this.timeout(60 * 1000);
        var frame = new DriveFrame([belt300, belt200, screw]);
        //var frame = new DriveFrame([belt300, belt200]);
        //var frame = new DriveFrame([belt300]);
        var vars = frame.variables(); // 3 axis positions
        var varsDir = frame.variables({axisDir:true}); // 3 axis positions + 3 axis directions
        var factory = new Factory(varsDir, {
            //nOut: vars.length, // inputs:6, outputs: 3
        });
        var msStart = new Date();
        var trainExamples;
        var ann = factory.createNetwork({
            //nRandom: 50,
            preTrain: false,
            onExamples: (ex) => (trainExamples = ex),
        });
        console.log("train ms:"+(new Date() - msStart), "trainExamples:"+trainExamples.length);

        var nExamples = 30;
        var examples = Array(nExamples).fill().map(() => {
            var axisPos = vars.map((v) => v.sample());
            frame.axisPos = axisPos;
            //return new Example(frame.state, frame.axisPos);
            return new Example(frame.state, frame.state.map((x,i) => 
                factory.vars[i].distribution === "discrete" ? 0 : x
            ));
        });
        var input = examples[0].input;
        console.log("training");

        var digits = 6;
        console.log(mathjs.round(input, digits),mathjs.round(ann.activate(input), digits));
        for (var i=vars.length; i<varsDir.length; i++) {
            input[i] = -input[i];
            console.log(mathjs.round(input, digits),mathjs.round(ann.activate(input), digits));
        }

        if (true) {
            var msStart = new Date();
            var trainResult = ann.train(examples, {
                batch: 2,
            });
            console.log("done ms:", new Date() - msStart, trainResult);

            console.log( 
                Object.keys(ann.weights).reduce((acc,k) => ann.weights[k] < acc ? ann.weights[k] : acc,0),
                Object.keys(ann.weights).reduce((acc,k) => ann.weights[k] > acc ? ann.weights[k] : acc,0)
            );
            console.log(mathjs.round(input, digits),mathjs.round(ann.activate(input), digits));
            for (var i=vars.length; i<varsDir.length; i++) {
                input[i] = -input[i];
                console.log(mathjs.round(input, digits),mathjs.round(ann.activate(input), digits));
            }
        }
    })
})
