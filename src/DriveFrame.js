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
        return frame;
    }

    //// INSTANCE
    DriveFrame.prototype.calibrationExamples = function(nExamples=30, options={}) {
        var that = this;
        var vars = that.variables().slice(0, that.drives.length);
        var targetState = options.targetState || ((state) => state);
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
            return new Example(that.state, targetState(that.state));
        });
    }
    DriveFrame.prototype.compile = function(options={}) {
        var that = this;
        var factory = new Factory(that.variables(options));
        return that.annMeasured = factory.createNetwork({
            preTrain: options.preTrain == null ? false : options.preTrain, // pre-training decreeases accuracy with backlash
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
    DriveFrame.prototype.calibratedState = function(state) {
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
    DriveFrame.prototype.toJSON = function() {
        var that = this;
        var obj = Object.assign({}, that);
        var obj = {
            type: "DriveFrame",
            state: that.state,
            axisPos: that.axisPos,
            backlash: that.backlash,
            drives: that.drives.map((d) => d.toJSON()),
        }
        return obj;
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
    })
    it("deadband is backlash property that varies between -0.5 and 0.5", function() {
        var frame = new DriveFrame([belt300, belt200, screw], {
            deadbandScale: 1,
            backlash:true
        });
        should.deepEqual(frame.axisPos, [-1,-2,-3]); // home
        should.deepEqual(frame.deadband, [0.5,0.5,0.5]); // home

        // move outside deadband
        frame.axisPos = mathjs.add(frame.axisPos, [10,10,10]); // large covariant movement sets deadband limit
        should.deepEqual(frame.deadband, [0.5,0.5,0.5]); 
        frame.axisPos = mathjs.add(frame.axisPos, [-5,-5,-5]); // large contravariant movement sets deadband to opposite limit
        should.deepEqual(mathjs.round(frame.deadband,3), [-0.5,-0.5,-0.5]);

        // move inside deadband
        frame.axisPos = mathjs.add(frame.axisPos, [0.1,0.1,0.1]); // small contravariant movement reduces backlash
        should.deepEqual(mathjs.round(frame.deadband,3), [-0.4,-0.4,-0.4]);
        frame.axisPos = mathjs.add(frame.axisPos, [0.1,0.1,0.1]); // small covariant movement increases backlash
        should.deepEqual(mathjs.round(frame.deadband,3), [-0.301,-0.301,-0.301]);
        frame.axisPos = mathjs.add(frame.axisPos, [-0.1,-0.1,-0.1]); // small contravariant movement reduces backlash
        should.deepEqual(mathjs.round(frame.deadband,3), [-0.4,-0.4,-0.4]);
        
        // move outside deadband
        frame.axisPos = mathjs.add(frame.axisPos, [5,5,5]); // large movement sets deadband to limit
        should.deepEqual(frame.deadband, [0.5,0.5,0.5]); 

        // go home
        frame.axisPos = mathjs.add(frame.axisPos, [10,10,10]); // large covariant movement should not change 
        should.deepEqual(frame.deadband, [0.5,0.5,0.5]); 
    })
    it("state is kinematic state, which includes deadband position", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.state, [-1,-2,-3,0.5,0.5,0.5]);
        frame.axisPos = [10,20,30];
        var state123 = mathjs.round(frame.state,5);
        frame.axisPos = [0,20,30];
        var state023 = mathjs.round(frame.state,5);
        should.deepEqual(state023, [0,20,30,-0.5,0.5,0.5]);
        frame.axisPos = [10,0,20];
        var state102 = mathjs.round(frame.state,5);
        should.deepEqual(state123, [10,20,30,0.5,0.5,0.5]);
        should.deepEqual(state023, [0,20,30,-0.5,0.5,0.5]);
        should.deepEqual(state102, [10,0,20,0.5,-0.5,-0.5]);
        should.deepEqual(mathjs.round(frame.state,5), state102);

        // restore prior state
        frame.state = state123;
        should.deepEqual(mathjs.round(frame.state,5), state123);
        frame.axisPos = [0,20,30];
        should.deepEqual(mathjs.round(frame.state,5), state023);
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
        should.deepEqual(frame2.state, [300,200,100,0.5,0.5,0.5]);
    })
    it("variables() returns neural network input variables", function() {
        var drives = [belt300, belt200, screw];

        // default variables are motion axes
        var frame = new DriveFrame(drives, {backlash: false});
        should.deepEqual(frame.variables(), [
            new Variable([-1,300]),
            new Variable([-2,200]),
            new Variable([-3,100]),
        ]);

        // tracking backlash requires deadband variables
        var frame = new DriveFrame(drives, {
            backlash: true,
        });
        should.deepEqual(frame.variables(), [
            new Variable([-1,300]),
            new Variable([-2,200]),
            new Variable([-3,100]),
            new Variable([-0.5,0.5]),
            new Variable([-0.5,0.5]),
            new Variable([-0.5,0.5]),
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
            driveFrame.deadband.map((d,i) => driveFrame.axisPos[i] + (d < 0 ? 1 : 0)); 
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
        should.deepEqual(examples[0].input, [-1,-2,-3,0.5,0.5,0.5]); // home
        should.deepEqual(examples[0].target, [-1,-2,-3,0.5,0.5,0.5]);
        var last = examples.length - 1;
        should.deepEqual(examples[last].input, frame.state); 
        frame.axisPos.map((p,i) => p.should.above(frame.drives[i].minPos)); // not home

        // build custom examples with targetState option
        var examples = frame.calibrationExamples(5, {
            targetState: ((state) => state.map((v,i) => v+i)),
        });
        should.deepEqual(examples[0].input, [-1,-2,-3,0.5,0.5,0.5]); // home
        examples.forEach((ex) => 
            ex.target.forEach((vtarg,j) => vtarg.should.equal(ex.input[j]+j))
        );
    })
    it("calibrate(examples) trains DriveFrame to handle backlash", function() {
        this.timeout(60 * 1000);
        var drives = [belt300, belt200, screw];
        var frame = new DriveFrame(drives, {
            backlash: true,
        });

        // compiling the frame saves about 1 second
        var annMeasured = frame.compile();

        // create calibration examples having backlash on x and y axes
        var trainEx = frame.calibrationExamples(80);
        var measuredState = (state) => // simulate physical measurement of actual position
            state.map((v,i) => 2 <= i ? v : (state[i+drives.length] < 0 ? v+1 : v));

        // update each training example with measured position
        trainEx.forEach((ex) => ex.target = measuredState(ex.target));

        // calibration training takes ~2 seconds
        var msStart = new Date();
        var calibrateResult = [];
        var annCalibrated = frame.calibrate(trainEx, {
            onTrain: (result) => calibrateResult.push(result), // will be called twice (annMeasured+annCalibrated),
            //onEpoch: (result) => (result.epochs % 50) == 0 && console.log("onEpoch:"+JSON.stringify(result)),
        });
        //console.log("calibrate ms:", new Date() - msStart, calibrateResult); 

        // calibratedState(state?) returns state required to match given state
        // In this example, moving forward requires no correction (i.e., calibratedState=[10,10,10,...]).
        // However, moving backward requires a correction (i.e., calibratedState=[9,9,9,...] vs. [10,10,10,...])
        // In both cases, the DriveFrame always tracks nominal position as its current state (i.e., [10,10,10,...])
        // By moving the robot to the calibrated state position [9,9,9,...], we make sure that the robot
        // position is where we expect it (i.e., [10,10,10,...]
        should.deepEqual(mathjs.round(frame.calibratedState([10,10,10,0.5,0.5,0.5]),2), [10,10,10,0.5,0.5,0.5]);
        frame.state = [10,10,10,-0.5,-0.5,-0.5]; // calibratedState will use current state by default
        should.deepEqual(mathjs.round(frame.calibratedState(),2), [9,9,10,-0.5,-0.5,-0.5]);

        // move within the deadband
        frame.state = [9,9,9,0.5,0.5,0.5]; // calibratedState will use current state by default
        for (var pos=9; pos < 11; pos += 0.1) {
            var posReverseAt10 = pos < 10 ? pos : pos - 10;
            frame.axisPos = [
                pos,
                pos < 10 ? pos : (10 - (pos - 10)),
                pos < 10 ? pos : (10 - (pos - 10)),
            ]
            console.log("state:", JSON.stringify(mathjs.round(frame.calibratedState(),2)));
        }
        //frame.axisPos = mathjs.add(frame.axisPos, [0.1,-0.1,0.1]);
        //should.deepEqual(mathjs.round(frame.calibratedState(),2), [9.86,8.9,9.86,0.26,-0.5,0.26]);
        //frame.axisPos = mathjs.add(frame.axisPos, [0.1,-.1,0.1]);
        //should.deepEqual(mathjs.round(frame.calibratedState(),2), [10.2,8.8,10.2,0.5,-0.5,0.5]);
        //frame.axisPos = mathjs.add(frame.axisPos, [0.1,-.1,-.1]);
        //should.deepEqual(mathjs.round(frame.calibratedState(),2), [10.3,8.7,9.34,0.5,-0.5,-0.26]);
        //frame.axisPos = mathjs.add(frame.axisPos, [0.1,-.1,-.1]);
        //should.deepEqual(mathjs.round(frame.calibratedState(),2), [10.4,8.6,9,0.5,-0.5,-0.5]);
    })
})
