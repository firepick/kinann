const mathjs = require("mathjs");
const StepperDrive = require("../src/StepperDrive");
const Factory = require("../src/Factory");
const Variable = require("../src/Variable");
const Example = require("../src/Example");
const Network = require("../src/Network");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("DriveFrame", function() {
    const winston = require("winston");
    const should = require("should");
    const DriveFrame = require("../src/DriveFrame");
    const BeltDrive = StepperDrive.BeltDrive;
    const ScrewDrive = StepperDrive.ScrewDrive;
    var sequence = function* (start,last,inc=1, it) {
        for (var v = start; inc<0 && v>=last || inc>0 && v<=last; v+=inc) {
            yield v;
        }
        it && (yield* it);
    }

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

    it("DriveFrame(drives) assigns default names to given drives", function() {
        var drives = [belt300, belt200, screw];
        var frame = new DriveFrame(drives);
        drives[0].name.should.equal("X");
        drives[1].name.should.equal("Y");
        drives[2].name.should.equal("Z");
    });
    it("DriveFrame(drives) creates a positionable drive collection", function() {
        var drives = [belt300, belt200, screw];
        var frame = new DriveFrame(drives);
        frame.drives.length.should.equal(drives.length);
        should.deepEqual(frame.axisPos, [null,null,null]);
        frame.homeSync();
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
        should.deepEqual(frame.axisPos, [null,null,null]);
        frame.homeSync();
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
    it("clearPos() sets position to be undefined", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        frame.axisPos = [1,2,3];
        should.deepEqual(frame.axisPos, [1,2,3]);
        frame.clearPos();
        should.deepEqual(frame.axisPos, [null,null,null]);
    });
    it("moveToSync(axisPos) moves to position (chainable)", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        frame.homeSync();
        should.deepEqual(frame.moveToSync([1000,-20,30]).axisPos, [300,-2,30]); // motion is restricted
        should.deepEqual(frame.moveToSync([null,0,3]).axisPos, [300,0,3]); // motion is restricted
    })
    it("moveTo(axisPos) returns a promise to moveToSync", function(done) {
        var frame = new DriveFrame([belt300, belt200, screw]);
        frame.homeSync();
        var promise = frame.moveTo([1000,-20,30]);
        should(promise).instanceOf(Promise);
        promise.then((result) => {
            should.strictEqual(result,frame);
            should.deepEqual(frame.axisPos, [300,-2,30]); // motion is restricted
            done();
        });
    });
    it("clipPosition() moves one or all drives to minimum position (chainable)", function() {
        DriveFrame.clipPosition(0, -10, 10).should.equal(0);
        DriveFrame.clipPosition(-100, -10, 10).should.equal(-10);
        DriveFrame.clipPosition(100, -10, 10).should.equal(10);
        should.deepEqual(DriveFrame.clipPosition(null, -10, 10), null);
        should.deepEqual(DriveFrame.clipPosition(null, 0, 10), null);
    })
    it("homeSync() moves one or all drives to minimum position (chainable)", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.axisPos, [null,null,null]);
        frame.homeSync({axis:0}).should.equal(frame);
        should.deepEqual(frame.axisPos, [-1,null,null]);
        frame.homeSync({axis:1}).should.equal(frame);
        should.deepEqual(frame.axisPos, [-1,-2,null]);
        should.throws(() => frame.homeSync({axis:-1}));
        frame.homeSync();
        frame.axisPos = [10,20,30];
        should.deepEqual(frame.homeSync().state,[
            -1,-2,-3,0.5,0.5,0.5,
        ]);
    })
    it("home() returns a promise that resolves when homed", function(done) {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.axisPos, [null,null,null]);
        var promise = frame.home({axis:0, homeTimeout:1});
        should(promise).instanceOf(Promise);
        promise.then((obj) => {
            should.strictEqual(obj, frame);
            should.deepEqual(frame.axisPos, [-1,null,null]);
            done();
        });
        // DriveFrame subclasses should pass this test
    })
    it("deadband is backlash property that varies between -0.5 and 0.5", function() {
        var frame = new DriveFrame([belt300, belt200, screw], {
            deadbandScale: 1
        });
        frame.homeSync();
        should.deepEqual(frame.axisPos, [-1,-2,-3]); // homeSync
        should.deepEqual(frame.deadband, [0.5,0.5,0.5]); // homeSync

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
        frame.homeSync();
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
    it("basisVariables() returns neural network input basisVariables", function() {
        var drives = [belt300, belt200, screw];

        // with backlash disabled, basisVariables are motion axes
        var frame = new DriveFrame(drives, {backlash: false});
        should.deepEqual(frame.basisVariables(), [
            new Variable([-1,300]), // belt300 motion axis x
            new Variable([-2,200]), // belt200 motion axis y
            new Variable([-3,100]), // screw motion axis z
        ]);

        // default variables track backlash with deadband variables
        var frame = new DriveFrame(drives);
        should.deepEqual(frame.basisVariables(), [
            new Variable([-1,300]), // belt300 motion axis x
            new Variable([-2,200]), // belt200 motion axis y
            new Variable([-3,100]), // screw motion axis z
            new Variable([-0.5,0.5]), // x deadband variable
            new Variable([-0.5,0.5]), // y deadband variable
            new Variable([-0.5,0.5]), // z deadband variable
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
})
